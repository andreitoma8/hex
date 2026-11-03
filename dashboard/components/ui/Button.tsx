import { forwardRef } from 'react';
import { cn } from '@/lib/cn';

type Variant = 'primary' | 'secondary' | 'ghost';
type Size = 'sm' | 'md';

const VARIANT: Record<Variant, string> = {
  primary: 'bg-accent text-accent-contrast hover:bg-accent-secondary shadow-sm',
  secondary:
    'bg-surface-0 text-text-primary border border-border-default hover:bg-surface-2 shadow-sm',
  ghost: 'text-text-secondary hover:bg-surface-2 hover:text-text-primary',
};

const SIZE: Record<Size, string> = {
  sm: 'h-7 px-2.5 text-caption gap-1.5',
  md: 'h-8 px-3 text-body gap-2',
};

export const Button = forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }
>(function Button(
  { variant = 'secondary', size = 'md', className, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        'inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-md font-medium disabled:pointer-events-none disabled:opacity-40',
        VARIANT[variant],
        SIZE[size],
        className,
      )}
      {...rest}
    />
  );
});
