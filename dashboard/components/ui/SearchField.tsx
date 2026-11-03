'use client';

import { useRef } from 'react';
import { cn } from '@/lib/cn';
import { useHotkeys } from '@/lib/hotkeys';
import { IconSearch } from './Icons';
import { Kbd } from './Kbd';

/** Search field; `/` focuses it from anywhere on the page, Escape clears and blurs. */
export function SearchField({
  value,
  onChange,
  placeholder = 'Search',
  className,
  hotkey = true,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  hotkey?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useHotkeys(
    {
      '/': (e) => {
        e.preventDefault();
        ref.current?.focus();
        ref.current?.select();
      },
    },
    hotkey,
  );
  return (
    <label className={cn('relative flex h-8 items-center', className)}>
      <IconSearch className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-text-tertiary" />
      <input
        ref={ref}
        type="search"
        value={value}
        placeholder={placeholder}
        aria-label={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            onChange('');
            ref.current?.blur();
          }
        }}
        className="h-8 w-full rounded-md border border-transparent bg-surface-2 pl-8 pr-8 text-body text-text-primary placeholder:text-text-tertiary focus:border-border-emphasis focus:bg-surface-0 focus:outline-none [&::-webkit-search-cancel-button]:hidden"
      />
      {hotkey && !value && <Kbd className="pointer-events-none absolute right-2">/</Kbd>}
    </label>
  );
}
