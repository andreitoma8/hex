import type { ParsedContract } from '../parsers/solidity-parser.js';
import type { SlitherFunctionSummary } from '../parsers/slither.js';
import type { StorageLayout } from '../parsers/solc.js';
import type { StateVariable } from '../types/index.js';
import { z } from 'zod';
import { StorageCollisionSchema } from '../core/schema.js';

export type StorageCollision = z.infer<typeof StorageCollisionSchema>;

/**
 * Extract state variables from parsed contracts, enriched with Slither and solc data.
 */
export function extractStateVariables(
  contracts: ParsedContract[],
  fileMap: Map<string, string>,
  slitherSummary: SlitherFunctionSummary[] | null,
  storageLayout: StorageLayout | null,
): {
  variables: StateVariable[];
  storageLayoutSource: 'compiler-artifact' | null;
  storageCollisions: StorageCollision[];
} {
  const variables: StateVariable[] = [];

  for (const contract of contracts) {
    const file = fileMap.get(contract.name) ?? '';

    for (const sv of contract.stateVariables) {
      // Build read/write tracking
      const { readers, writers } = getReadWriteInfo(
        contract.name,
        sv.name,
        slitherSummary,
      );

      // Check if variable has a dedicated setter
      const hasSetter = detectSetter(contract, sv.name);

      // Check if unused
      const isUnused = readers.length === 0 && writers.length === 0 && sv.mutability === 'mutable';

      // Get storage slot if available
      const slot = getStorageSlot(contract.name, sv.name, storageLayout);

      const variable: StateVariable = {
        contract: contract.name,
        name: sv.name,
        type: sv.typeName,
        visibility: sv.visibility,
        mutability: sv.mutability,
        evidence: {
          file,
          line_start: sv.lineStart,
          line_end: sv.lineEnd,
        },
        written_by: {
          functions: writers,
          confidence: slitherSummary ? 'medium' : 'low',
          derived_from: slitherSummary ? 'slither' : 'heuristic',
          warnings: slitherSummary
            ? ['Write detection based on data dependency analysis; indirect writes via assembly not tracked']
            : ['No Slither data available; write detection limited'],
        },
        read_by: {
          functions: readers,
          confidence: slitherSummary ? 'medium' : 'low',
          derived_from: slitherSummary ? 'slither' : 'heuristic',
        },
        has_setter: hasSetter,
        is_bounded: sv.mutability === 'constant' || sv.mutability === 'immutable',
        bound_description: sv.mutability === 'constant' && sv.initialValue
          ? `Constant: ${sv.initialValue}`
          : sv.mutability === 'immutable'
            ? 'Immutable: set at construction'
            : null,
        is_unused: isUnused || undefined,
        storage_slot: slot,
      };

      if (sv.mutability === 'constant' && sv.initialValue) {
        variable.value = sv.initialValue;
      }

      variables.push(variable);
    }
  }

  return {
    variables,
    storageLayoutSource: storageLayout && storageLayout.entries.length > 0 ? 'compiler-artifact' : null,
    storageCollisions: detectStorageCollisions(contracts, storageLayout),
  };
}

/**
 * Detect storage slot collisions.
 *
 * Two checks are performed:
 *   1. **Intra-contract:** the same (slot, offset) listed twice within a contract's
 *      layout — solc should never emit this, so a hit usually means the artifact
 *      was hand-edited or a build cache is stale.
 *   2. **Inheritance divergence:** a parent contract's slot 0..N has a different
 *      label than the child's at the same slot, which would mean the child
 *      overrode a parent's storage layout incompatibly. With well-formed solc
 *      output this should never fire; it catches manually packed layouts and
 *      upgrade-safety regressions.
 *
 * Each collision is recorded with a Critical severity so it surfaces on the
 * dashboard's attack-surface view.
 */
export function detectStorageCollisions(
  contracts: ParsedContract[],
  storageLayout: StorageLayout | null,
): StorageCollision[] {
  if (!storageLayout || storageLayout.entries.length === 0) return [];

  const collisions: StorageCollision[] = [];

  // 1. Intra-contract duplicate (slot, offset)
  const byContract = new Map<string, typeof storageLayout.entries>();
  for (const entry of storageLayout.entries) {
    if (!byContract.has(entry.contract)) byContract.set(entry.contract, []);
    byContract.get(entry.contract)!.push(entry);
  }
  for (const [contract, entries] of byContract) {
    const seen = new Map<string, typeof entries[number][]>();
    for (const entry of entries) {
      const key = `${entry.slot}:${entry.offset}`;
      if (!seen.has(key)) seen.set(key, []);
      seen.get(key)!.push(entry);
    }
    for (const [, group] of seen) {
      if (group.length < 2) continue;
      collisions.push({
        slot: group[0].slot,
        offset: group[0].offset,
        variables: group.map((e) => ({ contract, name: e.label, type: e.type })),
        severity: 'Critical',
        description: `${contract} has ${group.length} variables sharing slot ${group[0].slot}@${group[0].offset}. ` +
          `Storage layouts emitted by solc should never collide within a single contract; this almost certainly indicates a stale build artifact or manually packed storage that bypasses the layout planner.`,
      });
    }
  }

  // 2. Inheritance divergence — child slot N should match parent slot N if defined.
  const contractMap = new Map<string, ParsedContract>();
  for (const c of contracts) contractMap.set(c.name, c);

  for (const [childName, childEntries] of byContract) {
    const child = contractMap.get(childName);
    if (!child || child.baseContracts.length === 0) continue;
    const childBySlot = new Map<number, typeof childEntries[number]>();
    for (const e of childEntries) childBySlot.set(e.slot, e);

    for (const parentName of child.baseContracts) {
      const parentEntries = byContract.get(parentName);
      if (!parentEntries) continue;
      for (const parentEntry of parentEntries) {
        const childEntry = childBySlot.get(parentEntry.slot);
        if (!childEntry) continue;
        if (
          childEntry.label !== parentEntry.label ||
          childEntry.type !== parentEntry.type ||
          childEntry.offset !== parentEntry.offset
        ) {
          collisions.push({
            slot: parentEntry.slot,
            offset: parentEntry.offset,
            variables: [
              { contract: parentName, name: parentEntry.label, type: parentEntry.type },
              { contract: childName, name: childEntry.label, type: childEntry.type },
            ],
            severity: 'Critical',
            description: `Inheritance storage divergence at slot ${parentEntry.slot}: ${parentName} stores ` +
              `\`${parentEntry.label}: ${parentEntry.type}\` while ${childName} stores ` +
              `\`${childEntry.label}: ${childEntry.type}\`. For upgradeable contracts this would brick the proxy. ` +
              `Confirm the child preserves the parent's storage layout, or document the deliberate repack.`,
          });
        }
      }
    }
  }

  return collisions;
}

function getReadWriteInfo(
  contractName: string,
  varName: string,
  slitherSummary: SlitherFunctionSummary[] | null,
): { readers: string[]; writers: string[] } {
  if (!slitherSummary) return { readers: [], writers: [] };

  const readers: string[] = [];
  const writers: string[] = [];

  for (const func of slitherSummary) {
    if (func.contract !== contractName) continue;
    if (func.readVars.includes(varName)) readers.push(func.function);
    if (func.writeVars.includes(varName)) writers.push(func.function);
  }

  return { readers: [...new Set(readers)], writers: [...new Set(writers)] };
}

function detectSetter(contract: ParsedContract, varName: string): boolean {
  // Heuristic: look for external/public functions named set<VarName>
  const setterPattern = `set${varName.charAt(0).toUpperCase()}${varName.slice(1)}`;
  return contract.functions.some(
    (f) =>
      (f.visibility === 'external' || f.visibility === 'public') &&
      (f.name === setterPattern || f.name === `update${varName.charAt(0).toUpperCase()}${varName.slice(1)}`),
  );
}

function getStorageSlot(
  contractName: string,
  varName: string,
  storageLayout: StorageLayout | null,
): number | null {
  if (!storageLayout) return null;
  const entry = storageLayout.entries.find(
    (e) => e.contract === contractName && e.label === varName,
  );
  return entry?.slot ?? null;
}
