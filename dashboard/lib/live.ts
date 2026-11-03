'use client';

import { useSyncExternalStore } from 'react';

/**
 * Tiny shared store for the file-watcher connection, written by AutoRefresh
 * (the one EventSource) and read by the sidebar's live indicator.
 */
export interface LiveState {
  connected: boolean;
  lastUpdate: number;
  lastFile: string | null;
}

let state: LiveState = { connected: false, lastUpdate: Date.now(), lastFile: null };
const listeners = new Set<() => void>();

export function setLive(patch: Partial<LiveState>): void {
  state = { ...state, ...patch };
  for (const l of listeners) l();
}

export function useLive(): LiveState {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => state,
    () => state,
  );
}
