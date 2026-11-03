import {
  ancestorsOf,
  type CallRef,
  type CodeUnit,
  type ContractModel,
  type FileModel,
} from './code-model.js';
import type {
  Facts,
  Confidence,
  DiffChange,
  ImpactedFunction,
  StorageLayoutChange,
} from '../types/index.js';

/**
 * Differential-audit analysis, pure over code models (no git, no fs) so it can
 * be unit-tested with inline Solidity. `src/commands/diff.ts` feeds it the base
 * and head versions of the changed files plus the head version of every
 * in-scope file.
 */

// ─── Entity diff ────────────────────────────────────────────────────

function contractKey(c: ContractModel): string {
  return c.kind === 'free' ? `(free):${c.file}` : c.name;
}

function unitKey(u: CodeUnit): string {
  return `${u.kind}:${u.signature}`;
}

function displayContract(c: ContractModel): string {
  return c.kind === 'free' ? '(free)' : c.name;
}

function hasStorage(c: ContractModel): boolean {
  return c.kind === 'contract' || c.kind === 'abstract';
}

function unitChange(c: ContractModel, u: CodeUnit, change: DiffChange['change']): DiffChange {
  return {
    contract: displayContract(c),
    entity: u.signature,
    kind: u.kind,
    file: c.file,
    change,
    line_start: u.lineStart,
    line_end: u.lineEnd,
    visibility: u.visibility,
  };
}

/** Diff one contract's base and head versions entity by entity. */
export function diffContract(
  base: ContractModel | null,
  head: ContractModel | null,
): { changes: DiffChange[]; layout: StorageLayoutChange[] } {
  const changes: DiffChange[] = [];
  const layout: StorageLayoutChange[] = [];

  if (!base && head) {
    changes.push({
      contract: displayContract(head),
      entity: displayContract(head),
      kind: 'contract',
      file: head.file,
      change: 'added',
      line_start: head.lineStart,
      line_end: head.lineEnd,
    });
    for (const u of head.units) changes.push(unitChange(head, u, 'added'));
    return { changes, layout };
  }
  if (base && !head) {
    changes.push({
      contract: displayContract(base),
      entity: displayContract(base),
      kind: 'contract',
      file: base.file,
      change: 'removed',
      line_start: base.lineStart,
      line_end: base.lineEnd,
    });
    for (const u of base.units) changes.push(unitChange(base, u, 'removed'));
    return { changes, layout };
  }
  if (!base || !head) return { changes, layout };

  const name = displayContract(head);

  // Inheritance list (order matters for linearization and storage).
  if (base.bases.join(',') !== head.bases.join(',')) {
    changes.push({
      contract: name,
      entity: head.bases.length ? `is ${head.bases.join(', ')}` : '(no bases)',
      kind: 'inheritance',
      file: head.file,
      change: 'modified',
      line_start: head.lineStart,
    });
    if (hasStorage(head)) {
      layout.push({
        contract: name,
        file: head.file,
        kind: 'inheritance_changed',
        detail: `Bases changed from [${base.bases.join(', ')}] to [${head.bases.join(', ')}].`,
      });
    }
  }

  // Functions and modifiers.
  const baseUnits = new Map(base.units.map((u) => [unitKey(u), u]));
  const headUnits = new Map(head.units.map((u) => [unitKey(u), u]));
  for (const [k, hu] of headUnits) {
    const bu = baseUnits.get(k);
    if (!bu) changes.push(unitChange(head, hu, 'added'));
    else if (bu.normalized !== hu.normalized) changes.push(unitChange(head, hu, 'modified'));
    else if (bu.raw !== hu.raw) changes.push(unitChange(head, hu, 'comments_only'));
  }
  for (const [k, bu] of baseUnits) {
    if (!headUnits.has(k)) changes.push(unitChange(base, bu, 'removed'));
  }

  // State variables (declaration-level: type, mutability, initializer).
  const baseVars = new Map(base.stateVars.map((v) => [v.name, v]));
  const headVars = new Map(head.stateVars.map((v) => [v.name, v]));
  for (const [n, hv] of headVars) {
    const bv = baseVars.get(n);
    const change: DiffChange['change'] | null = !bv
      ? 'added'
      : bv.type !== hv.type || bv.mutability !== hv.mutability || bv.initial !== hv.initial
        ? 'modified'
        : null;
    if (change) {
      changes.push({
        contract: name,
        entity: n,
        kind: 'state_variable',
        file: head.file,
        change,
        line_start: hv.lineStart,
      });
    }
  }
  for (const [n, bv] of baseVars) {
    if (!headVars.has(n)) {
      changes.push({
        contract: name,
        entity: n,
        kind: 'state_variable',
        file: head.file,
        change: 'removed',
        line_start: bv.lineStart,
      });
    }
  }

  // Events, errors, structs.
  const diffNamed = (
    kind: 'event' | 'error',
    b: ContractModel['events'],
    h: ContractModel['events'],
  ) => {
    const bm = new Map(b.map((e) => [e.name, e]));
    const hm = new Map(h.map((e) => [e.name, e]));
    for (const [n, he] of hm) {
      const be = bm.get(n);
      if (!be || be.signature !== he.signature) {
        changes.push({
          contract: name,
          entity: he.signature,
          kind,
          file: head.file,
          change: be ? 'modified' : 'added',
          line_start: he.lineStart,
        });
      }
    }
    for (const [n, be] of bm) {
      if (!hm.has(n)) {
        changes.push({
          contract: name,
          entity: be.signature,
          kind,
          file: head.file,
          change: 'removed',
          line_start: be.lineStart,
        });
      }
    }
  };
  diffNamed('event', base.events, head.events);
  diffNamed('error', base.errors, head.errors);

  const baseStructs = new Map(base.structs.map((s) => [s.name, s]));
  const headStructs = new Map(head.structs.map((s) => [s.name, s]));
  for (const [n, hs] of headStructs) {
    const bs = baseStructs.get(n);
    if (!bs || bs.members.join(';') !== hs.members.join(';')) {
      changes.push({
        contract: name,
        entity: n,
        kind: 'struct',
        file: head.file,
        change: bs ? 'modified' : 'added',
        line_start: hs.lineStart,
      });
      // A struct that backs a storage variable changes that variable's layout.
      const tokenRe = new RegExp(`(^|[^A-Za-z0-9_])${n}([^A-Za-z0-9_]|$)`);
      const usedIn = head.stateVars.filter(
        (v) => v.mutability === 'mutable' && tokenRe.test(v.type),
      );
      if (bs && usedIn.length > 0 && hasStorage(head)) {
        layout.push({
          contract: name,
          file: head.file,
          kind: 'struct_changed',
          detail: `Struct \`${n}\` changed and is stored in ${usedIn.map((v) => `\`${v.name}\``).join(', ')}.`,
        });
      }
    }
  }
  for (const [n, bs] of baseStructs) {
    if (!headStructs.has(n)) {
      changes.push({
        contract: name,
        entity: n,
        kind: 'struct',
        file: head.file,
        change: 'removed',
        line_start: bs.lineStart,
      });
    }
  }

  // Storage layout (own mutable variables, declaration order).
  if (hasStorage(head)) layout.push(...diffStorageLayout(name, head.file, base, head));

  return { changes, layout };
}

function diffStorageLayout(
  contract: string,
  file: string,
  base: ContractModel,
  head: ContractModel,
): StorageLayoutChange[] {
  const out: StorageLayoutChange[] = [];
  const bSlots = base.stateVars.filter((v) => v.mutability === 'mutable');
  const hSlots = head.stateVars.filter((v) => v.mutability === 'mutable');
  const bNames = bSlots.map((v) => v.name);
  const hNames = hSlots.map((v) => v.name);
  const bType = new Map(bSlots.map((v) => [v.name, v.type]));
  const hType = new Map(hSlots.map((v) => [v.name, v.type]));

  for (const n of bNames) {
    if (!hType.has(n)) {
      out.push({
        contract,
        file,
        kind: 'variable_removed',
        detail: `\`${n}\` (${bType.get(n)}) was removed; later variables shift slots.`,
      });
    } else if (bType.get(n) !== hType.get(n)) {
      out.push({
        contract,
        file,
        kind: 'variable_type_changed',
        detail: `\`${n}\` changed type from ${bType.get(n)} to ${hType.get(n)}.`,
      });
    }
  }

  const common = hNames.filter((n) => bType.has(n));
  const commonInBaseOrder = bNames.filter((n) => hType.has(n));
  if (common.join(',') !== commonInBaseOrder.join(',')) {
    out.push({
      contract,
      file,
      kind: 'variable_reordered',
      detail: `Declaration order changed: [${commonInBaseOrder.join(', ')}] → [${common.join(', ')}].`,
    });
  }

  const lastCommonIdx = common.length ? hNames.indexOf(common[common.length - 1]) : -1;
  for (const n of hNames) {
    if (bType.has(n)) continue;
    const idx = hNames.indexOf(n);
    const appended = idx > lastCommonIdx;
    out.push({
      contract,
      file,
      kind: 'variable_added',
      detail: appended
        ? `\`${n}\` (${hType.get(n)}) appended after existing variables.`
        : `\`${n}\` (${hType.get(n)}) inserted before existing variables; later variables shift slots.`,
    });
  }
  return out;
}

/**
 * Diff the contracts found in the base and head versions of the changed files.
 * Contracts are matched by name across all changed files, so a contract moved
 * between two changed files is diffed rather than reported as removed + added.
 */
export function diffModels(
  baseModels: FileModel[],
  headModels: FileModel[],
): { changes: DiffChange[]; layout: StorageLayoutChange[] } {
  const baseBy = new Map<string, ContractModel>();
  const headBy = new Map<string, ContractModel>();
  for (const fm of baseModels) for (const c of fm.contracts) baseBy.set(contractKey(c), c);
  for (const fm of headModels) for (const c of fm.contracts) headBy.set(contractKey(c), c);

  const changes: DiffChange[] = [];
  const layout: StorageLayoutChange[] = [];
  const keys = new Set([...baseBy.keys(), ...headBy.keys()]);
  for (const k of [...keys].sort()) {
    const r = diffContract(baseBy.get(k) ?? null, headBy.get(k) ?? null);
    changes.push(...r.changes);
    layout.push(...r.layout);
  }
  return { changes, layout };
}

// ─── Impact (head) ──────────────────────────────────────────────────

const CONF_RANK: Record<Confidence, number> = { high: 3, medium: 2, low: 1 };
function minConf(a: Confidence, b: Confidence): Confidence {
  return CONF_RANK[a] <= CONF_RANK[b] ? a : b;
}

type EdgeKind = 'calls' | 'modifier' | 'override';
interface Edge {
  /** Key of the unit whose behavior depends on `callee`. */
  caller: string;
  callee: string;
  kind: EdgeKind;
  confidence: Confidence;
}

export interface ImpactIndex {
  units: Map<string, CodeUnit>;
  contracts: Map<string, ContractModel>;
  /** callee → edges into it (reverse adjacency). */
  callersOf: Map<string, Edge[]>;
  /** unit id → file it is declared in. */
  unitFile: Map<string, string>;
}

export function unitId(u: CodeUnit, file?: string): string {
  return u.contract === '(free)'
    ? `(free)@${file ?? ''}.${u.signature}`
    : `${u.contract}.${u.signature}`;
}

function descendantsOf(name: string, contracts: Map<string, ContractModel>): string[] {
  const out: string[] = [];
  for (const c of contracts.values()) {
    if (c.name !== name && ancestorsOf(c.name, contracts).includes(name)) out.push(c.name);
  }
  return out;
}

/** Build the head call graph (with modifier and virtual-dispatch edges). */
export function buildImpactIndex(headModels: FileModel[]): ImpactIndex {
  const units = new Map<string, CodeUnit>();
  const unitFile = new Map<string, string>();
  const contracts = new Map<string, ContractModel>();
  const freeUnits: Array<{ id: string; u: CodeUnit }> = [];

  for (const fm of headModels) {
    for (const c of fm.contracts) {
      if (c.kind !== 'free') contracts.set(c.name, c);
      for (const u of c.units) {
        const id = unitId(u, c.file);
        units.set(id, u);
        unitFile.set(id, c.file);
        if (c.kind === 'free') freeUnits.push({ id, u });
      }
    }
  }

  const ancestorsCache = new Map<string, string[]>();
  const ancestors = (n: string) => {
    if (!ancestorsCache.has(n)) ancestorsCache.set(n, ancestorsOf(n, contracts));
    return ancestorsCache.get(n)!;
  };
  const descendantsCache = new Map<string, string[]>();
  const descendants = (n: string) => {
    if (!descendantsCache.has(n)) descendantsCache.set(n, descendantsOf(n, contracts));
    return descendantsCache.get(n)!;
  };

  /** Units named `name` of `kind` in the nearest contract of `chain` that defines any. */
  const nearest = (chain: string[], name: string, kind: CodeUnit['kind'], argCount?: number) => {
    for (const cn of chain) {
      const c = contracts.get(cn);
      if (!c) continue;
      const hits = c.units.filter((u) => u.kind === kind && u.name === name);
      if (hits.length === 0) continue;
      const exact = argCount === undefined ? hits : hits.filter((u) => u.paramCount === argCount);
      return (exact.length ? exact : hits).map((u) => unitId(u, c.file));
    }
    return [];
  };

  /** Overrides of `name` in contracts deriving from `from` (virtual dispatch). */
  const overrides = (from: string, name: string, kind: CodeUnit['kind'], argCount?: number) => {
    const out: string[] = [];
    for (const d of descendants(from)) {
      const c = contracts.get(d)!;
      const hits = c.units.filter(
        (u) =>
          u.kind === kind &&
          u.name === name &&
          (argCount === undefined || u.paramCount === argCount),
      );
      for (const u of hits) out.push(unitId(u, c.file));
    }
    return out;
  };

  const callersOf = new Map<string, Edge[]>();
  const addEdge = (e: Edge) => {
    if (e.caller === e.callee || !units.has(e.callee)) return;
    const list = callersOf.get(e.callee) ?? [];
    if (!list.some((x) => x.caller === e.caller && x.kind === e.kind)) list.push(e);
    callersOf.set(e.callee, list);
  };

  const resolve = (
    caller: CodeUnit,
    ref: CallRef,
  ): Array<{ id: string; kind: EdgeKind; conf: Confidence }> => {
    const cn = caller.contract;
    const chain = cn === '(free)' ? [] : [cn, ...ancestors(cn)];
    const out: Array<{ id: string; kind: EdgeKind; conf: Confidence }> = [];
    const push = (ids: string[], kind: EdgeKind, conf: Confidence) => {
      for (const id of ids) out.push({ id, kind, conf });
    };
    switch (ref.kind) {
      case 'internal':
      case 'this': {
        const direct = nearest(chain, ref.name, 'function', ref.argCount);
        if (direct.length) {
          push(direct, 'calls', 'high');
          if (cn !== '(free)')
            push(overrides(cn, ref.name, 'function', ref.argCount), 'override', 'medium');
        } else if (ref.kind === 'internal') {
          push(
            freeUnits.filter((f) => f.u.name === ref.name).map((f) => f.id),
            'calls',
            'high',
          );
        }
        break;
      }
      case 'super':
        push(
          nearest(cn === '(free)' ? [] : ancestors(cn), ref.name, 'function', ref.argCount),
          'calls',
          'high',
        );
        break;
      case 'qualified':
        if (ref.target)
          push(
            nearest([ref.target, ...ancestors(ref.target)], ref.name, 'function', ref.argCount),
            'calls',
            'high',
          );
        break;
      case 'base_ctor':
        if (ref.target) push(nearest([ref.target], 'constructor', 'function'), 'calls', 'high');
        break;
      case 'typed': {
        if (!ref.target) break;
        const t = contracts.get(ref.target);
        if (!t) break;
        if (t.kind === 'interface') {
          // Any in-scope implementation may be the runtime target.
          for (const impl of descendants(t.name)) {
            const ic = contracts.get(impl)!;
            if (ic.kind === 'interface') continue;
            push(
              nearest([impl, ...ancestors(impl)], ref.name, 'function', ref.argCount),
              'calls',
              'medium',
            );
          }
        } else {
          push(
            nearest([t.name, ...ancestors(t.name)], ref.name, 'function', ref.argCount),
            'calls',
            'medium',
          );
          push(overrides(t.name, ref.name, 'function', ref.argCount), 'override', 'medium');
        }
        break;
      }
      case 'member': {
        // Receiver type unknown: `using for` library calls or an external call
        // on an untyped address. Name-only, low confidence.
        for (const c of contracts.values()) {
          for (const u of c.units) {
            if (u.kind !== 'function' || u.name !== ref.name) continue;
            const externalish = u.visibility === 'external' || u.visibility === 'public';
            if (c.kind === 'library' || (externalish && c.kind !== 'interface')) {
              out.push({ id: unitId(u, c.file), kind: 'calls', conf: 'low' });
            }
          }
        }
        break;
      }
    }
    return out;
  };

  for (const [id, u] of units) {
    for (const ref of u.calls) {
      for (const r of resolve(u, ref))
        addEdge({ caller: id, callee: r.id, kind: r.kind, confidence: r.conf });
    }
    // Modifiers the unit applies.
    if (u.contract !== '(free)') {
      const chain = [u.contract, ...ancestors(u.contract)];
      for (const m of u.modifiers) {
        for (const mid of nearest(chain, m, 'modifier')) {
          addEdge({ caller: id, callee: mid, kind: 'modifier', confidence: 'high' });
        }
        for (const mid of overrides(u.contract, m, 'modifier')) {
          addEdge({ caller: id, callee: mid, kind: 'override', confidence: 'medium' });
        }
      }
    }
  }

  return { units, contracts, callersOf, unitFile };
}

function isEntryPoint(u: CodeUnit, c: ContractModel | undefined): boolean {
  if (!c || u.kind !== 'function') return false;
  if (c.kind !== 'contract' && c.kind !== 'abstract') return false;
  return u.visibility === 'external' || u.visibility === 'public' || u.isFallback || u.isReceive;
}

interface NodeState {
  depth: number;
  confidence: Confidence;
  reasons: ImpactedFunction['reasons'];
}

const MAX_REASONS = 5;

/**
 * Propagate impact from the changed units of the head version:
 *   depth 0 — the unit itself was added or modified
 *   depth 1 — reads state a changed unit writes, or reads/writes a changed state variable
 *   depth n — calls / applies / dispatches into an impacted unit (n-1)
 * Then surface inherited entry points on deployable descendants.
 */
export function computeImpact(index: ImpactIndex, changes: DiffChange[]): ImpactedFunction[] {
  const { units, contracts, callersOf, unitFile } = index;
  const state = new Map<string, NodeState>();

  const better = (prev: NodeState | undefined, depth: number, conf: Confidence) =>
    !prev ||
    CONF_RANK[conf] > CONF_RANK[prev.confidence] ||
    (CONF_RANK[conf] === CONF_RANK[prev.confidence] && depth < prev.depth);

  const mark = (
    id: string,
    depth: number,
    conf: Confidence,
    reason: ImpactedFunction['reasons'][number],
  ) => {
    const prev = state.get(id);
    if (better(prev, depth, conf)) {
      const reasons = prev
        ? [reason, ...prev.reasons.filter((r) => r.via !== reason.via)]
        : [reason];
      state.set(id, { depth, confidence: conf, reasons: reasons.slice(0, MAX_REASONS) });
      return true;
    }
    if (
      prev &&
      prev.reasons.length < MAX_REASONS &&
      !prev.reasons.some((r) => r.via === reason.via && r.kind === reason.kind)
    ) {
      prev.reasons.push(reason);
    }
    return false;
  };

  // Depth 0: added / modified functions and modifiers present at head.
  const seeds: string[] = [];
  for (const ch of changes) {
    if (
      (ch.kind !== 'function' && ch.kind !== 'modifier') ||
      (ch.change !== 'added' && ch.change !== 'modified')
    )
      continue;
    const id =
      ch.contract === '(free)' ? `(free)@${ch.file}.${ch.entity}` : `${ch.contract}.${ch.entity}`;
    if (!units.has(id)) continue;
    mark(id, 0, 'high', { kind: 'changed', via: ch.change });
    seeds.push(id);
  }

  // Depth 1: state coupling.
  const familyOf = (cn: string) => {
    const anc = ancestorsOf(cn, contracts);
    const desc = [...contracts.values()]
      .filter((c) => ancestorsOf(c.name, contracts).includes(cn))
      .map((c) => c.name);
    return new Set([cn, ...anc, ...desc]);
  };
  const coupled: string[] = [];
  const coupleOn = (cn: string, vars: Set<string>, via: (v: string) => string, writer?: string) => {
    if (vars.size === 0) return;
    const fam = familyOf(cn);
    for (const [id, u] of units) {
      if (id === writer || !fam.has(u.contract)) continue;
      const hit = [...u.reads, ...u.writes].find((v) => vars.has(v));
      if (!hit) continue;
      if (mark(id, 1, 'medium', { kind: 'reads_state', via: via(hit) })) coupled.push(id);
    }
  };
  for (const id of seeds) {
    const u = units.get(id)!;
    if (u.contract === '(free)') continue;
    coupleOn(u.contract, new Set(u.writes), (v) => `${v} (written by ${id})`, id);
  }
  const varChanges = new Map<string, Set<string>>();
  for (const ch of changes) {
    if (ch.kind !== 'state_variable' || ch.change === 'removed') continue;
    if (!varChanges.has(ch.contract)) varChanges.set(ch.contract, new Set());
    varChanges.get(ch.contract)!.add(ch.entity);
  }
  for (const [cn, vars] of varChanges)
    coupleOn(cn, vars, (v) => `${cn}.${v} (declaration changed)`);

  // Reverse BFS over the call graph (Dijkstra-ish on (confidence, depth)).
  const queue = [...seeds, ...coupled];
  while (queue.length) {
    const id = queue.shift()!;
    const cur = state.get(id)!;
    for (const e of callersOf.get(id) ?? []) {
      const conf = minConf(cur.confidence, e.confidence);
      const kind =
        e.kind === 'modifier' ? 'modifier' : e.kind === 'override' ? 'override' : 'calls';
      if (mark(e.caller, cur.depth + 1, conf, { kind, via: id })) queue.push(e.caller);
    }
  }

  const rows: ImpactedFunction[] = [];
  for (const [id, st] of state) {
    const u = units.get(id)!;
    const c = contracts.get(u.contract);
    rows.push({
      contract: u.contract,
      function: u.signature,
      file: unitFile.get(id) ?? c?.file ?? '',
      visibility: u.visibility,
      is_entry_point: isEntryPoint(u, c),
      depth: st.depth,
      reasons: st.reasons,
      confidence: st.confidence,
      derived_from: st.confidence === 'low' ? 'heuristic' : 'solc-ast',
      line_start: u.lineStart,
    });
  }

  // Inherited entry points: an impacted public/external function declared in B
  // is reachable on every deployable descendant D that does not override it.
  const inherited: ImpactedFunction[] = [];
  for (const r of rows) {
    if (!r.is_entry_point) continue;
    for (const d of contracts.values()) {
      if (d.name === r.contract || d.kind !== 'contract') continue;
      const chain = [d.name, ...ancestorsOf(d.name, contracts)];
      if (!chain.includes(r.contract)) continue;
      const definer = chain.find((cn) =>
        contracts.get(cn)?.units.some((u) => u.kind === 'function' && u.signature === r.function),
      );
      if (definer !== r.contract) continue;
      inherited.push({
        ...r,
        contract: d.name,
        reasons: [{ kind: 'inherits', via: `${r.contract}.${r.function}` }],
      });
    }
  }

  return [...rows, ...inherited].sort(
    (a, b) =>
      a.depth - b.depth ||
      a.contract.localeCompare(b.contract) ||
      a.function.localeCompare(b.function),
  );
}

/**
 * Storage-layout changes in a base contract shift every descendant's layout.
 * Add one `inheritance_changed` row per deployable descendant.
 */
export function propagateLayoutChanges(
  layout: StorageLayoutChange[],
  contracts: Map<string, ContractModel>,
): StorageLayoutChange[] {
  const changedBases = new Set(layout.map((l) => l.contract));
  const extra: StorageLayoutChange[] = [];
  for (const c of contracts.values()) {
    if (!hasStorage(c) || changedBases.has(c.name)) continue;
    const anc = ancestorsOf(c.name, contracts).filter((a) => changedBases.has(a));
    if (anc.length === 0) continue;
    extra.push({
      contract: c.name,
      file: c.file,
      kind: 'inheritance_changed',
      detail: `Inherits ${anc.map((a) => `\`${a}\``).join(', ')}, whose storage layout changed.`,
    });
  }
  return [...layout, ...extra];
}

export function summarize(
  files: Array<{ additions: number; deletions: number }>,
  changes: DiffChange[],
  layout: StorageLayoutChange[],
  impacted: ImpactedFunction[],
) {
  const fn = (c: DiffChange['change']) =>
    changes.filter((x) => x.kind === 'function' && x.change === c).length;
  return {
    files_changed: files.length,
    additions: files.reduce((s, f) => s + f.additions, 0),
    deletions: files.reduce((s, f) => s + f.deletions, 0),
    functions_added: fn('added'),
    functions_modified: fn('modified'),
    functions_removed: fn('removed'),
    impacted_functions: impacted.filter((i) => i.depth > 0).length,
    impacted_entry_points: impacted.filter((i) => i.is_entry_point).length,
    storage_layout_changes: layout.length,
  };
}

// ─── Compiler-facts adapters ────────────────────────────────────────

/**
 * Build the impact index from exact compiler facts instead of the parser.
 * Every call edge is compiler-resolved, so call/modifier edges are `high`;
 * virtual dispatch comes from the compiler's override graph (also `high`).
 */
export function impactIndexFromFacts(facts: Facts): ImpactIndex {
  const units = new Map<string, CodeUnit>();
  const unitFile = new Map<string, string>();
  const contracts = new Map<string, ContractModel>();
  const lastSeg = (id: string) => id.slice(id.lastIndexOf('.') + 1);

  for (const c of facts.contracts) {
    contracts.set(c.name, {
      name: c.name,
      kind: c.kind,
      file: c.file,
      bases: c.bases,
      lineStart: c.line_start,
      lineEnd: c.line_end,
      units: [],
      stateVars: facts.state_vars
        .filter((v) => v.contract === c.name)
        .map((v) => ({
          name: v.name,
          type: v.type,
          mutability: v.mutability,
          visibility: v.visibility,
          initial: '',
          lineStart: v.line,
        })),
      events: [],
      errors: [],
      structs: [],
    });
  }
  for (const f of facts.functions) {
    const u: CodeUnit = {
      contract: f.contract,
      kind: f.kind === 'modifier' ? 'modifier' : 'function',
      name: f.name,
      signature: f.signature,
      visibility: f.visibility,
      stateMutability: f.mutability,
      isConstructor: f.kind === 'constructor',
      isFallback: f.kind === 'fallback',
      isReceive: f.kind === 'receive',
      modifiers: f.modifiers.map((m) => m.slice(m.indexOf('.') + 1, m.indexOf('('))),
      paramCount: f.signature === `${f.name}()` ? 0 : f.signature.split(',').length,
      lineStart: f.line_start,
      lineEnd: f.line_end,
      raw: '',
      normalized: '',
      calls: [],
      reads: f.reads.map(lastSeg),
      writes: f.writes.map(lastSeg),
    };
    units.set(f.id, u);
    unitFile.set(f.id, f.file);
    contracts.get(f.contract)?.units.push(u);
  }

  const callersOf = new Map<string, Edge[]>();
  for (const f of facts.functions) {
    for (const c of f.calls) {
      if (!units.has(c.to)) continue;
      const kind: EdgeKind =
        c.kind === 'modifier' ? 'modifier' : c.kind === 'virtual' ? 'override' : 'calls';
      const list = callersOf.get(c.to) ?? [];
      if (!list.some((e) => e.caller === f.id && e.kind === kind)) {
        list.push({ caller: f.id, callee: c.to, kind, confidence: 'high' });
      }
      callersOf.set(c.to, list);
    }
  }
  return { units, contracts, callersOf, unitFile };
}

/**
 * Exact storage-layout diff between two compiler layouts (slot, offset, type),
 * per contract present at both commits. New contracts have nothing to collide with.
 */
export function diffCompilerLayouts(base: Facts, head: Facts): StorageLayoutChange[] {
  const out: StorageLayoutChange[] = [];
  const fileOf = new Map(head.contracts.map((c) => [c.name, c.file]));
  for (const [contract, headSlots] of Object.entries(head.storage_layouts)) {
    const baseSlots = base.storage_layouts[contract];
    if (!baseSlots) continue;
    const file = fileOf.get(contract) ?? '';
    const b = new Map(baseSlots.map((s) => [s.label, s]));
    const h = new Map(headSlots.map((s) => [s.label, s]));
    const where = (s: { slot: string; offset: number }) =>
      `slot ${s.slot}${s.offset ? ` offset ${s.offset}` : ''}`;

    for (const [label, bs] of b) {
      const hs = h.get(label);
      if (!hs) {
        out.push({
          contract,
          file,
          kind: 'variable_removed',
          detail: `\`${label}\` (${bs.type}, ${where(bs)}) was removed.`,
        });
      } else if (hs.type !== bs.type) {
        out.push({
          contract,
          file,
          kind: 'variable_type_changed',
          detail: `\`${label}\` changed type from ${bs.type} to ${hs.type} (${where(hs)}).`,
        });
      } else if (hs.slot !== bs.slot || hs.offset !== bs.offset) {
        out.push({
          contract,
          file,
          kind: 'variable_reordered',
          detail: `\`${label}\` moved from ${where(bs)} to ${where(hs)}.`,
        });
      }
    }
    const lastBaseSlot = Math.max(-1, ...baseSlots.map((s) => Number(s.slot)));
    for (const [label, hs] of h) {
      if (b.has(label)) continue;
      const appended = Number(hs.slot) > lastBaseSlot;
      out.push({
        contract,
        file,
        kind: 'variable_added',
        detail: appended
          ? `\`${label}\` (${hs.type}) appended at ${where(hs)}.`
          : `\`${label}\` (${hs.type}) inserted at ${where(hs)}, inside the old layout.`,
      });
    }
    const order = (slots: typeof headSlots) =>
      [...new Set(slots.map((s) => s.declared_in))].join(' → ');
    if (order(baseSlots) !== order(headSlots)) {
      out.push({
        contract,
        file,
        kind: 'inheritance_changed',
        detail: `Storage order by declaring contract changed: ${order(baseSlots)} ⇒ ${order(headSlots)}.`,
      });
    }
  }
  return out;
}
