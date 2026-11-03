import * as parser from '@solidity-parser/parser';

/**
 * A per-file "code model" built in one AST pass: everything the differential
 * analysis needs to (a) compare two versions of a file entity by entity and
 * (b) build an intra-scope call / state-coupling graph on the head version.
 *
 * Deliberately separate from `parsers/solidity-parser.ts` (which feeds the
 * per-file stats/access/state analyses): this one keeps character ranges,
 * normalized bodies, call references and state reads/writes per function.
 */

export type ContractKind = 'contract' | 'interface' | 'library' | 'abstract' | 'free';

export interface CallRef {
  /**
   * internal  — `foo(...)`             (resolved in the caller's hierarchy, then free functions)
   * super     — `super.foo(...)`       (resolved in the caller's bases)
   * this      — `this.foo(...)`        (resolved in the caller's hierarchy)
   * qualified — `Lib.foo(...)` / `Base.foo(...)` where the qualifier is a known contract name
   * typed     — `x.foo(...)` where `x` is declared with a contract/interface type in scope
   * member    — `x.foo(...)` where the receiver type is unknown (name-only, low confidence)
   * base_ctor — a base-constructor invocation in a constructor's modifier list
   */
  kind: 'internal' | 'super' | 'this' | 'qualified' | 'typed' | 'member' | 'base_ctor';
  name: string;
  /** Contract/interface/library name for `qualified` / `typed` / `base_ctor`. */
  target?: string;
  argCount: number;
}

export interface CodeUnit {
  contract: string;
  kind: 'function' | 'modifier';
  name: string;
  /** `name(type1,type2)`; constructor/fallback/receive use those names. */
  signature: string;
  visibility: string;
  stateMutability: string | null;
  isConstructor: boolean;
  isFallback: boolean;
  isReceive: boolean;
  modifiers: string[];
  paramCount: number;
  lineStart: number;
  lineEnd: number;
  /** Raw source of the whole definition. */
  raw: string;
  /** Comment- and whitespace-insensitive form of `raw`, for change detection. */
  normalized: string;
  calls: CallRef[];
  /** State variables (of the declaring hierarchy) read / written in the body. */
  reads: string[];
  writes: string[];
}

export interface StateVarModel {
  name: string;
  type: string;
  mutability: 'mutable' | 'constant' | 'immutable';
  visibility: string;
  /** Normalized initializer source ('' when none). */
  initial: string;
  lineStart: number;
}

export interface NamedSigModel {
  name: string;
  /** `name(type1,type2)` */
  signature: string;
  lineStart: number;
}

export interface StructModel {
  name: string;
  /** `type name` per member, in order. */
  members: string[];
  lineStart: number;
}

export interface ContractModel {
  name: string;
  kind: ContractKind;
  file: string;
  bases: string[];
  lineStart: number;
  lineEnd: number;
  units: CodeUnit[];
  stateVars: StateVarModel[];
  events: NamedSigModel[];
  errors: NamedSigModel[];
  structs: StructModel[];
}

export interface FileModel {
  file: string;
  contracts: ContractModel[];
  parseError?: string;
}

type AnyNode = { type: string; [k: string]: unknown };

const SKIP_KEYS = new Set(['loc', 'range', 'comments', 'tokens']);

function isNode(v: unknown): v is AnyNode {
  return typeof v === 'object' && v !== null && typeof (v as AnyNode).type === 'string';
}

/** Depth-first visit; `visit` returns false to stop descending into a node. */
function walk(node: unknown, visit: (n: AnyNode) => boolean | void): void {
  if (Array.isArray(node)) {
    for (const item of node) walk(item, visit);
    return;
  }
  if (!isNode(node)) return;
  if (visit(node) === false) return;
  for (const [k, v] of Object.entries(node)) {
    if (SKIP_KEYS.has(k)) continue;
    if (Array.isArray(v) || isNode(v)) walk(v, visit);
  }
}

export function typeToString(t: unknown): string {
  if (!isNode(t)) return 'unknown';
  switch (t.type) {
    case 'ElementaryTypeName':
      return String(t.name ?? 'unknown');
    case 'UserDefinedTypeName':
      return String(t.namePath ?? 'unknown');
    case 'ArrayTypeName': {
      const len = t.length as AnyNode | null;
      const lenStr = isNode(len) && len.type === 'NumberLiteral' ? String(len.number) : '';
      return `${typeToString(t.baseTypeName)}[${lenStr}]`;
    }
    case 'Mapping':
      return `mapping(${typeToString(t.keyType)}=>${typeToString(t.valueType)})`;
    case 'FunctionTypeName':
      return 'function';
    default:
      return 'unknown';
  }
}

/**
 * Strip comments (outside string literals) and collapse whitespace, so a
 * re-indented or re-commented body compares equal to the original.
 */
export function normalizeSource(src: string): string {
  let out = '';
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    const next = src[i + 1];
    if (c === '"' || c === "'") {
      const quote = c;
      let j = i + 1;
      while (j < n && src[j] !== quote) {
        if (src[j] === '\\') j++;
        j++;
      }
      out += src.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    if (c === '/' && next === '/') {
      while (i < n && src[i] !== '\n') i++;
      out += ' ';
      continue;
    }
    if (c === '/' && next === '*') {
      i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) i++;
      i += 2;
      out += ' ';
      continue;
    }
    out += c;
    i++;
  }
  return out
    .replace(/\s+/g, ' ')
    .replace(/\s*([{}();,=+\-*/<>!&|^%?:[\]])\s*/g, '$1')
    .trim();
}

function sliceRange(source: string, node: AnyNode): string {
  const range = node.range as [number, number] | undefined;
  if (!range) return '';
  return source.slice(range[0], range[1] + 1);
}

function lineOf(node: AnyNode, which: 'start' | 'end'): number {
  const loc = node.loc as { start: { line: number }; end: { line: number } } | undefined;
  return loc?.[which].line ?? 0;
}

const BUILTIN_CALLS = new Set([
  'require',
  'assert',
  'revert',
  'keccak256',
  'sha256',
  'ripemd160',
  'ecrecover',
  'addmod',
  'mulmod',
  'selfdestruct',
  'blockhash',
  'gasleft',
  'type',
  'abi',
]);

const ADDRESS_MEMBERS = new Set([
  'call',
  'delegatecall',
  'staticcall',
  'transfer',
  'send',
  'encode',
  'encodePacked',
  'encodeWithSelector',
  'encodeWithSignature',
  'encodeCall',
  'decode',
  'push',
  'pop',
  'concat',
]);

/** Walk down `a.b[c].d` style lvalues to the root identifier name. */
function rootIdentifier(expr: unknown): string | null {
  let cur = expr;
  for (let guard = 0; guard < 32 && isNode(cur); guard++) {
    if (cur.type === 'Identifier') return String(cur.name);
    if (cur.type === 'IndexAccess') cur = cur.base;
    else if (cur.type === 'IndexRangeAccess') cur = cur.base;
    else if (cur.type === 'MemberAccess') cur = cur.expression;
    else return null;
  }
  return null;
}

interface UnitContext {
  /** Names a bare identifier may resolve to as a state variable (own + inherited). */
  stateVarNames: Set<string>;
  /** name → declared type, for state vars visible to the unit. */
  stateVarTypes: Map<string, string>;
  /** All contract/interface/library names known across scope. */
  contractNames: Set<string>;
}

function analyzeBody(
  unitNode: AnyNode,
  ctx: UnitContext,
): { calls: CallRef[]; reads: string[]; writes: string[] } {
  const calls: CallRef[] = [];
  const reads = new Set<string>();
  const writes = new Set<string>();

  // Locals / params shadow state vars and give receiver types for typed calls.
  const localTypes = new Map<string, string>();
  const declare = (decl: unknown) => {
    if (!isNode(decl)) return;
    const name = decl.name as string | null;
    if (name) localTypes.set(name, typeToString(decl.typeName));
  };
  for (const p of (unitNode.parameters as unknown[]) ?? []) declare(p);
  for (const p of (unitNode.returnParameters as unknown[]) ?? []) declare(p);
  walk(unitNode.body, (n) => {
    if (n.type === 'VariableDeclarationStatement') {
      for (const v of (n.variables as unknown[]) ?? []) declare(v);
    }
  });

  const receiverType = (name: string): string | null => {
    const t = localTypes.get(name) ?? ctx.stateVarTypes.get(name);
    if (!t) return null;
    const base = t.replace(/\[\d*\]$/, '');
    return ctx.contractNames.has(base) ? base : null;
  };

  const isState = (name: string | null): name is string =>
    !!name && !localTypes.has(name) && ctx.stateVarNames.has(name);

  const recordCall = (call: AnyNode) => {
    let callee = call.expression as AnyNode;
    if (isNode(callee) && callee.type === 'NameValueExpression')
      callee = callee.expression as AnyNode;
    const argCount = ((call.arguments as unknown[]) ?? []).length;
    if (!isNode(callee)) return;
    if (callee.type === 'Identifier') {
      const name = String(callee.name);
      if (BUILTIN_CALLS.has(name)) return;
      // `IERC20(x)` / `Vault(addr)` are type conversions, not calls.
      if (ctx.contractNames.has(name)) return;
      calls.push({ kind: 'internal', name, argCount });
      return;
    }
    if (callee.type === 'MemberAccess') {
      const name = String(callee.memberName);
      const recv = callee.expression as AnyNode;
      if (isNode(recv) && recv.type === 'Identifier') {
        const rname = String(recv.name);
        if (rname === 'super') return void calls.push({ kind: 'super', name, argCount });
        if (rname === 'this') return void calls.push({ kind: 'this', name, argCount });
        if (rname === 'abi' || rname === 'msg' || rname === 'block' || rname === 'tx') return;
        if (ctx.contractNames.has(rname) && !localTypes.has(rname)) {
          return void calls.push({ kind: 'qualified', name, target: rname, argCount });
        }
        const t = receiverType(rname);
        if (t) return void calls.push({ kind: 'typed', name, target: t, argCount });
      }
      // `IFoo(addr).bar()` — receiver is a type conversion call.
      if (isNode(recv) && recv.type === 'FunctionCall') {
        const conv = recv.expression as AnyNode;
        if (
          isNode(conv) &&
          conv.type === 'Identifier' &&
          ctx.contractNames.has(String(conv.name))
        ) {
          return void calls.push({ kind: 'typed', name, target: String(conv.name), argCount });
        }
      }
      if (ADDRESS_MEMBERS.has(name)) return;
      calls.push({ kind: 'member', name, argCount });
    }
  };

  walk(unitNode.body, (n) => {
    switch (n.type) {
      case 'EmitStatement':
        // Events are not calls; still record state reads inside the arguments.
        walk((n.eventCall as AnyNode)?.arguments, (m) => {
          if (m.type === 'Identifier' && isState(String(m.name))) reads.add(String(m.name));
          if (m.type === 'FunctionCall') recordCall(m);
        });
        return false;
      case 'FunctionCall':
        recordCall(n);
        return;
      case 'BinaryOperation': {
        const op = String(n.operator);
        if (op === '=' || (op.endsWith('=') && !['==', '!=', '<=', '>='].includes(op))) {
          const root = rootIdentifier(n.left);
          if (isState(root)) {
            writes.add(root);
            if (op !== '=') reads.add(root);
          }
        }
        return;
      }
      case 'UnaryOperation': {
        const op = String(n.operator);
        if (op === '++' || op === '--' || op === 'delete') {
          const root = rootIdentifier(n.subExpression);
          if (isState(root)) writes.add(root);
        }
        return;
      }
      case 'Identifier': {
        const name = String(n.name);
        if (isState(name)) reads.add(name);
        return;
      }
      case 'MemberAccess': {
        // `.push(...)` / `.pop()` on a state array is a write.
        const member = String(n.memberName);
        if (member === 'push' || member === 'pop') {
          const root = rootIdentifier(n.expression);
          if (isState(root)) writes.add(root);
        }
        return;
      }
    }
  });

  // An identifier that is written is not also a "read" unless used elsewhere;
  // the Identifier visitor above sees lvalues too, so reads ⊇ writes here. Keep
  // it: a write site still depends on the variable's declared semantics.
  return { calls, reads: [...reads].sort(), writes: [...writes].sort() };
}

function signatureOf(name: string, params: unknown[] | null | undefined): string {
  return `${name}(${(params ?? []).map((p) => (isNode(p) ? typeToString(p.typeName) : 'unknown')).join(',')})`;
}

/**
 * Build the code model of one file. `contractNames` (all contract-like names in
 * scope) lets the body walker tell type conversions and typed receivers apart.
 * `inheritedStateVars` maps a contract name to the state vars of its whole
 * linearized hierarchy (name → type); pass an empty map for a first pass.
 */
export function buildFileModel(
  source: string,
  file: string,
  contractNames: Set<string> = new Set(),
  inheritedStateVars: Map<string, Map<string, string>> = new Map(),
): FileModel {
  let ast: AnyNode;
  try {
    ast = parser.parse(source, { loc: true, range: true, tolerant: true }) as unknown as AnyNode;
  } catch (err) {
    return { file, contracts: [], parseError: err instanceof Error ? err.message : String(err) };
  }

  const contracts: ContractModel[] = [];
  const free: ContractModel = {
    name: '(free)',
    kind: 'free',
    file,
    bases: [],
    lineStart: 0,
    lineEnd: 0,
    units: [],
    stateVars: [],
    events: [],
    errors: [],
    structs: [],
  };

  const children = (ast.children as AnyNode[]) ?? [];

  const buildUnit = (node: AnyNode, contract: string, ctx: UnitContext): CodeUnit => {
    const isModifier = node.type === 'ModifierDefinition';
    const isConstructor = Boolean(node.isConstructor);
    const isFallback = Boolean(node.isFallback);
    const isReceive = Boolean(node.isReceiveEther);
    const name = isModifier
      ? String(node.name)
      : ((node.name as string | null) ??
        (isConstructor ? 'constructor' : isFallback ? 'fallback' : 'receive'));
    const params = (node.parameters as unknown[] | null) ?? [];
    const raw = sliceRange(source, node);
    const body = analyzeBody(node, ctx);
    const modifierInvocations = ((node.modifiers as AnyNode[]) ?? []).map((m) => ({
      name: String(m.name),
      argCount: ((m.arguments as unknown[]) ?? []).length,
    }));
    // Base-constructor invocations show up as "modifiers" on constructors.
    for (const m of modifierInvocations) {
      if (contractNames.has(m.name)) {
        body.calls.push({
          kind: 'base_ctor',
          name: 'constructor',
          target: m.name,
          argCount: m.argCount,
        });
      }
    }
    return {
      contract,
      kind: isModifier ? 'modifier' : 'function',
      name,
      signature: isConstructor || isFallback || isReceive ? `${name}()` : signatureOf(name, params),
      visibility: isModifier ? 'modifier' : String(node.visibility ?? 'default'),
      stateMutability: (node.stateMutability as string | null) ?? null,
      isConstructor,
      isFallback,
      isReceive,
      modifiers: modifierInvocations.filter((m) => !contractNames.has(m.name)).map((m) => m.name),
      paramCount: params.length,
      lineStart: lineOf(node, 'start'),
      lineEnd: lineOf(node, 'end'),
      raw,
      normalized: normalizeSource(raw),
      calls: body.calls,
      reads: body.reads,
      writes: body.writes,
    };
  };

  for (const child of children) {
    if (child.type === 'FunctionDefinition') {
      const ctx: UnitContext = {
        stateVarNames: new Set(),
        stateVarTypes: new Map(),
        contractNames,
      };
      free.units.push(buildUnit(child, '(free)', ctx));
      continue;
    }
    if (child.type !== 'ContractDefinition') continue;

    const kindRaw = String(child.kind);
    const kind: ContractKind =
      kindRaw === 'interface'
        ? 'interface'
        : kindRaw === 'library'
          ? 'library'
          : kindRaw === 'abstract'
            ? 'abstract'
            : 'contract';
    const name = String(child.name);
    const bases = ((child.baseContracts as AnyNode[]) ?? []).map((b) =>
      String((b.baseName as AnyNode)?.namePath ?? ''),
    );
    const subNodes = (child.subNodes as AnyNode[]) ?? [];

    const stateVars: StateVarModel[] = [];
    const events: NamedSigModel[] = [];
    const errors: NamedSigModel[] = [];
    const structs: StructModel[] = [];

    for (const sub of subNodes) {
      if (sub.type === 'StateVariableDeclaration') {
        const init = sub.initialValue as AnyNode | null;
        for (const v of (sub.variables as AnyNode[]) ?? []) {
          stateVars.push({
            name: String(v.name),
            type: typeToString(v.typeName),
            mutability: v.isDeclaredConst ? 'constant' : v.isImmutable ? 'immutable' : 'mutable',
            visibility: String(v.visibility ?? 'internal'),
            initial: init ? normalizeSource(sliceRange(source, init)) : '',
            lineStart: lineOf(sub, 'start'),
          });
        }
      } else if (sub.type === 'EventDefinition') {
        events.push({
          name: String(sub.name),
          signature: signatureOf(String(sub.name), sub.parameters as unknown[]),
          lineStart: lineOf(sub, 'start'),
        });
      } else if (sub.type === 'CustomErrorDefinition') {
        errors.push({
          name: String(sub.name),
          signature: signatureOf(String(sub.name), sub.parameters as unknown[]),
          lineStart: lineOf(sub, 'start'),
        });
      } else if (sub.type === 'StructDefinition') {
        structs.push({
          name: String(sub.name),
          members: ((sub.members as AnyNode[]) ?? []).map(
            (m) => `${typeToString(m.typeName)} ${String(m.name ?? '')}`,
          ),
          lineStart: lineOf(sub, 'start'),
        });
      }
    }

    // State vars visible to this contract's bodies: inherited (if known) + own.
    const visible = new Map<string, string>(inheritedStateVars.get(name) ?? []);
    for (const sv of stateVars) visible.set(sv.name, sv.type);
    const ctx: UnitContext = {
      stateVarNames: new Set(visible.keys()),
      stateVarTypes: visible,
      contractNames,
    };

    const units: CodeUnit[] = [];
    for (const sub of subNodes) {
      if (sub.type === 'FunctionDefinition' || sub.type === 'ModifierDefinition') {
        units.push(buildUnit(sub, name, ctx));
      }
    }

    contracts.push({
      name,
      kind,
      file,
      bases,
      lineStart: lineOf(child, 'start'),
      lineEnd: lineOf(child, 'end'),
      units,
      stateVars,
      events,
      errors,
      structs,
    });
  }

  if (free.units.length > 0) contracts.push(free);
  return { file, contracts };
}

/** Contract-like names declared in a source (cheap first pass for buildFileModel). */
export function collectContractNames(source: string): string[] {
  const names: string[] = [];
  try {
    const ast = parser.parse(source, { tolerant: true }) as unknown as AnyNode;
    for (const child of (ast.children as AnyNode[]) ?? []) {
      if (child.type === 'ContractDefinition') names.push(String(child.name));
    }
  } catch {
    /* unparseable — caller records the parse error on the full pass */
  }
  return names;
}

/** Linearized base list (C3-ish, most-base last), restricted to known contracts. */
export function ancestorsOf(name: string, byName: Map<string, ContractModel>): string[] {
  const out: string[] = [];
  const seen = new Set<string>([name]);
  const visit = (n: string) => {
    const c = byName.get(n);
    if (!c) return;
    for (const b of [...c.bases].reverse()) {
      if (seen.has(b)) continue;
      seen.add(b);
      out.push(b);
      visit(b);
    }
  };
  visit(name);
  return out;
}

/**
 * Build models for a whole set of sources with inherited state vars resolved:
 * pass 1 collects contract names and own state vars, pass 2 rebuilds each file
 * with every contract's full visible state (own + ancestors).
 */
export function buildScopeModel(sources: Map<string, string>): FileModel[] {
  const contractNames = new Set<string>();
  for (const src of sources.values())
    for (const n of collectContractNames(src)) contractNames.add(n);

  const first: FileModel[] = [];
  for (const [file, src] of sources) first.push(buildFileModel(src, file, contractNames));

  const byName = new Map<string, ContractModel>();
  for (const fm of first)
    for (const c of fm.contracts) if (c.kind !== 'free') byName.set(c.name, c);

  const inherited = new Map<string, Map<string, string>>();
  for (const c of byName.values()) {
    const vis = new Map<string, string>();
    for (const anc of ancestorsOf(c.name, byName).reverse()) {
      for (const sv of byName.get(anc)?.stateVars ?? []) vis.set(sv.name, sv.type);
    }
    inherited.set(c.name, vis);
  }

  const out: FileModel[] = [];
  for (const [file, src] of sources) out.push(buildFileModel(src, file, contractNames, inherited));
  return out;
}
