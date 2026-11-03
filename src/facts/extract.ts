/**
 * Exact facts from solc standard-JSON output (forge / hardhat build-info).
 *
 * Every edge here is resolved by the compiler (`referencedDeclaration`,
 * `linearizedBaseContracts`, `baseFunctions`, `storageLayout`), not by name
 * matching. The only inference is virtual dispatch, which is computed from the
 * compiler's own override graph.
 *
 * Pure: no fs, no process. `src/facts/build.ts` produces the inputs.
 */
import type {
  Facts,
  FactsContract,
  FactsFunction,
  FactsStateVar,
  FactsStorageSlot,
} from '../types/index.js';

// solc AST nodes are large heterogeneous JSON objects; typed loosely on purpose.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = Record<string, any>;
export type AstNode = N;

export interface BuildInfo {
  solcVersion?: string;
  solcLongVersion?: string;
  input?: { sources?: Record<string, { content?: string }> };
  output?: {
    sources?: Record<string, { id: number; ast: N }>;
    contracts?: Record<string, Record<string, { storageLayout?: N }>>;
  };
}

export interface ExtractOptions {
  inScope: (file: string) => boolean;
  commit?: string;
  toolchain: 'foundry' | 'hardhat';
  /** Map a build-info source path to the project-relative path used by Hex. */
  normalizePath?: (p: string) => string;
}

type CallKind = FactsFunction['calls'][number]['kind'];

const SUPER_ID = -25;
const THIS_ID = -28;

/** Canonical, location-free parameter type (matches code-model's typeToString). */
export function normType(typeString: string | undefined): string {
  if (!typeString) return 'unknown';
  let t = typeString
    .replace(/ (storage ref|storage pointer|memory|calldata)\b/g, '')
    .replace(/\baddress payable\b/g, 'address')
    .replace(/^function \(.*$/, 'function')
    .trim();
  // `contract IOracle` / `struct BaseVault.Position` / `enum A.Status` → last segment
  t = t.replace(
    /\b(contract|struct|enum|library|interface) ([A-Za-z0-9_$.]+)/g,
    (_m, _k, name: string) => name.split('.').pop()!,
  );
  return t.replace(/\s+/g, '');
}

export function lineIndex(content: string): number[] {
  // solc `src` offsets are UTF-8 byte offsets.
  const buf = Buffer.from(content, 'utf-8');
  const starts = [0];
  for (let i = 0; i < buf.length; i++) if (buf[i] === 0x0a) starts.push(i + 1);
  return starts;
}

export function lineOf(starts: number[], byteOffset: number): number {
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid] <= byteOffset) lo = mid;
    else hi = mid - 1;
  }
  return lo + 1;
}

function countNslocInRange(content: string, startLine: number, endLine: number): number {
  const lines = content.split(/\r?\n/).slice(startLine - 1, endLine);
  let inBlock = false;
  let n = 0;
  for (const raw of lines) {
    let line = raw.trim();
    if (inBlock) {
      const end = line.indexOf('*/');
      if (end === -1) continue;
      line = line.slice(end + 2).trim();
      inBlock = false;
    }
    if (line.startsWith('/*')) {
      if (!line.includes('*/')) inBlock = true;
      continue;
    }
    if (line === '' || line.startsWith('//')) continue;
    n++;
  }
  return n;
}

export function walk(node: unknown, visit: (n: N) => boolean | void): void {
  if (Array.isArray(node)) {
    for (const x of node) walk(x, visit);
    return;
  }
  if (!node || typeof node !== 'object') return;
  const n = node as N;
  if (typeof n.nodeType === 'string' && visit(n) === false) return;
  for (const [k, v] of Object.entries(n)) {
    if (k === 'typeDescriptions' || k === 'src' || k === 'nameLocation') continue;
    if (v && typeof v === 'object') walk(v, visit);
  }
}

interface Located {
  file: string;
  line_start: number;
  line_end: number;
}

interface Ctx {
  byId: Map<number, N>;
  fileOfSourceIndex: Map<number, string>;
  starts: Map<string, number[]>;
  contents: Map<string, string>;
  contractOf: Map<number, N>; // member node id → ContractDefinition
}

function locate(ctx: Ctx, node: N): Located {
  const [startS, lenS, idxS] = String(node.src ?? '0:0:0').split(':');
  const file = ctx.fileOfSourceIndex.get(Number(idxS)) ?? '';
  const starts = ctx.starts.get(file);
  if (!starts) return { file, line_start: 0, line_end: 0 };
  const start = Number(startS);
  const end = start + Math.max(Number(lenS) - 1, 0);
  return { file, line_start: lineOf(starts, start), line_end: lineOf(starts, end) };
}

export function contractKind(c: N): FactsContract['kind'] {
  if (c.contractKind === 'interface') return 'interface';
  if (c.contractKind === 'library') return 'library';
  return c.abstract ? 'abstract' : 'contract';
}

export function signatureOf(fn: N): string {
  const kind = fn.kind as string | undefined;
  if (kind === 'constructor' || kind === 'fallback' || kind === 'receive') return `${kind}()`;
  const params: N[] = fn.parameters?.parameters ?? [];
  return `${fn.name}(${params.map((p) => normType(p.typeDescriptions?.typeString)).join(',')})`;
}

/**
 * Extract facts from one or more build-infos. Node ids are only unique inside a
 * single compilation, so each build-info is resolved on its own and merged by
 * name-based ids (`Contract.signature`).
 */
export function extractFacts(buildInfos: BuildInfo[], opts: ExtractOptions): Facts {
  const norm = opts.normalizePath ?? ((p: string) => p);
  const contracts = new Map<string, FactsContract>();
  const functions = new Map<string, FactsFunction>();
  const stateVars = new Map<string, FactsStateVar>();
  const layouts: Record<string, FactsStorageSlot[]> = {};
  const warnings = new Set<string>();
  let compilerVersion = '';

  for (const bi of buildInfos) {
    compilerVersion ||= bi.solcLongVersion ?? bi.solcVersion ?? '';
    const sources = bi.output?.sources ?? {};
    const ctx: Ctx = {
      byId: new Map(),
      fileOfSourceIndex: new Map(),
      starts: new Map(),
      contents: new Map(),
      contractOf: new Map(),
    };
    for (const [rawPath, src] of Object.entries(sources)) {
      const file = norm(rawPath);
      ctx.fileOfSourceIndex.set(src.id, file);
      const content = bi.input?.sources?.[rawPath]?.content;
      if (content !== undefined) {
        ctx.contents.set(file, content);
        ctx.starts.set(file, lineIndex(content));
      }
      walk(src.ast, (n) => {
        if (typeof n.id === 'number') ctx.byId.set(n.id, n);
        if (n.nodeType === 'ContractDefinition') {
          for (const m of n.nodes ?? []) if (typeof m.id === 'number') ctx.contractOf.set(m.id, n);
        }
      });
    }

    const contractName = (id: number) => (ctx.byId.get(id)?.name as string | undefined) ?? `#${id}`;
    const fileOf = (n: N) => locate(ctx, n).file;

    // ── Which contracts to include: in-scope ones, their bases, and libraries they call.
    const allContracts: N[] = [];
    for (const src of Object.values(sources)) {
      for (const n of src.ast.nodes ?? [])
        if (n.nodeType === 'ContractDefinition') allContracts.push(n);
    }
    const included = new Set<number>();
    for (const c of allContracts) {
      if (!opts.inScope(fileOf(c))) continue;
      for (const id of c.linearizedBaseContracts ?? [c.id]) included.add(id);
    }

    // ── Function ids (by AST id) for everything in included contracts + free functions in scope.
    const fnIdOf = new Map<number, string>();
    const fnNodes: Array<{ node: N; contract: N | null }> = [];
    const declareFn = (node: N, contract: N | null) => {
      const cname = contract ? contract.name : '(free)';
      const sig =
        node.nodeType === 'ModifierDefinition'
          ? `${node.name}(${(node.parameters?.parameters ?? []).map((p: N) => normType(p.typeDescriptions?.typeString)).join(',')})`
          : signatureOf(node);
      fnIdOf.set(node.id, `${cname}.${sig}`);
      fnNodes.push({ node, contract });
    };
    const includeContract = (c: N) => {
      for (const m of c.nodes ?? []) {
        if (m.nodeType === 'FunctionDefinition' || m.nodeType === 'ModifierDefinition')
          declareFn(m, c);
      }
    };
    for (const c of allContracts) if (included.has(c.id)) includeContract(c);
    for (const src of Object.values(sources)) {
      for (const n of src.ast.nodes ?? []) {
        if (n.nodeType === 'FunctionDefinition' && opts.inScope(fileOf(n))) declareFn(n, null);
      }
    }

    // Libraries reached from included code get included too (one level, enough for `using for`).
    const pendingLibs = new Set<number>();
    for (const { node } of fnNodes) {
      walk(node.body, (n) => {
        const ref = n.referencedDeclaration;
        if (typeof ref !== 'number' || ref < 0) return;
        const target = ctx.byId.get(ref);
        if (target?.nodeType !== 'FunctionDefinition') return;
        const owner = ctx.contractOf.get(ref);
        if (owner && owner.contractKind === 'library' && !included.has(owner.id))
          pendingLibs.add(owner.id);
      });
    }
    for (const id of pendingLibs) {
      const c = ctx.byId.get(id);
      if (c) {
        included.add(id);
        includeContract(c);
      }
    }

    // ── Contracts
    for (const c of allContracts) {
      if (!included.has(c.id)) continue;
      const loc = locate(ctx, c);
      if (contracts.has(c.name) && contracts.get(c.name)!.file !== loc.file) {
        warnings.add(
          `Two contracts named ${c.name} (${contracts.get(c.name)!.file}, ${loc.file}); facts keep the first.`,
        );
        continue;
      }
      contracts.set(c.name, {
        name: c.name,
        kind: contractKind(c),
        file: loc.file,
        line_start: loc.line_start,
        line_end: loc.line_end,
        bases: (c.baseContracts ?? []).map((b: N) =>
          contractName(b.baseName?.referencedDeclaration),
        ),
        linearization: (c.linearizedBaseContracts ?? [c.id]).map(contractName),
        in_scope: opts.inScope(loc.file),
      });
    }

    // ── State variables
    const stateVarIdOf = new Map<number, string>();
    for (const c of allContracts) {
      if (!included.has(c.id)) continue;
      for (const m of c.nodes ?? []) {
        if (m.nodeType !== 'VariableDeclaration' || !m.stateVariable) continue;
        const id = `${c.name}.${m.name}`;
        stateVarIdOf.set(m.id, id);
        const loc = locate(ctx, m);
        stateVars.set(id, {
          id,
          contract: c.name,
          name: m.name,
          type: String(m.typeDescriptions?.typeString ?? 'unknown'),
          mutability: m.constant
            ? 'constant'
            : m.mutability === 'immutable'
              ? 'immutable'
              : 'mutable',
          visibility: String(m.visibility ?? 'internal'),
          file: loc.file,
          line: loc.line_start,
        });
      }
    }

    // ── Override graph (base AST id → direct overriders) for virtual dispatch.
    const overriders = new Map<number, number[]>();
    for (const { node } of fnNodes) {
      for (const base of [...(node.baseFunctions ?? []), ...(node.baseModifiers ?? [])]) {
        if (!overriders.has(base)) overriders.set(base, []);
        overriders.get(base)!.push(node.id);
      }
    }
    const allOverriders = (id: number): number[] => {
      const out: number[] = [];
      const stack = [...(overriders.get(id) ?? [])];
      const seen = new Set<number>();
      while (stack.length) {
        const x = stack.pop()!;
        if (seen.has(x)) continue;
        seen.add(x);
        out.push(x);
        stack.push(...(overriders.get(x) ?? []));
      }
      return out;
    };

    // ── Functions
    for (const { node, contract } of fnNodes) {
      const id = fnIdOf.get(node.id)!;
      const loc = locate(ctx, node);
      const content = ctx.contents.get(loc.file) ?? '';
      const isModifier = node.nodeType === 'ModifierDefinition';
      const kind: FactsFunction['kind'] = isModifier
        ? 'modifier'
        : node.kind === 'constructor' || node.kind === 'fallback' || node.kind === 'receive'
          ? node.kind
          : 'function';
      const ckind = contract ? contractKind(contract) : 'library';
      const visibility = isModifier ? 'modifier' : String(node.visibility ?? 'internal');

      const calls: FactsFunction['calls'] = [];
      // One edge per (target, kind); `at` collects the caller's lines that make the call.
      const pushCall = (to: string | undefined, k: CallKind, line?: number) => {
        if (!to || to === id) return;
        let edge = calls.find((c) => c.to === to && c.kind === k);
        if (!edge) {
          edge = { to, kind: k, at: [] };
          calls.push(edge);
        }
        if (line && !edge.at!.includes(line)) edge.at!.push(line);
      };
      const pushVirtual = (targetAstId: number, line?: number) => {
        for (const o of allOverriders(targetAstId)) pushCall(fnIdOf.get(o), 'virtual', line);
      };
      const externalCalls: FactsFunction['external_calls'] = [];
      const reads = new Set<string>();
      const writes = new Set<string>();
      const emits = new Set<string>();

      // Modifiers applied / base constructors invoked.
      const modifiers: string[] = [];
      for (const inv of node.modifiers ?? []) {
        const ref = inv.modifierName?.referencedDeclaration;
        const target = typeof ref === 'number' ? ctx.byId.get(ref) : undefined;
        const line = locate(ctx, inv).line_start;
        if (target?.nodeType === 'ModifierDefinition') {
          const mid = fnIdOf.get(ref);
          if (mid) {
            modifiers.push(mid);
            pushCall(mid, 'modifier', line);
            pushVirtual(ref, line);
          }
        } else if (target?.nodeType === 'ContractDefinition') {
          const ctor = (target.nodes ?? []).find(
            (m: N) => m.nodeType === 'FunctionDefinition' && m.kind === 'constructor',
          );
          if (ctor) pushCall(fnIdOf.get(ctor.id), 'constructor', line);
        }
      }

      // Storage-pointer aliases: `Position storage p = positions[x];`
      const alias = new Map<number, string>();
      const stateRoot = (expr: N | undefined): string | null => {
        let cur = expr;
        for (let i = 0; i < 64 && cur; i++) {
          if (cur.nodeType === 'Identifier') {
            const ref = cur.referencedDeclaration;
            return stateVarIdOf.get(ref) ?? alias.get(ref) ?? null;
          }
          if (cur.nodeType === 'MemberAccess') {
            const ref = cur.referencedDeclaration;
            if (typeof ref === 'number' && stateVarIdOf.has(ref)) return stateVarIdOf.get(ref)!;
            cur = cur.expression;
          } else if (cur.nodeType === 'IndexAccess' || cur.nodeType === 'IndexRangeAccess') {
            cur = cur.baseExpression;
          } else if (cur.nodeType === 'FunctionCall' && cur.kind === 'typeConversion') {
            cur = cur.arguments?.[0];
          } else return null;
        }
        return null;
      };
      const pureWriteNodes = new Set<number>();
      const markWrite = (lhs: N | undefined, alsoRead: boolean) => {
        if (!lhs) return;
        if (lhs.nodeType === 'TupleExpression') {
          for (const c of lhs.components ?? []) markWrite(c ?? undefined, alsoRead);
          return;
        }
        const root = stateRoot(lhs);
        if (!root) return;
        writes.add(root);
        if (alsoRead) reads.add(root);
        else if (lhs.nodeType === 'Identifier') pureWriteNodes.add(lhs.id);
      };

      let hasAssembly = false;
      walk(node.body, (n) => {
        switch (n.nodeType) {
          case 'InlineAssembly':
            hasAssembly = true;
            return false;
          case 'VariableDeclarationStatement': {
            const decls: N[] = n.declarations ?? [];
            if (decls.length === 1 && decls[0]?.storageLocation === 'storage') {
              const root = stateRoot(n.initialValue);
              if (root) alias.set(decls[0].id, root);
            }
            return;
          }
          case 'Assignment':
            markWrite(n.leftHandSide, n.operator !== '=');
            return;
          case 'UnaryOperation':
            if (n.operator === '++' || n.operator === '--') markWrite(n.subExpression, true);
            else if (n.operator === 'delete') markWrite(n.subExpression, false);
            return;
          case 'EmitStatement': {
            const ev = ctx.byId.get(n.eventCall?.expression?.referencedDeclaration);
            if (ev?.name) emits.add(ev.name);
            return;
          }
          case 'NewExpression':
            externalCalls.push({
              target_type: normType(
                n.typeName?.typeDescriptions?.typeString ?? n.typeDescriptions?.typeString,
              ),
              member: 'new',
              kind: 'create',
              line: locate(ctx, n).line_start,
            });
            return;
          case 'FunctionCall': {
            if (n.kind !== 'functionCall') return;
            let callee: N = n.expression;
            if (callee?.nodeType === 'FunctionCallOptions') callee = callee.expression;
            const line = locate(ctx, n).line_start;
            if (callee?.nodeType === 'Identifier') {
              const ref = callee.referencedDeclaration;
              const target = typeof ref === 'number' && ref > 0 ? ctx.byId.get(ref) : undefined;
              if (target?.nodeType === 'FunctionDefinition') {
                const owner = ctx.contractOf.get(ref);
                pushCall(
                  fnIdOf.get(ref),
                  owner?.contractKind === 'library' && owner !== contract ? 'library' : 'internal',
                  line,
                );
                pushVirtual(ref, line);
              }
              return;
            }
            if (callee?.nodeType === 'MemberAccess') {
              const ref = callee.referencedDeclaration;
              const base: N = callee.expression ?? {};
              const baseType = String(base.typeDescriptions?.typeString ?? '');
              const member = String(callee.memberName);
              // push/pop on a storage array is a write
              if ((member === 'push' || member === 'pop') && !ref) {
                const root = stateRoot(base);
                if (root) {
                  writes.add(root);
                  reads.add(root);
                }
                return;
              }
              if (typeof ref === 'number' && ref > 0) {
                const target = ctx.byId.get(ref);
                if (target?.nodeType !== 'FunctionDefinition') {
                  // Public getter on another contract: an external call with no function node.
                  if (baseType.startsWith('contract ')) {
                    externalCalls.push({
                      target_type: normType(baseType),
                      member,
                      kind: 'typed',
                      line,
                    });
                  }
                  return;
                }
                const owner = ctx.contractOf.get(ref);
                const to = fnIdOf.get(ref);
                if (base.nodeType === 'Identifier' && base.referencedDeclaration === SUPER_ID) {
                  pushCall(to, 'super', line);
                } else if (
                  base.nodeType === 'Identifier' &&
                  base.referencedDeclaration === THIS_ID
                ) {
                  pushCall(to, 'this', line);
                  pushVirtual(ref, line);
                } else if (owner?.contractKind === 'library') {
                  pushCall(to, 'library', line);
                } else if (
                  baseType.startsWith('type(contract ') ||
                  baseType.startsWith('type(library ')
                ) {
                  pushCall(to, 'internal', line);
                } else if (baseType.startsWith('contract ')) {
                  externalCalls.push({
                    target_type: normType(baseType),
                    member,
                    kind: 'typed',
                    line,
                  });
                  // Resolve to in-scope implementations: the referenced declaration (often an
                  // interface function) plus every override of it.
                  pushCall(to, 'external', line);
                  pushVirtual(ref, line);
                } else {
                  pushCall(to, 'internal', line);
                }
                return;
              }
              // Builtin members on addresses.
              if (/^address/.test(baseType)) {
                if (member === 'call' || member === 'delegatecall' || member === 'staticcall') {
                  externalCalls.push({ target_type: 'address', member, kind: 'low_level', line });
                } else if (member === 'transfer' || member === 'send') {
                  externalCalls.push({ target_type: 'address', member, kind: 'transfer', line });
                }
              }
            }
            return;
          }
        }
      });
      // Reads: every reference to a state variable that is not a pure write target.
      walk(node.body, (n) => {
        if (n.nodeType === 'InlineAssembly') return false;
        if (n.nodeType === 'Identifier' && !pureWriteNodes.has(n.id)) {
          const ref = n.referencedDeclaration;
          const sv = stateVarIdOf.get(ref) ?? alias.get(ref);
          if (sv) reads.add(sv);
        }
        if (n.nodeType === 'MemberAccess') {
          const ref = n.referencedDeclaration;
          if (typeof ref === 'number' && stateVarIdOf.has(ref)) reads.add(stateVarIdOf.get(ref)!);
        }
      });
      if (hasAssembly)
        warnings.add(`${id}: inline assembly is not analyzed for reads/writes/calls.`);

      const implemented = node.implemented !== false && (node.body !== null || isModifier);
      const isEntry =
        !isModifier &&
        implemented &&
        (ckind === 'contract' || ckind === 'abstract') &&
        (visibility === 'external' ||
          visibility === 'public' ||
          kind === 'fallback' ||
          kind === 'receive');

      functions.set(id, {
        id,
        contract: contract ? contract.name : '(free)',
        name: kind === 'function' || kind === 'modifier' ? String(node.name) : kind,
        signature: id.slice(id.indexOf('.') + 1),
        kind,
        visibility,
        mutability: isModifier ? 'nonpayable' : String(node.stateMutability ?? 'nonpayable'),
        file: loc.file,
        line_start: loc.line_start,
        line_end: loc.line_end,
        nsloc: content ? countNslocInRange(content, loc.line_start, loc.line_end) : 0,
        virtual: Boolean(node.virtual),
        overrides: [...(node.baseFunctions ?? []), ...(node.baseModifiers ?? [])]
          .map((b: number) => fnIdOf.get(b))
          .filter((x: string | undefined): x is string => !!x),
        modifiers,
        calls,
        called_by: [],
        external_calls: externalCalls,
        reads: [...reads].sort(),
        writes: [...writes].sort(),
        emits: [...emits].sort(),
        is_entry_point: isEntry,
        in_scope: contract ? opts.inScope(fileOf(contract)) : opts.inScope(loc.file),
      });
    }

    // ── Storage layouts (compiler) for included, in-scope, stateful contracts.
    for (const [rawPath, byName] of Object.entries(bi.output?.contracts ?? {})) {
      const file = norm(rawPath);
      if (!opts.inScope(file)) continue;
      for (const [name, art] of Object.entries(byName)) {
        const sl = art.storageLayout;
        if (!sl?.storage) continue;
        const types: N = sl.types ?? {};
        layouts[name] = (sl.storage as N[]).map((e) => {
          const declarer = ctx.contractOf.get(e.astId);
          return {
            label: String(e.label),
            slot: String(e.slot),
            offset: Number(e.offset ?? 0),
            type: String(types[e.type]?.label ?? e.type),
            bytes:
              types[e.type]?.numberOfBytes !== undefined
                ? Number(types[e.type].numberOfBytes)
                : undefined,
            declared_in: declarer?.name ?? name,
          };
        });
      }
    }
  }

  // ── called_by (reverse edges); `at` stays the caller's lines.
  for (const f of functions.values()) {
    for (const c of f.calls) {
      const t = functions.get(c.to);
      if (t && !t.called_by.some((x) => x.from === f.id && x.kind === c.kind)) {
        t.called_by.push({ from: f.id, kind: c.kind, at: [...(c.at ?? [])].sort((a, b) => a - b) });
      }
    }
    for (const c of f.calls) c.at?.sort((a, b) => a - b);
  }

  // ── Entry points per deployable in-scope contract (most-derived implementation wins).
  const entry_points: Record<string, string[]> = {};
  for (const c of contracts.values()) {
    if (c.kind !== 'contract' || !c.in_scope) continue;
    const seen = new Map<string, string>();
    for (const anc of c.linearization) {
      for (const f of functions.values()) {
        if (f.contract !== anc || f.kind === 'modifier' || f.kind === 'constructor') continue;
        const exposed =
          f.visibility === 'external' ||
          f.visibility === 'public' ||
          f.kind === 'fallback' ||
          f.kind === 'receive';
        if (!exposed || seen.has(f.signature)) continue;
        const owner = contracts.get(anc);
        if (owner?.kind === 'interface') continue;
        seen.set(f.signature, f.id);
      }
    }
    entry_points[c.name] = [...seen.values()].sort();
  }

  return {
    generated_at: new Date().toISOString(),
    ...(opts.commit ? { commit: opts.commit } : {}),
    source: 'solc-ast',
    compiler: { version: compilerVersion || 'unknown', toolchain: opts.toolchain },
    layout_source: Object.keys(layouts).length > 0 ? 'compiler' : 'declaration-order',
    warnings: [...warnings].sort(),
    contracts: [...contracts.values()].sort((a, b) => a.name.localeCompare(b.name)),
    functions: [...functions.values()].sort((a, b) => a.id.localeCompare(b.id)),
    state_vars: [...stateVars.values()].sort((a, b) => a.id.localeCompare(b.id)),
    storage_layouts: layouts,
    entry_points,
  };
}
