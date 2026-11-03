'use client';

/**
 * Focus bridge to the Claude Code session: whatever the auditor selects here is
 * written to `.hex/focus.json` (debounced) and read by the Hex MCP tool
 * `hex_focus`, so "this function" in the CLI means what is selected here.
 */
export type FocusKind =
  | 'function'
  | 'card'
  | 'diagram_node'
  | 'code_range'
  | 'invariant'
  | 'comment';

export interface FocusInput {
  ref: string;
  kind: FocusKind;
  label: string;
  file?: string;
  line_start?: number;
  line_end?: number;
}

let timer: ReturnType<typeof setTimeout> | null = null;
let last = '';

export function setFocus(input: FocusInput): void {
  const key = JSON.stringify(input);
  if (key === last) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    last = key;
    void fetch('/api/focus', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: key,
    }).catch(() => {
      last = '';
    });
  }, 350);
}
