'use client';

import { forwardRef } from 'react';
import { cn } from '@/lib/cn';

/**
 * One row of a source list or content list: leading glyph, title, optional
 * secondary line, trailing detail. Selection is the only place the accent
 * appears in a list.
 */
export const ListRow = forwardRef<
  HTMLButtonElement,
  {
    selected?: boolean;
    leading?: React.ReactNode;
    title: React.ReactNode;
    subtitle?: React.ReactNode;
    trailing?: React.ReactNode;
    onClick?: () => void;
    className?: string;
    dense?: boolean;
    'data-id'?: string;
    titleClassName?: string;
  }
>(function ListRow(
  {
    selected,
    leading,
    title,
    subtitle,
    trailing,
    onClick,
    className,
    dense,
    titleClassName,
    ...rest
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      aria-current={selected ? 'true' : undefined}
      data-id={rest['data-id']}
      className={cn(
        'group flex w-full items-center gap-2.5 rounded-md px-2.5 text-left',
        dense ? 'min-h-[30px] py-1' : 'min-h-[36px] py-1.5',
        selected ? 'bg-accent-subtle' : 'hover:bg-surface-2',
        className,
      )}
    >
      {leading !== undefined && <span className="flex shrink-0 items-center">{leading}</span>}
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            'block truncate text-body',
            selected ? 'text-accent font-medium' : 'text-text-primary',
            titleClassName,
          )}
        >
          {title}
        </span>
        {subtitle && (
          <span className="block truncate text-caption text-text-tertiary">{subtitle}</span>
        )}
      </span>
      {trailing !== undefined && (
        <span className="flex shrink-0 items-center gap-2 text-caption text-text-tertiary">
          {trailing}
        </span>
      )}
    </button>
  );
});

/** A quiet group label inside a list (sentence case, caption size). */
export function ListGroupLabel({
  children,
  trailing,
}: {
  children: React.ReactNode;
  trailing?: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between px-2.5 pb-1 pt-4 text-caption font-medium text-text-tertiary first:pt-1">
      <span className="truncate">{children}</span>
      {trailing && <span className="shrink-0 tabular-nums">{trailing}</span>}
    </div>
  );
}
