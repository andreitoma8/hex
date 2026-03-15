type Severity = 'Critical' | 'High' | 'Medium' | 'Low' | 'Info';

interface SeverityBadgeProps {
  severity: Severity;
}

const STYLES: Record<Severity, string> = {
  Critical: 'bg-[var(--critical)]/15 text-[var(--critical)]',
  High: 'bg-[var(--high)]/15 text-[var(--high)]',
  Medium: 'bg-[var(--medium)]/15 text-[var(--medium)]',
  Low: 'bg-[var(--low)]/15 text-[var(--low)]',
  Info: 'bg-[var(--info)]/15 text-[var(--info)]',
};

export function SeverityBadge({ severity }: SeverityBadgeProps) {
  const style = STYLES[severity] ?? STYLES.Info;

  return (
    <span
      className={`inline-flex items-center rounded-sm px-2 py-0.5 text-caption font-medium ${style}`}
    >
      {severity}
    </span>
  );
}
