'use client';

interface SignalBarsProps {
  level: string; // 'high' | 'medium' | 'low'
}

export function SignalBars({ level }: SignalBarsProps) {
  const normalized = level.toLowerCase();
  const activeBars = normalized === 'high' ? 3 : normalized === 'medium' ? 2 : 1;

  return (
    <span className="inline-flex items-end gap-0.5" title={`Confidence: ${level}`}>
      {[1, 2, 3].map((bar) => (
        <span
          key={bar}
          className={`inline-block rounded-sm ${
            bar <= activeBars ? 'bg-text-primary' : 'bg-text-tertiary'
          }`}
          style={{
            width: '4px',
            height: `${bar * 5 + 3}px`,
          }}
        />
      ))}
    </span>
  );
}
