/** Quiet risk indicator: three short bars, filled by tier. Ordering aid, not a severity. */
export function RiskMeter({ risk, className }: { risk: number; className?: string }) {
  const tier = risk >= 55 ? 3 : risk >= 30 ? 2 : 1;
  return (
    <span
      className={`inline-flex items-end gap-[2px] ${className ?? ''}`}
      title={`Risk ${risk}`}
      aria-label={`Risk ${risk}`}
    >
      {[1, 2, 3].map((i) => (
        <span
          key={i}
          className="w-[3px] rounded-[1px]"
          style={{
            height: 4 + i * 2,
            background:
              i <= tier
                ? tier === 3
                  ? 'var(--text-secondary)'
                  : 'var(--text-tertiary)'
                : 'var(--surface-3)',
          }}
        />
      ))}
    </span>
  );
}
