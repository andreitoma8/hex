'use client';

/**
 * Excalidraw canvas for one `.hex/model/diagrams/<name>.excalidraw` scene.
 * Client-only (loaded through next/dynamic with ssr:false). Edits are saved
 * ~800ms after the last change; selecting an element reports its
 * `customData.hexRef` so the page can show it in the inspector.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Excalidraw, exportToBlob, getSceneVersion } from '@excalidraw/excalidraw';
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';
import '@excalidraw/excalidraw/index.css';

declare global {
  interface Window {
    EXCALIDRAW_ASSET_PATH?: string | string[];
  }
}

// Hand-drawn fonts are served from the installed package (offline-friendly).
if (typeof window !== 'undefined' && !window.EXCALIDRAW_ASSET_PATH) {
  window.EXCALIDRAW_ASSET_PATH = '/excalidraw-assets/';
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type El = Record<string, any>;

export interface CanvasSelection {
  /** Facts function id, contract name, or model id. */
  ref: string | null;
  /** Spec node id when the element has no ref. */
  node: string | null;
  label: string;
  changed: boolean;
}

export interface CanvasHandle {
  exportPng: () => Promise<Blob>;
}

interface Loaded {
  elements: El[];
  appState: Record<string, unknown>;
  files: Record<string, unknown>;
}

function labelOf(el: El, all: Map<string, El>): string {
  if (el.type === 'text') return String(el.text ?? '');
  const bound = (el.boundElements ?? []).find((b: El) => b.type === 'text');
  const t = bound ? all.get(bound.id) : null;
  return t ? String(t.text ?? '') : '';
}

function selectionOf(ids: string[], elements: readonly El[]): CanvasSelection | null {
  if (ids.length === 0) return null;
  const all = new Map(elements.map((e) => [e.id as string, e]));
  for (const id of ids) {
    let el = all.get(id);
    if (!el) continue;
    // A label bound inside a shape stands for the shape.
    if (el.type === 'text' && el.containerId && all.get(el.containerId))
      el = all.get(el.containerId)!;
    const cd = (el.customData ?? {}) as { hexRef?: string; hexNode?: string; hexChanged?: boolean };
    if (cd.hexRef || cd.hexNode) {
      return {
        ref: cd.hexRef ?? null,
        node: cd.hexNode ?? null,
        label: labelOf(el, all).replace(/\s+/g, ' ').trim() || cd.hexRef || cd.hexNode || '',
        changed: Boolean(cd.hexChanged),
      };
    }
  }
  return null;
}

export default function DiagramCanvas({
  name,
  mtime,
  theme,
  onSelect,
  onSaved,
  onReady,
}: {
  name: string;
  /** mtime of the scene on disk (server props); a change we did not write reloads the canvas. */
  mtime: number;
  theme: 'light' | 'dark';
  onSelect: (s: CanvasSelection | null) => void;
  onSaved: (state: 'saving' | 'saved' | 'error') => void;
  onReady: (h: CanvasHandle | null) => void;
}) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const api = useRef<ExcalidrawImperativeAPI | null>(null);
  const baseline = useRef<number | null>(null);
  const knownMtime = useRef(0);
  const saving = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selKey = useRef('');
  const pending = useRef<{ elements: readonly El[]; files: Record<string, unknown> } | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(`/api/diagrams/${encodeURIComponent(name)}`, { cache: 'no-store' });
      const data = (await res.json()) as {
        scene?: Loaded & { appState?: Record<string, unknown> };
        mtime?: number;
        error?: string;
      };
      if (!res.ok || !data.scene) throw new Error(data.error ?? 'Could not load the diagram');
      knownMtime.current = data.mtime ?? 0;
      baseline.current = null;
      selKey.current = '';
      setLoaded({
        elements: data.scene.elements ?? [],
        appState: { viewBackgroundColor: '#ffffff', ...(data.scene.appState ?? {}) },
        files: (data.scene.files as Record<string, unknown>) ?? {},
      });
      setNonce((n) => n + 1);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [name]);

  // Load on mount / when switching diagrams.
  useEffect(() => {
    setLoaded(null);
    onSelect(null);
    void load();
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [name]); // eslint-disable-line react-hooks/exhaustive-deps

  // The file changed on disk and it wasn't us (rebuild, "use new layout").
  useEffect(() => {
    if (!mtime || !knownMtime.current || saving.current) return;
    if (mtime !== knownMtime.current) void load();
  }, [mtime, load]);

  const flush = useCallback(async () => {
    const p = pending.current;
    if (!p) return;
    pending.current = null;
    saving.current = true;
    onSaved('saving');
    try {
      const appState = api.current?.getAppState();
      const res = await fetch(`/api/diagrams/${encodeURIComponent(name)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          elements: p.elements.filter((e) => !e.isDeleted),
          appState: {
            viewBackgroundColor: appState?.viewBackgroundColor ?? '#ffffff',
            gridSize: appState?.gridSize ?? null,
          },
          files: p.files,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { mtime?: number };
      if (!res.ok) throw new Error('save failed');
      knownMtime.current = data.mtime ?? knownMtime.current;
      onSaved('saved');
    } catch {
      onSaved('error');
    } finally {
      saving.current = false;
    }
  }, [name, onSaved]);

  useEffect(() => {
    onReady({
      exportPng: async () => {
        const a = api.current;
        if (!a) throw new Error('Canvas not ready');
        return exportToBlob({
          elements: a.getSceneElements(),
          appState: {
            ...a.getAppState(),
            exportBackground: true,
            exportWithDarkMode: false,
            viewBackgroundColor: '#ffffff',
          },
          files: a.getFiles(),
          mimeType: 'image/png',
          exportPadding: 32,
          getDimensions: (w: number, h: number) => ({ width: w * 2, height: h * 2, scale: 2 }),
        });
      },
    });
    return () => onReady(null);
  }, [onReady]);

  if (error)
    return (
      <div className="flex h-full items-center justify-center text-body text-text-tertiary">
        {error}
      </div>
    );
  if (!loaded) return <div className="h-full" />;

  return (
    <Excalidraw
      key={`${name}:${nonce}`}
      excalidrawAPI={(a) => {
        api.current = a;
        (window as unknown as { __hexCanvas?: ExcalidrawImperativeAPI }).__hexCanvas = a;
        // Fit the whole scene once it has laid out.
        setTimeout(() => {
          try {
            a.scrollToContent(undefined, {
              fitToViewport: true,
              viewportZoomFactor: 0.9,
              animate: false,
            });
          } catch {
            /* older API */
          }
        }, 60);
      }}
      initialData={{
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        elements: loaded.elements as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        appState: { ...(loaded.appState as any), theme },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        files: loaded.files as any,
        scrollToContent: true,
      }}
      theme={theme}
      name={name}
      UIOptions={{
        canvasActions: {
          changeViewBackgroundColor: false,
          clearCanvas: false,
          export: false,
          loadScene: false,
          saveToActiveFile: false,
          saveAsImage: false,
          toggleTheme: null,
        },
        tools: { image: false },
      }}
      onChange={(elements, appState, files) => {
        // Selection → inspector.
        const ids = Object.keys(appState.selectedElementIds ?? {}).filter(
          (k) => appState.selectedElementIds[k],
        );
        const sel = selectionOf(ids, elements as readonly El[]);
        const key = sel ? `${sel.ref}|${sel.node}` : '';
        if (key !== selKey.current) {
          selKey.current = key;
          onSelect(sel);
        }
        // Edits → debounced save. The first change after load is the baseline.
        const version = getSceneVersion(elements);
        if (baseline.current === null) {
          baseline.current = version;
          return;
        }
        if (version === baseline.current) return;
        baseline.current = version;
        pending.current = {
          elements: elements as readonly El[],
          files: files as unknown as Record<string, unknown>,
        };
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => void flush(), 800);
      }}
    />
  );
}
