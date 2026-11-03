/**
 * Parser fallback for when the project does not compile: the same Facts shape,
 * approximated from `@solidity-parser/parser` (src/analysis/code-model.ts).
 * Calls are resolved by name within the inheritance chain, so they are close
 * but not exact; the storage layout follows declaration order without packing.
 * `source: "parser-fallback"` tells every consumer to treat it accordingly.
 */
import { ancestorsOf, buildScopeModel, type ContractModel } from '../analysis/code-model.js';
import { buildImpactIndex, unitId } from '../analysis/diff.js';
import type { Facts, FactsContract, FactsFunction } from '../types/index.js';

export function factsFromSources(
  sources: Map<string, string>,
  opts: { inScope: (file: string) => boolean; commit?: string; reason?: string },
): Facts {
  const models = buildScopeModel(sources);
  const index = buildImpactIndex(models);
  const byName = index.contracts;

  const contracts: FactsContract[] = [];
  for (const c of byName.values()) {
    contracts.push({
      name: c.name,
      kind: c.kind === 'free' ? 'library' : c.kind,
      file: c.file,
      line_start: c.lineStart,
      line_end: c.lineEnd,
      bases: c.bases,
      linearization: [c.name, ...ancestorsOf(c.name, byName)],
      in_scope: opts.inScope(c.file),
    });
  }

  // State var name → declaring contract, per contract's hierarchy.
  const varOwner = (cname: string, v: string): string | null => {
    for (const anc of [cname, ...ancestorsOf(cname, byName)]) {
      if (byName.get(anc)?.stateVars.some((s) => s.name === v)) return `${anc}.${v}`;
    }
    return null;
  };

  const functions = new Map<string, FactsFunction>();
  for (const [id, u] of index.units) {
    const c: ContractModel | undefined = byName.get(u.contract);
    const file = index.unitFile.get(id) ?? '';
    const kind: FactsFunction['kind'] =
      u.kind === 'modifier'
        ? 'modifier'
        : u.isConstructor
          ? 'constructor'
          : u.isFallback
            ? 'fallback'
            : u.isReceive
              ? 'receive'
              : 'function';
    const exposed =
      u.visibility === 'external' || u.visibility === 'public' || u.isFallback || u.isReceive;
    functions.set(id, {
      id,
      contract: u.contract,
      name: u.name,
      signature: u.signature,
      kind,
      visibility: u.visibility,
      mutability: u.stateMutability ?? 'nonpayable',
      file,
      line_start: u.lineStart,
      line_end: u.lineEnd,
      nsloc: u.raw.split('\n').filter((l) => l.trim() && !l.trim().startsWith('//')).length,
      virtual: false,
      overrides: [],
      modifiers: [],
      calls: [],
      called_by: [],
      external_calls: u.calls
        .filter((r) => r.kind === 'typed' || r.kind === 'member')
        .map((r) => ({
          target_type: r.target ?? 'unknown',
          member: r.name,
          kind: 'typed' as const,
          line: u.lineStart,
        })),
      reads: u.reads.map((v) => varOwner(u.contract, v)).filter((x): x is string => !!x),
      writes: u.writes.map((v) => varOwner(u.contract, v)).filter((x): x is string => !!x),
      emits: [],
      is_entry_point:
        kind !== 'modifier' && exposed && (c?.kind === 'contract' || c?.kind === 'abstract'),
      in_scope: opts.inScope(file),
    });
  }
  for (const [callee, edges] of index.callersOf) {
    for (const e of edges) {
      const from = functions.get(e.caller);
      if (!from) continue;
      const kind =
        e.kind === 'modifier' ? 'modifier' : e.kind === 'override' ? 'virtual' : 'internal';
      from.calls.push({ to: callee, kind });
      if (kind === 'modifier') from.modifiers.push(callee);
      functions.get(callee)?.called_by.push({ from: e.caller, kind });
    }
  }

  const state_vars: Facts['state_vars'] = [];
  const storage_layouts: Facts['storage_layouts'] = {};
  for (const c of byName.values()) {
    for (const v of c.stateVars) {
      state_vars.push({
        id: `${c.name}.${v.name}`,
        contract: c.name,
        name: v.name,
        type: v.type,
        mutability: v.mutability,
        visibility: v.visibility,
        file: c.file,
        line: v.lineStart,
      });
    }
    if (c.kind === 'contract' && opts.inScope(c.file)) {
      let slot = 0;
      storage_layouts[c.name] = [];
      for (const anc of [c.name, ...ancestorsOf(c.name, byName)].reverse()) {
        for (const v of byName.get(anc)?.stateVars ?? []) {
          if (v.mutability !== 'mutable') continue;
          storage_layouts[c.name].push({
            label: v.name,
            slot: String(slot++),
            offset: 0,
            type: v.type,
            declared_in: anc,
          });
        }
      }
    }
  }

  const entry_points: Facts['entry_points'] = {};
  for (const c of byName.values()) {
    if (c.kind !== 'contract' || !opts.inScope(c.file)) continue;
    const seen = new Map<string, string>();
    for (const anc of [c.name, ...ancestorsOf(c.name, byName)]) {
      for (const u of byName.get(anc)?.units ?? []) {
        const exposed =
          u.visibility === 'external' || u.visibility === 'public' || u.isFallback || u.isReceive;
        if (u.kind !== 'function' || u.isConstructor || !exposed || seen.has(u.signature)) continue;
        seen.set(u.signature, unitId(u, byName.get(anc)?.file));
      }
    }
    entry_points[c.name] = [...seen.values()].sort();
  }

  return {
    generated_at: new Date().toISOString(),
    ...(opts.commit ? { commit: opts.commit } : {}),
    source: 'parser-fallback',
    layout_source: 'declaration-order',
    warnings: [
      `Facts approximated by the Solidity parser${opts.reason ? ` (${opts.reason.split('\n')[0]})` : ''}: calls are resolved by name and the storage layout ignores packing. Fix the build and re-run \`hex facts\` for exact data.`,
    ],
    contracts: contracts.sort((a, b) => a.name.localeCompare(b.name)),
    functions: [...functions.values()].sort((a, b) => a.id.localeCompare(b.id)),
    state_vars: state_vars.sort((a, b) => a.id.localeCompare(b.id)),
    storage_layouts,
    entry_points,
  };
}
