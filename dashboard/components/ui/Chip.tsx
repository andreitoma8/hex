import { cn } from '@/lib/cn';

export type ChipTone = 'neutral' | 'accent' | 'warn' | 'danger' | 'ok';

const TONE: Record<ChipTone, string> = {
  neutral: 'bg-surface-2 text-text-secondary',
  accent: 'bg-accent-subtle text-accent',
  warn: 'bg-[color-mix(in_oklch,var(--high)_14%,transparent)] text-[var(--high)]',
  danger: 'bg-[color-mix(in_oklch,var(--critical)_14%,transparent)] text-[var(--critical)]',
  ok: 'bg-[color-mix(in_oklch,var(--success)_14%,transparent)] text-[var(--success)]',
};

/** A quiet status chip. Use at most one per row. */
export function Chip({
  tone = 'neutral',
  children,
  className,
  title,
}: {
  tone?: ChipTone;
  children: React.ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-px text-caption font-medium',
        TONE[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
