'use client';

import { useEffect, useState } from 'react';
import { useLive } from '@/lib/live';

interface GithubSync {
  repo: string;
  last_synced_at: string;
}

function relative(then: number, now: number): string {
  const s = Math.round((now - then) / 1000);
  if (s < 10) return 'just now';
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  return `${Math.round(s / 3600)}h ago`;
}

/** One quiet line: is the dashboard live, and when did `.hex/` last change. */
export function LiveStatus() {
  const live = useLive();
  const [now, setNow] = useState(() => Date.now());
  const [github, setGithub] = useState<GithubSync | null>(null);

  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(i);
  }, []);

  useEffect(() => {
    setNow(Date.now());
    fetch('/api/github-status', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setGithub(d && typeof d.last_synced_at === 'string' ? d : null))
      .catch(() => setGithub(null));
  }, [live.lastUpdate]);

  return (
    <div className="space-y-1 px-2.5 text-caption text-text-tertiary" aria-live="polite">
      <div
        className="flex items-center gap-2"
        title={live.lastFile ? `Last change: ${live.lastFile}` : undefined}
      >
        <span
          aria-hidden="true"
          className="h-1.5 w-1.5 shrink-0 rounded-full"
          style={{ background: live.connected ? 'var(--success)' : 'var(--medium)' }}
        />
        <span>
          {live.connected ? `Live · updated ${relative(live.lastUpdate, now)}` : 'Reconnecting…'}
        </span>
      </div>
      {github && (
        <div className="flex items-center gap-2" title={`GitHub sync with ${github.repo}`}>
          <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-text-tertiary" />
          <span>GitHub synced {relative(Date.parse(github.last_synced_at), now)}</span>
        </div>
      )}
    </div>
  );
}
