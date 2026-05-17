'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Shows when the dashboard last refreshed from the file watcher.
 * Lives alongside (but is intentionally a sibling of) the headless AutoRefresh
 * component so the user can see the SSE is connected and recent.
 */
export function LiveStatus() {
  const router = useRouter();
  const [lastUpdated, setLastUpdated] = useState<Date>(() => new Date());
  const [connected, setConnected] = useState(false);
  const [now, setNow] = useState<Date>(() => new Date());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const source = new EventSource('/api/watch');
    source.onopen = () => setConnected(true);
    source.onmessage = () => {
      setLastUpdated(new Date());
      // The headless AutoRefresh already calls router.refresh(); but if the user
      // has disabled it (e.g. by not mounting the layout), this keeps the timestamp
      // accurate without a hard navigation.
    };
    source.onerror = () => setConnected(false);
    return () => source.close();
  }, [router]);

  // Tick the relative-time label every 30 seconds without writing to disk.
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const seconds = Math.round((now.getTime() - lastUpdated.getTime()) / 1000);
  const label =
    seconds < 5
      ? 'just now'
      : seconds < 60
        ? `${seconds}s ago`
        : seconds < 3600
          ? `${Math.round(seconds / 60)}m ago`
          : `${Math.round(seconds / 3600)}h ago`;

  return (
    <div
      className="flex items-center gap-2 px-3 py-1 text-caption text-text-tertiary"
      title={`Last refresh ${lastUpdated.toLocaleTimeString()}${connected ? '' : ' — watcher disconnected'}`}
      aria-live="polite"
    >
      <span
        className={`inline-block h-1.5 w-1.5 rounded-full ${connected ? 'bg-[var(--success)]' : 'bg-[var(--medium)]'}`}
        aria-hidden="true"
      />
      <span>{connected ? `Updated ${label}` : 'Reconnecting…'}</span>
    </div>
  );
}
