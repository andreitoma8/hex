import type { ParsedContract } from '../parsers/solidity-parser.js';
import type { SlitherFunctionSummary } from '../parsers/slither.js';
import type { StorageLayout } from '../parsers/solc.js';
import type { StateVariable } from '../types/index.js';

/**
 * Extract state variables from parsed contracts, enriched with Slither and solc data.
 */
export function extractStateVariables(
  contracts: ParsedContract[],
  fileMap: Map<string, string>,
  slitherSummary: SlitherFunctionSummary[] | null,
  storageLayout: StorageLayout | null,
): { variables: StateVariable[]; storageLayoutSource: 'compiler-artifact' | null } {
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
  };
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
