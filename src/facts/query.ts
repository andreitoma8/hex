/**
 * Read-side helpers over `.hex/facts.json`. Node builtins only, so the
 * dashboard and the MCP server can import it alongside the CLI.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { Facts, FactsFunction } from '../types/index.js';
import { findImplementations, type Implementation } from './implementations.js';

export function loadFacts(outputDir: string): Facts | null {
  try {
    return JSON.parse(fs.readFileSync(path.join(outputDir, 'facts.json'), 'utf-8')) as Facts;
  } catch {
    return null;
  }
}

/**
 * Resolve a loose reference to function ids:
 * an exact id (`Vault.withdraw(uint256)`), `Contract.name` (all overloads),
 * or a bare `name` (every contract). Case-sensitive, like Solidity.
 */
export function resolveFunctions(facts: Facts, ref: string): FactsFunction[] {
  const exact = facts.functions.filter((f) => f.id === ref);
  if (exact.length) return exact;
  const dot = ref.indexOf('.');
  const paren = ref.indexOf('(');
  if (dot > 0 && (paren === -1 || dot < paren)) {
    const contract = ref.slice(0, dot);
    const rest = ref.slice(dot + 1);
    const name = rest.includes('(') ? null : rest;
    return facts.functions.filter(
      (f) => f.contract === contract && (name ? f.name === name : f.signature === rest),
    );
  }
  const name = paren > 0 ? ref.slice(0, paren) : ref;
  return facts.functions.filter((f) => f.name === name || f.signature === ref);
}

/** Resolve `Contract.var` or a bare `var` to state variable ids. */
export function resolveStateVars(facts: Facts, ref: string): string[] {
  if (facts.state_vars.some((v) => v.id === ref)) return [ref];
  return facts.state_vars.filter((v) => v.name === ref).map((v) => v.id);
}

function closure(
  facts: Facts,
  start: string[],
  next: (f: FactsFunction) => string[],
  transitive: boolean,
): string[] {
  const byId = new Map(facts.functions.map((f) => [f.id, f]));
  const out = new Set<string>();
  let frontier = start;
  while (frontier.length) {
    const nextFrontier: string[] = [];
    for (const id of frontier) {
      const f = byId.get(id);
      if (!f) continue;
      for (const n of next(f)) {
        if (out.has(n) || start.includes(n)) continue;
        out.add(n);
        nextFrontier.push(n);
      }
    }
    if (!transitive) break;
    frontier = nextFrontier;
  }
  return [...out].sort();
}

export function callers(facts: Facts, ref: string, transitive = false): string[] {
  const ids = resolveFunctions(facts, ref).map((f) => f.id);
  return closure(facts, ids, (f) => f.called_by.map((c) => c.from), transitive);
}

export function callees(facts: Facts, ref: string, transitive = false): string[] {
  const ids = resolveFunctions(facts, ref).map((f) => f.id);
  return closure(facts, ids, (f) => f.calls.map((c) => c.to), transitive);
}

export function readers(facts: Facts, varRef: string): string[] {
  const vars = new Set(resolveStateVars(facts, varRef));
  return facts.functions.filter((f) => f.reads.some((r) => vars.has(r))).map((f) => f.id);
}

export function writers(facts: Facts, varRef: string): string[] {
  const vars = new Set(resolveStateVars(facts, varRef));
  return facts.functions.filter((f) => f.writes.some((w) => vars.has(w))).map((f) => f.id);
}

/** Entry points (of any deployable contract) that can reach the given function. */
export function reachingEntryPoints(facts: Facts, ref: string): string[] {
  const all = new Set(Object.values(facts.entry_points).flat());
  const ids = resolveFunctions(facts, ref).map((f) => f.id);
  const up = new Set([...ids, ...callers(facts, ref, true)]);
  return [...all].filter((e) => up.has(e)).sort();
}

export interface CallSite {
  from: string;
  kind: FactsFunction['called_by'][number]['kind'];
  file: string;
  /** The caller's line that makes the call (absent in facts from before call sites). */
  line?: number;
}

/** Upstream with exact places: every line, in every caller, that calls `ref`. */
export function callSites(facts: Facts, ref: string): CallSite[] {
  const byId = new Map(facts.functions.map((f) => [f.id, f]));
  const out: CallSite[] = [];
  for (const t of resolveFunctions(facts, ref)) {
    for (const c of t.called_by) {
      const file = byId.get(c.from)?.file ?? '';
      const lines = c.at?.length ? c.at : [undefined];
      for (const line of lines)
        out.push({ from: c.from, kind: c.kind, file, ...(line ? { line } : {}) });
    }
  }
  return out.sort(
    (a, b) =>
      a.file.localeCompare(b.file) || (a.line ?? 0) - (b.line ?? 0) || a.from.localeCompare(b.from),
  );
}

/** Where an interface or virtual function actually runs (see implementations.ts). */
export function implementations(facts: Facts, ref: string): Implementation[] {
  const kinds = new Map(facts.contracts.map((c) => [c.name, c.kind]));
  const candidates = facts.functions
    .filter((f) => f.kind === 'function')
    .map((f) => ({
      id: f.id,
      contract: f.contract,
      signature: f.signature,
      contractKind: kinds.get(f.contract) ?? 'contract',
      in_scope: f.in_scope,
      overrides: f.overrides,
    }));
  return resolveFunctions(facts, ref).flatMap((t) => findImplementations(candidates, t.id));
}

export const FACT_QUERIES = [
  'callers',
  'call-sites',
  'callees',
  'implementations',
  'readers',
  'writers',
  'layout',
  'linearization',
  'entry-points',
  'reach',
  'function',
] as const;
export type FactQuery = (typeof FACT_QUERIES)[number];

/** One entry point for the CLI and the MCP tool. Returns JSON-serializable data. */
export function runFactQuery(
  facts: Facts,
  query: FactQuery,
  ref: string | undefined,
  opts: { transitive?: boolean } = {},
): unknown {
  switch (query) {
    case 'callers':
      return callers(facts, ref ?? '', opts.transitive);
    case 'call-sites':
      return callSites(facts, ref ?? '');
    case 'callees':
      return callees(facts, ref ?? '', opts.transitive);
    case 'implementations':
      return implementations(facts, ref ?? '');
    case 'readers':
      return readers(facts, ref ?? '');
    case 'writers':
      return writers(facts, ref ?? '');
    case 'layout':
      return ref ? (facts.storage_layouts[ref] ?? null) : facts.storage_layouts;
    case 'linearization':
      return facts.contracts.find((c) => c.name === ref)?.linearization ?? null;
    case 'entry-points':
      return ref ? (facts.entry_points[ref] ?? []) : facts.entry_points;
    case 'reach':
      return reachingEntryPoints(facts, ref ?? '');
    case 'function':
      return resolveFunctions(facts, ref ?? '');
  }
}
