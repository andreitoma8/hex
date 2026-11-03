import { cn } from '@/lib/cn';

export type ReviewState = 'unread' | 'read' | 'questioned' | 'cleared';

export const STATE_LABEL: Record<ReviewState, string> = {
  unread: 'Unread',
  read: 'Read',
  questioned: 'Questioned',
  cleared: 'Cleared',
};

/** Review state as a glyph: unread ○, read ◐, questioned ?, cleared ●. */
export function StateGlyph({ state, className }: { state: ReviewState; className?: string }) {
  const common = cn('h-3.5 w-3.5 shrink-0', className);
  const title = STATE_LABEL[state];
  if (state === 'cleared') {
    return (
      <svg viewBox="0 0 14 14" className={common} role="img" aria-label={title}>
        <circle cx="7" cy="7" r="5.5" fill="var(--success)" />
        <path
          d="m4.6 7.2 1.7 1.7 3.2-3.6"
          stroke="var(--surface-0)"
          strokeWidth="1.5"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (state === 'questioned') {
    return (
      <svg viewBox="0 0 14 14" className={common} role="img" aria-label={title}>
        <circle cx="7" cy="7" r="5.25" fill="none" stroke="var(--medium)" strokeWidth="1.5" />
        <path
          d="M5.6 5.6a1.45 1.45 0 1 1 2.1 1.3c-.45.25-.7.55-.7 1.05"
          stroke="var(--medium)"
          strokeWidth="1.3"
          fill="none"
          strokeLinecap="round"
        />
        <circle cx="7" cy="9.9" r=".75" fill="var(--medium)" />
      </svg>
    );
  }
  if (state === 'read') {
    return (
      <svg viewBox="0 0 14 14" className={common} role="img" aria-label={title}>
        <circle
          cx="7"
          cy="7"
          r="5.25"
          fill="none"
          stroke="var(--text-secondary)"
          strokeWidth="1.5"
        />
        <path d="M7 1.75a5.25 5.25 0 0 1 0 10.5Z" fill="var(--text-secondary)" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 14 14" className={common} role="img" aria-label={title}>
      <circle cx="7" cy="7" r="5.25" fill="none" stroke="var(--text-tertiary)" strokeWidth="1.5" />
    </svg>
  );
}
