/**
 * A minimal Solidity highlighter: comments, strings, numbers, keywords, types,
 * built-ins and declared names. No dependency, and it returns tokens per line
 * so the viewer can render line numbers and range highlights cheaply.
 */
export type TokenKind =
  | 'plain'
  | 'comment'
  | 'string'
  | 'number'
  | 'keyword'
  | 'type'
  | 'builtin'
  | 'fn';

export interface Token {
  kind: TokenKind;
  text: string;
}

const KEYWORDS = new Set(
  (
    'pragma solidity import from as contract interface library abstract is function modifier event error struct enum ' +
    'returns return if else for while do break continue emit revert using constructor fallback receive ' +
    'public private internal external view pure payable constant immutable override virtual memory storage calldata ' +
    'new delete unchecked assembly try catch indexed anonymous let type true false wei gwei ether seconds minutes hours days weeks'
  ).split(' '),
);

const BUILTINS = new Set(
  'msg block tx abi require assert this super selfdestruct keccak256 sha256 ecrecover addmod mulmod gasleft blockhash'.split(
    ' ',
  ),
);

const TYPE_RE =
  /^(address|bool|string|bytes\d*|u?int\d*|fixed\d*x?\d*|ufixed\d*x?\d*|mapping|byte)$/;

/** Tokenize a whole source file into lines of tokens. */
export function highlightSolidity(source: string): Token[][] {
  const lines: Token[][] = [[]];
  const push = (kind: TokenKind, text: string) => {
    const parts = text.split('\n');
    parts.forEach((part, i) => {
      if (i > 0) lines.push([]);
      if (part) {
        const line = lines[lines.length - 1];
        const last = line[line.length - 1];
        if (last && last.kind === kind) last.text += part;
        else line.push({ kind, text: part });
      }
    });
  };

  let i = 0;
  let expectName = false;
  const n = source.length;
  while (i < n) {
    const ch = source[i];
    const next = source[i + 1];

    if (ch === '/' && next === '/') {
      const end = source.indexOf('\n', i);
      const stop = end === -1 ? n : end;
      push('comment', source.slice(i, stop));
      i = stop;
      continue;
    }
    if (ch === '/' && next === '*') {
      const end = source.indexOf('*/', i + 2);
      const stop = end === -1 ? n : end + 2;
      push('comment', source.slice(i, stop));
      i = stop;
      continue;
    }
    if (ch === '"' || ch === "'") {
      let j = i + 1;
      while (j < n && source[j] !== ch && source[j] !== '\n') {
        if (source[j] === '\\') j++;
        j++;
      }
      push('string', source.slice(i, Math.min(n, j + 1)));
      i = Math.min(n, j + 1);
      continue;
    }
    if (/[0-9]/.test(ch) || (ch === '.' && next && /[0-9]/.test(next))) {
      const m = /^(0x[0-9a-fA-F_]+|[0-9][0-9_]*(\.[0-9_]+)?([eE][-+]?[0-9_]+)?)/.exec(
        source.slice(i, i + 80),
      );
      const text = m ? m[0] : ch;
      push('number', text);
      i += text.length;
      continue;
    }
    if (/[A-Za-z_$]/.test(ch)) {
      const m = /^[A-Za-z_$][A-Za-z0-9_$]*/.exec(source.slice(i, i + 120));
      const word = m ? m[0] : ch;
      let kind: TokenKind = 'plain';
      if (expectName) {
        kind = 'fn';
        expectName = false;
      } else if (KEYWORDS.has(word)) {
        kind = 'keyword';
        if (
          [
            'function',
            'modifier',
            'event',
            'error',
            'contract',
            'interface',
            'library',
            'struct',
            'enum',
          ].includes(word)
        ) {
          expectName = true;
        }
      } else if (TYPE_RE.test(word)) {
        kind = 'type';
      } else if (BUILTINS.has(word)) {
        kind = 'builtin';
      } else if (source[i + word.length] === '(' && /^[a-z_]/.test(word)) {
        kind = 'fn';
      }
      push(kind, word);
      i += word.length;
      continue;
    }
    if (!/\s/.test(ch)) expectName = false;
    push('plain', ch);
    i++;
  }
  return lines;
}

/** A highlighted piece of a line; `ref` when it names a declaration the viewer can navigate to. */
export interface Seg extends Token {
  ref?: string;
  /** The declaration's own name (navigating from it lists its callers and uses). */
  def?: boolean;
}

export interface LineRef {
  /** 0-based UTF-16 column. */
  col: number;
  len: number;
  key: string;
  def: boolean;
}

/**
 * Split a line's tokens at reference boundaries so each reference becomes its
 * own segment. Text and token kinds are unchanged; joining the segments gives
 * the line back.
 */
export function applyRefs(tokens: Token[], refs: LineRef[]): Seg[] {
  if (refs.length === 0) return tokens;
  const sorted = [...refs].sort((a, b) => a.col - b.col);
  const out: Seg[] = [];
  let col = 0;
  let ri = 0;
  for (const t of tokens) {
    const start = col;
    const end = col + t.text.length;
    let cursor = start;
    while (cursor < end) {
      while (ri < sorted.length && sorted[ri].col + sorted[ri].len <= cursor) ri++;
      const r = sorted[ri];
      if (!r || r.col >= end) {
        out.push({ kind: t.kind, text: t.text.slice(cursor - start) });
        break;
      }
      if (r.col > cursor) {
        out.push({ kind: t.kind, text: t.text.slice(cursor - start, r.col - start) });
        cursor = r.col;
        continue;
      }
      const segEnd = Math.min(end, r.col + r.len);
      out.push({
        kind: t.kind,
        text: t.text.slice(cursor - start, segEnd - start),
        ref: r.key,
        ...(r.def ? { def: true } : {}),
      });
      cursor = segEnd;
    }
    col = end;
  }
  return out;
}
