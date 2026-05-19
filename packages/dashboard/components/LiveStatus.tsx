'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

interface GithubSync {
  repo: string;
  last_synced_at: string;
}

function relative(then: Date, now: Date): string {
  const seconds = Math.round((now.getTime() - then.getTime()) / 1000);
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`;
  return `${Math.round(seconds / 3600)}h ago`;
}

/**
 * Shows when the dashboard last refreshed from the file watcher, plus a second
 * dot for the GitHub sync timestamp when /sync-github has been run.
 *
 * Lives alongside (but is intentionally a sibling of) the headless AutoRefresh
 * component so the user can see the SSE is connected and recent.
 */
export function LiveStatus() {
  const router = useRouter();
  const [lastUpdated, setLastUpdated] = useState<Date>(() => new Date());
  const [connected, setConnected] = useState(false);
  const [now, setNow] = useState<Date>(() => new Date());
  const [github, setGithub] = useState<GithubSync | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch the github sync status on mount and after every file-watcher refresh.
  const refetchGithub = () => {
    fetch('/api/github-status', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && typeof data.last_synced_at === 'string') {
          setGithub({ repo: data.repo ?? '', last_synced_at: data.last_synced_at });
        } else {
          setGithub(null);
        }
      })
      .catch(() => setGithub(null));
  };

  useEffect(() => {
    refetchGithub();
    const source = new EventSource('/api/watch');
    source.onopen = () => setConnected(true);
    source.onmessage = () => {
      setLastUpdated(new Date());
      refetchGithub();
    };
    source.onerror = () => setConnected(false);
    return () => source.close();
  }, [router]);

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const watcherLabel = connected
    ? `Updated ${relative(lastUpdated, now)}`
    : 'Reconnecting…';

  return (
    <div className="px-3 py-1 text-caption text-text-tertiary" aria-live="polite">
      <div
        className="flex items-center gap-2"
        title={`Last refresh ${lastUpdated.toLocaleTimeString()}${connected ? '' : ' — watcher disconnected'}`}
      >
        <span
          className={`inline-block h-1.5 w-1.5 rounded-full ${connected ? 'bg-[var(--success)]' : 'bg-[var(--medium)]'}`}
          aria-hidden="true"
        />
        <span>{watcherLabel}</span>
      </div>
      {github && (
        <div
          className="mt-1 flex items-center gap-2"
          title={`GitHub sync with ${github.repo} at ${new Date(github.last_synced_at).toLocaleTimeString()}`}
        >
          <span
            className="inline-block h-1.5 w-1.5 rounded-full bg-accent"
            aria-hidden="true"
          />
          <span>GitHub {relative(new Date(github.last_synced_at), now)}</span>
        </div>
      )}
    </div>
  );
}
