import { cn } from '@/lib/cn';

export type Severity = 'Critical' | 'High' | 'Medium' | 'Low' | 'Info';

const VAR: Record<string, string> = {
  critical: 'var(--critical)',
  high: 'var(--high)',
  medium: 'var(--medium)',
  low: 'var(--low)',
  info: 'var(--info)',
};

export function severityColor(severity: string): string {
  return VAR[severity.toLowerCase()] ?? 'var(--info)';
}

/** Quiet severity: a small colored dot, optionally followed by the word. */
export function SeverityDot({
  severity,
  label = true,
  className,
}: {
  severity: string;
  label?: boolean;
  className?: string;
}) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap', className)}>
      <span
        aria-hidden="true"
        className="inline-block h-2 w-2 shrink-0 rounded-full"
        style={{ background: severityColor(severity) }}
      />
      {label ? <span>{severity}</span> : <span className="sr-only">{severity}</span>}
    </span>
  );
}

/** A dot in an arbitrary token color (claim status, change kind, ...). */
export function Dot({
  color,
  className,
  title,
}: {
  color: string;
  className?: string;
  title?: string;
}) {
  return (
    <span
      aria-hidden={title ? undefined : true}
      title={title}
      className={cn('inline-block h-2 w-2 shrink-0 rounded-full', className)}
      style={{ background: color }}
    />
  );
}
