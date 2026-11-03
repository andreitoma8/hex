'use client';

import { useEffect, useRef } from 'react';

/** True when the keystroke belongs to a text field, the canvas, or a dialog input. */
export function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || typeof el.closest !== 'function') return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  // Excalidraw owns its own keyboard shortcuts.
  if (el.closest('.excalidraw')) return true;
  return false;
}

type Handler = (e: KeyboardEvent) => void;

/**
 * Single-key shortcuts (j, k, r, /, Escape ...). Ignored while typing, inside
 * the canvas, and whenever a modifier other than Shift is held. The latest
 * handler map is always used, so callers can pass inline closures.
 */
export function useHotkeys(map: Record<string, Handler>, enabled = true): void {
  const ref = useRef(map);
  ref.current = map;
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.defaultPrevented) return;
      if (document.querySelector('[data-hex-palette]')) return;
      const handler = ref.current[e.key];
      if (!handler) return;
      if (e.key !== 'Escape' && isTypingTarget(e.target)) return;
      handler(e);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled]);
}
