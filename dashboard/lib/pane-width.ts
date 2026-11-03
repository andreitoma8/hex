/**
 * Resizable panes. A pane's width lives in the CSS variable `--w-<name>` on
 * <html> and in localStorage (`hex.w.<name>`, a per-viewer convenience). This
 * inline script restores every stored width before the first paint, so panes
 * never jump after hydration.
 */
/** Expanded, the app sidebar is as wide as the auditor dragged it. */
export const SIDEBAR_EXPANDED_W = 'var(--w-sidebar, 220px)';
export const SIDEBAR_KEY = 'hex.sidebar';

/**
 * Inline boot script for the root layout: restore pane widths and the sidebar
 * state before first paint. It lives here, not in a 'use client' module: a
 * server component importing a string from a client module gets a client
 * reference, not the string.
 */
export const LAYOUT_BOOT = () => WIDTH_BOOT + SIDEBAR_BOOT;

const SIDEBAR_BOOT = `try{document.documentElement.style.setProperty('--sidebar-w',localStorage.getItem('${'hex.sidebar'}')==='collapsed'?'60px':'${'var(--w-sidebar, 220px)'}')}catch(e){}`;

const WIDTH_BOOT = `try{for(var i=0;i<localStorage.length;i++){var k=localStorage.key(i);if(k&&k.indexOf('hex.w.')===0){var v=parseInt(localStorage.getItem(k)||'',10);if(v>0)document.documentElement.style.setProperty('--w-'+k.slice(6),v+'px')}}}catch(e){}`;

export function setPaneWidth(name: string, px: number | null): void {
  const root = document.documentElement.style;
  if (px === null) root.removeProperty(`--w-${name}`);
  else root.setProperty(`--w-${name}`, `${Math.round(px)}px`);
}

export function storePaneWidth(name: string, px: number | null): void {
  try {
    if (px === null) localStorage.removeItem(`hex.w.${name}`);
    else localStorage.setItem(`hex.w.${name}`, String(Math.round(px)));
  } catch {
    /* storage blocked: the width still applies for this page view */
  }
}
