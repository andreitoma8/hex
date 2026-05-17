type Severity = 'Critical' | 'High' | 'Medium' | 'Low' | 'Info';

interface SeverityBadgeProps {
  severity: Severity;
}

// /18 opacity (a touch above /15) keeps WCAG AA contrast for severity text in
// both dark and light themes — verified in light mode where the Manrope-400
// caption on /15 was borderline.
const STYLES: Record<Severity, string> = {
  Critical: 'bg-[var(--critical)]/18 text-[var(--critical)]',
  High: 'bg-[var(--high)]/18 text-[var(--high)]',
  Medium: 'bg-[var(--medium)]/18 text-[var(--medium)]',
  Low: 'bg-[var(--low)]/18 text-[var(--low)]',
  Info: 'bg-[var(--info)]/18 text-[var(--info)]',
};

export function SeverityBadge({ severity }: SeverityBadgeProps) {
  const style = STYLES[severity] ?? STYLES.Info;

  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-caption font-medium ${style}`}
    >
      {severity}
    </span>
  );
}
