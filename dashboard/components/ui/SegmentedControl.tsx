'use client';

import { cn } from '@/lib/cn';

export interface Segment<T extends string> {
  value: T;
  label: string;
  count?: number;
}

/**
 * Apple-style segmented control: a recessed track with one raised segment.
 * Filters use at most one of these per view.
 */
export function SegmentedControl<T extends string>({
  segments,
  value,
  onChange,
  className,
  ariaLabel,
  size = 'md',
  fill = false,
}: {
  segments: Segment<T>[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
  ariaLabel?: string;
  /** `sm` fits five segments in a 300px source list. */
  size?: 'sm' | 'md';
  /** Stretch segments to fill the width. */
  fill?: boolean;
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        'max-w-full items-center gap-0.5 overflow-x-auto rounded-lg bg-surface-2 p-0.5',
        fill ? 'flex w-full' : 'inline-flex',
        className,
      )}
    >
      {segments.map((s) => {
        const active = s.value === value;
        return (
          <button
            key={s.value}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange(s.value)}
            className={cn(
              'inline-flex h-6 shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-md font-medium',
              size === 'sm' ? 'px-1.5 text-[11.5px]' : 'px-2.5 text-caption',
              fill && 'flex-1',
              active
                ? 'bg-surface-0 text-text-primary shadow-sm'
                : 'text-text-secondary hover:text-text-primary',
            )}
          >
            {s.label}
            {s.count !== undefined && (
              <span className="tabular-nums text-text-tertiary">{s.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
