'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { setLive } from '@/lib/live';

/**
 * Live refresh: the server watches `.hex/` and streams change events over SSE
 * (`/api/watch`); each burst triggers one debounced `router.refresh()`, which
 * re-renders the server components so every page shows what is on disk.
 */
export function AutoRefresh() {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const source = new EventSource('/api/watch');
    source.onopen = () => setLive({ connected: true });
    source.onerror = () => setLive({ connected: false });
    source.onmessage = (ev) => {
      let file: string | null = null;
      try {
        file = (JSON.parse(ev.data) as { file?: string }).file ?? null;
      } catch {
        /* keepalive or malformed */
      }
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        setLive({ lastUpdate: Date.now(), lastFile: file, connected: true });
        router.refresh();
      }, 400);
    };
    return () => {
      source.close();
      if (timer.current) clearTimeout(timer.current);
    };
  }, [router]);

  return null;
}
