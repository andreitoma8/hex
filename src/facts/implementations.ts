/**
 * Where an interface or virtual function actually runs: the in-scope functions
 * that implement it. Shared by `hex facts query implementations` (over facts)
 * and the navigation index (`xref.ts`, over every compiled declaration), so
 * the CLI, Claude and the dashboard give the same answer.
 *
 * Pure.
 */

export interface ImplCandidate {
  id: string;
  contract: string;
  signature: string;
  contractKind: 'contract' | 'abstract' | 'interface' | 'library';
  in_scope: boolean;
  /** Ids of the functions this one overrides (the compiler's baseFunctions). */
  overrides: string[];
}

export interface Implementation {
  id: string;
  /**
   * `override`: the compiler links it (it overrides the target, directly or
   * through a chain). `signature`: a contract defines the same signature
   * without inheriting the interface, as tokens behind an `IERC20` usually do;
   * likely, but not proven by the compiler.
   */
  by: 'override' | 'signature';
}

export function findImplementations(fns: ImplCandidate[], target: string): Implementation[] {
  const t = fns.find((f) => f.id === target);
  if (!t) return [];
  const overriders = new Map<string, string[]>();
  for (const f of fns) {
    for (const o of f.overrides) overriders.set(o, [...(overriders.get(o) ?? []), f.id]);
  }
  const byId = new Map(fns.map((f) => [f.id, f]));
  const out: Implementation[] = [];
  const seen = new Set<string>([target]);
  const stack = [...(overriders.get(target) ?? [])];
  while (stack.length) {
    const id = stack.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    const f = byId.get(id);
    if (f && f.contractKind !== 'interface') out.push({ id, by: 'override' });
    stack.push(...(overriders.get(id) ?? []));
  }
  if (t.contractKind === 'interface') {
    for (const f of fns) {
      if (seen.has(f.id) || f.signature !== t.signature || !f.in_scope) continue;
      if (f.contractKind !== 'contract' && f.contractKind !== 'abstract') continue;
      out.push({ id: f.id, by: 'signature' });
    }
  }
  return out.sort((a, b) =>
    a.by === b.by ? a.id.localeCompare(b.id) : a.by === 'override' ? -1 : 1,
  );
}
