/**
 * Navigation index (`.hex/xref.json`): where every declaration is, and every
 * place the code refers to one, straight from the compiler's
 * `referencedDeclaration`. It powers go to definition, callers and peek in the
 * dashboard's code viewer: the call graph lives here, the UI only walks it.
 *
 * Keys match facts ids where facts has the thing: `Vault.withdraw(uint256)`
 * for functions and modifiers, `Vault.totalShares` for state variables; other
 * declarations are `Contract.Name` (or `Name` at file level).
 *
 * Pure: no fs, no process.
 */
import {
  contractKind,
  lineIndex,
  lineOf,
  normType,
  signatureOf,
  walk,
  type AstNode as N,
  type BuildInfo,
} from './extract.js';
import { findImplementations, type ImplCandidate, type Implementation } from './implementations.js';

export type XrefDeclKind =
  | 'contract'
  | 'interface'
  | 'library'
  | 'function'
  | 'modifier'
  | 'state_var'
  | 'event'
  | 'error'
  | 'struct'
  | 'enum'
  | 'type'
  | 'constant';

export interface XrefDecl {
  kind: XrefDeclKind;
  name: string;
  /** Owning contract; absent at file level. */
  contract?: string;
  file: string;
  /** Where the name is (1-based line, 0-based UTF-16 column). */
  line: number;
  col: number;
  line_start: number;
  line_end: number;
  /** `withdraw(uint256)`, `Deposit(address,uint256)`, `uint256 totalShares`. */
  signature?: string;
  /** First sentence of the NatSpec (@notice, else @dev, else the text). */
  doc?: string;
  in_scope: boolean;
}

/** `[line, col, length, key, isDefinition]`: 1-based line, 0-based UTF-16 column. */
export type XrefRef = [number, number, number, string, 0 | 1];

export interface Xref {
  version: 1;
  generated_at: string;
  commit?: string;
  decls: Record<string, XrefDecl>;
  /** Per file, sorted by position. */
  refs: Record<string, XrefRef[]>;
  /** Interface and virtual functions → where they actually run. */
  impls: Record<string, Implementation[]>;
}

export interface XrefOptions {
  inScope: (file: string) => boolean;
  commit?: string;
  normalizePath?: (p: string) => string;
}

const MEMBER_KINDS: Record<string, XrefDeclKind> = {
  EventDefinition: 'event',
  ErrorDefinition: 'error',
  StructDefinition: 'struct',
  EnumDefinition: 'enum',
  UserDefinedValueTypeDefinition: 'type',
};

/** The parameters of a public variable's getter: one per mapping key and array index. */
function getterParams(t: N | undefined): string[] {
  if (t?.nodeType === 'Mapping')
    return [normType(t.keyType?.typeDescriptions?.typeString), ...getterParams(t.valueType)];
  if (t?.nodeType === 'ArrayTypeName') return ['uint256', ...getterParams(t.baseType)];
  return [];
}

const paramList = (n: N) =>
  (n.parameters?.parameters ?? []).map((p: N) => normType(p.typeDescriptions?.typeString));

/** First sentence of a NatSpec block: @notice, else @dev, else the untagged text. */
export function docSentence(doc: unknown): string | undefined {
  const text =
    typeof doc === 'string' ? doc : typeof (doc as N)?.text === 'string' ? (doc as N).text : '';
  if (!text.trim()) return undefined;
  const tags = new Map<string, string>();
  let tag = '';
  for (const raw of text.split('\n')) {
    const line = raw.replace(/^\s*\*?\s?/, '');
    const m = /^@(\w+)\s*(.*)$/.exec(line.trim());
    if (m) {
      tag = m[1];
      tags.set(tag, m[2]);
    } else if (line.trim()) {
      tags.set(tag, `${tags.get(tag) ?? ''} ${line.trim()}`.trim());
    }
  }
  const body = (tags.get('notice') ?? tags.get('dev') ?? tags.get('') ?? '').trim();
  if (!body) return undefined;
  const first = /^(.+?[.!?])(\s|$)/.exec(body)?.[1] ?? body;
  return first.length > 220 ? `${first.slice(0, 217)}...` : first;
}

export function extractXref(buildInfos: BuildInfo[], opts: XrefOptions): Xref {
  const norm = opts.normalizePath ?? ((p: string) => p);
  const decls: Record<string, XrefDecl> = {};
  const refs: Record<string, XrefRef[]> = {};
  const candidates = new Map<string, ImplCandidate>();
  const implTargets = new Set<string>();

  for (const bi of buildInfos) {
    const sources = bi.output?.sources ?? {};
    const fileOfIndex = new Map<number, string>();
    const bufs = new Map<string, Buffer>();
    const starts = new Map<string, number[]>();
    for (const [rawPath, src] of Object.entries(sources)) {
      const file = norm(rawPath);
      fileOfIndex.set(src.id, file);
      const content = bi.input?.sources?.[rawPath]?.content;
      if (content !== undefined) {
        bufs.set(file, Buffer.from(content, 'utf-8'));
        starts.set(file, lineIndex(content));
      }
    }

    /** solc `start:length:index` (UTF-8 bytes) → line and UTF-16 column/length. */
    const pos = (src: unknown) => {
      const [s, l, i] = String(src ?? '')
        .split(':')
        .map(Number);
      const file = fileOfIndex.get(i);
      if (file === undefined || !Number.isFinite(s) || s < 0) return null;
      const buf = bufs.get(file);
      const st = starts.get(file);
      if (!buf || !st) return null;
      const line = lineOf(st, s);
      const col = buf.subarray(st[line - 1], s).toString('utf-8').length;
      const len = buf.subarray(s, s + Math.max(0, l)).toString('utf-8').length;
      const endLine = lineOf(st, s + Math.max(0, l - 1));
      return { file, line, col, len, endLine };
    };

    // ── Declarations: keys by AST id (ids are unique only inside one build-info).
    const keyOf = new Map<number, string>();
    const addDecl = (
      node: N,
      key: string,
      kind: XrefDeclKind,
      contract: N | null,
      sig?: string,
    ) => {
      keyOf.set(node.id, key);
      const range = pos(node.src);
      if (!range) return;
      const name = pos(node.nameLocation) ?? range;
      const isDef = name !== range && node.name;
      if (!decls[key]) {
        decls[key] = {
          kind,
          // Constructors, fallback and receive have an empty name: use their kind.
          name: String(node.name || node.kind || key),
          ...(contract ? { contract: String(contract.name) } : {}),
          file: range.file,
          line: name.line,
          col: isDef ? name.col : range.col,
          line_start: range.line,
          line_end: range.endLine,
          ...(sig ? { signature: sig } : {}),
          ...(docSentence(node.documentation) ? { doc: docSentence(node.documentation) } : {}),
          in_scope: opts.inScope(range.file),
        };
      }
      if (isDef) (refs[name.file] ??= []).push([name.line, name.col, name.len, key, 1]);
    };

    const declareFunction = (node: N, contract: N | null) => {
      const cname = contract ? String(contract.name) : '(free)';
      const isModifier = node.nodeType === 'ModifierDefinition';
      const sig = isModifier ? `${node.name}(${paramList(node).join(',')})` : signatureOf(node);
      const key = `${cname}.${sig}`;
      addDecl(node, key, isModifier ? 'modifier' : 'function', contract, sig);
      if (contract && !isModifier) {
        const range = pos(node.src);
        candidates.set(key, {
          id: key,
          contract: cname,
          signature: sig,
          contractKind: contractKind(contract),
          in_scope: range ? opts.inScope(range.file) : false,
          overrides: [],
        });
        if (contract.contractKind === 'interface' || node.virtual) implTargets.add(key);
      }
    };

    for (const src of Object.values(sources)) {
      for (const top of src.ast?.nodes ?? []) {
        if (top.nodeType === 'ContractDefinition') {
          const ck = contractKind(top);
          addDecl(
            top,
            String(top.name),
            ck === 'interface' ? 'interface' : ck === 'library' ? 'library' : 'contract',
            null,
          );
          for (const m of top.nodes ?? []) {
            if (m.nodeType === 'FunctionDefinition' || m.nodeType === 'ModifierDefinition') {
              declareFunction(m, top);
            } else if (m.nodeType === 'VariableDeclaration' && m.stateVariable) {
              const key = `${top.name}.${m.name}`;
              addDecl(
                m,
                key,
                m.constant ? 'constant' : 'state_var',
                top,
                `${normType(m.typeDescriptions?.typeString)} ${m.name}`,
              );
              // A public variable's getter implements interface functions too
              // (`mapping balanceOf` → `balanceOf(address)`).
              if (m.visibility === 'public') {
                const range = pos(m.src);
                candidates.set(key, {
                  id: key,
                  contract: String(top.name),
                  signature: `${m.name}(${getterParams(m.typeName).join(',')})`,
                  contractKind: contractKind(top),
                  in_scope: range ? opts.inScope(range.file) : false,
                  overrides: [],
                });
              }
            } else if (MEMBER_KINDS[m.nodeType]) {
              const sig =
                m.nodeType === 'EventDefinition' || m.nodeType === 'ErrorDefinition'
                  ? `${m.name}(${paramList(m).join(',')})`
                  : undefined;
              addDecl(m, `${top.name}.${m.name}`, MEMBER_KINDS[m.nodeType], top, sig);
            }
          }
        } else if (top.nodeType === 'FunctionDefinition') {
          declareFunction(top, null);
        } else if (top.nodeType === 'VariableDeclaration') {
          addDecl(top, String(top.name), 'constant', null);
        } else if (MEMBER_KINDS[top.nodeType]) {
          const sig =
            top.nodeType === 'ErrorDefinition'
              ? `${top.name}(${paramList(top).join(',')})`
              : undefined;
          addDecl(top, String(top.name), MEMBER_KINDS[top.nodeType], null, sig);
        }
      }
    }

    // Override links, now that every function in this build-info has a key.
    for (const src of Object.values(sources)) {
      walk(src.ast, (n) => {
        const isGetter = n.nodeType === 'VariableDeclaration' && n.stateVariable;
        if ((n.nodeType !== 'FunctionDefinition' && !isGetter) || !n.baseFunctions?.length) return;
        const c = candidates.get(keyOf.get(n.id) ?? '');
        if (!c) return;
        for (const b of n.baseFunctions as number[]) {
          const bk = keyOf.get(b);
          if (bk && !c.overrides.includes(bk)) c.overrides.push(bk);
        }
      });
    }

    // ── References.
    const pushRef = (p: ReturnType<typeof pos>, key: string) => {
      if (p && p.len > 0) (refs[p.file] ??= []).push([p.line, p.col, p.len, key, 0]);
    };
    for (const src of Object.values(sources)) {
      walk(src.ast, (n) => {
        const ref = n.referencedDeclaration;
        if (typeof ref !== 'number' || ref < 0) return;
        const key = keyOf.get(ref);
        if (!key) return;
        switch (n.nodeType) {
          case 'Identifier':
            pushRef(pos(n.src), key);
            return;
          case 'IdentifierPath': {
            // `A.B.C`: the declaration is the last segment.
            const locs: unknown[] = n.nameLocations ?? [];
            const p = locs.length ? pos(locs[locs.length - 1]) : pos(n.src);
            if (p && !locs.length) {
              const last = String(n.name).split('.').pop()!;
              pushRef({ ...p, col: p.col + p.len - last.length, len: last.length }, key);
            } else pushRef(p, key);
            return;
          }
          case 'UserDefinedTypeName':
            if (!n.pathNode) pushRef(pos(n.src), key);
            return;
          case 'MemberAccess': {
            const member = String(n.memberName ?? '');
            if (n.memberLocation) {
              pushRef(pos(n.memberLocation), key);
              return;
            }
            // Older solc: the member name ends the expression's source range.
            const p = pos(n.src);
            if (p && p.endLine === p.line && member)
              pushRef({ ...p, col: p.col + p.len - member.length, len: member.length }, key);
            return;
          }
        }
      });
    }
  }

  const all = [...candidates.values()];
  const impls: Record<string, Implementation[]> = {};
  for (const t of implTargets) {
    const found = findImplementations(all, t);
    if (found.length) impls[t] = found;
  }

  for (const [file, list] of Object.entries(refs)) {
    const seen = new Set<string>();
    refs[file] = list
      .sort((a, b) => a[0] - b[0] || a[1] - b[1] || b[4] - a[4])
      .filter((r) => {
        const k = `${r[0]}:${r[1]}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
  }

  return {
    version: 1,
    generated_at: new Date().toISOString(),
    ...(opts.commit ? { commit: opts.commit } : {}),
    decls,
    refs,
    impls,
  };
}
