'use client';

import { useState } from 'react';

export type ConfidenceLevel = 'high' | 'medium' | 'low';

interface ConfidenceBadgeProps {
  level: string;
  derivedFrom?: string;
}

const STYLES: Record<ConfidenceLevel, string> = {
  high: 'bg-green-600/20 text-green-400 border-green-500/30',
  medium: 'bg-yellow-600/20 text-yellow-400 border-yellow-500/30',
  low: 'bg-red-600/20 text-red-400 border-red-500/30',
};

export function ConfidenceBadge({ level, derivedFrom }: ConfidenceBadgeProps) {
  const [showTooltip, setShowTooltip] = useState(false);
  const normalized = level.toLowerCase() as ConfidenceLevel;
  const style = STYLES[normalized] ?? STYLES.low;

  return (
    <span
      className="relative inline-block"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <span
        className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${style}`}
      >
        {level}
      </span>
      {derivedFrom && showTooltip && (
        <span className="absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 whitespace-nowrap rounded bg-gray-700 px-2 py-1 text-xs text-gray-200 shadow-lg">
          Derived from: {derivedFrom}
          <span className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-gray-700" />
        </span>
      )}
    </span>
  );
}
