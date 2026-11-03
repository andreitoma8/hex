import { cn } from '@/lib/cn';

/** A keyboard key hint, e.g. <Kbd>⌘K</Kbd>. */
export function Kbd({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        'inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-[5px] border border-border-default bg-surface-2 px-1 font-sans text-[11px] leading-none text-text-tertiary',
        className,
      )}
    >
      {children}
    </kbd>
  );
}
