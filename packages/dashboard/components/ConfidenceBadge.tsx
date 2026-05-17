'use client';

import { useState } from 'react';

export type ConfidenceLevel = 'high' | 'medium' | 'low';

interface ConfidenceBadgeProps {
  level: string;
  derivedFrom?: string;
}

const STYLES: Record<ConfidenceLevel, string> = {
  high: 'bg-[var(--success)]/15 text-[var(--success)]',
  medium: 'bg-[var(--medium)]/15 text-[var(--medium)]',
  low: 'bg-[var(--critical)]/15 text-[var(--critical)]',
};

export function ConfidenceBadge({ level, derivedFrom }: ConfidenceBadgeProps) {
  const [showTooltip, setShowTooltip] = useState(false);
  const normalized = level.toLowerCase() as ConfidenceLevel;
  const style = STYLES[normalized] ?? STYLES.low;
  const tooltipId = derivedFrom ? `confidence-${level}-${derivedFrom.replace(/\W+/g, '-')}` : undefined;
  const ariaLabel = derivedFrom ? `${level} confidence, derived from ${derivedFrom}` : `${level} confidence`;

  return (
    <span
      className="relative inline-block focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent rounded-md"
      tabIndex={derivedFrom ? 0 : undefined}
      role={derivedFrom ? 'group' : undefined}
      aria-label={ariaLabel}
      aria-describedby={showTooltip && tooltipId ? tooltipId : undefined}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
      onFocus={() => setShowTooltip(true)}
      onBlur={() => setShowTooltip(false)}
    >
      <span
        className={`inline-flex items-center rounded-md px-2 py-0.5 text-caption font-medium ${style}`}
      >
        {level}
      </span>
      {derivedFrom && showTooltip && (
        <span
          id={tooltipId}
          role="tooltip"
          className="absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 whitespace-nowrap rounded-md border border-border-default bg-surface-3 px-2 py-1 text-caption text-text-secondary shadow-lg"
        >
          Derived from: {derivedFrom}
        </span>
      )}
    </span>
  );
}
