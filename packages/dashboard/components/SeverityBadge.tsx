type Severity = 'Critical' | 'High' | 'Medium' | 'Low' | 'Info';

interface SeverityBadgeProps {
  severity: Severity;
}

const STYLES: Record<Severity, string> = {
  Critical: 'bg-red-600/20 text-red-400 border-red-500/30',
  High: 'bg-orange-600/20 text-orange-400 border-orange-500/30',
  Medium: 'bg-yellow-600/20 text-yellow-400 border-yellow-500/30',
  Low: 'bg-blue-600/20 text-blue-400 border-blue-500/30',
  Info: 'bg-gray-600/20 text-gray-400 border-gray-500/30',
};

export function SeverityBadge({ severity }: SeverityBadgeProps) {
  const style = STYLES[severity] ?? STYLES.Info;

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${style}`}
    >
      {severity}
    </span>
  );
}
