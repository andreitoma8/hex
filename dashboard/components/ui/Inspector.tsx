'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/cn';
import { IconClose } from './Icons';

/**
 * Right-hand inspector: what the selection is, what you can do with it, and
 * the details, in that order. Sections are separated by whitespace and a
 * caption label, never boxes.
 */
export function Inspector({
  eyebrow,
  title,
  subtitle,
  onClose,
  actions,
  children,
}: {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  onClose?: () => void;
  actions?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 px-5 pb-4 pt-4">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            {eyebrow && <div className="mb-1 text-caption text-text-tertiary">{eyebrow}</div>}
            <h2 className="break-words text-heading font-semibold text-text-primary">{title}</h2>
            {subtitle && (
              <div className="mt-1 break-words text-caption text-text-secondary">{subtitle}</div>
            )}
          </div>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close inspector"
              className="-mr-1.5 -mt-0.5 rounded-md p-1.5 text-text-tertiary hover:bg-surface-2 hover:text-text-primary"
            >
              <IconClose className="h-4 w-4" />
            </button>
          )}
        </div>
        {actions && <div className="mt-4 flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-6">{children}</div>
      <FocusHint />
    </div>
  );
}

export function InspectorSection({
  label,
  children,
  className,
  trailing,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  trailing?: React.ReactNode;
}) {
  return (
    <section className={cn('border-t border-border-subtle pt-3 pb-4', className)}>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h3 className="text-caption font-medium text-text-tertiary">{label}</h3>
        {trailing}
      </div>
      {children}
    </section>
  );
}

/** A label/value line inside an inspector section. */
export function InspectorField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-3 py-0.5 text-body">
      <span className="w-24 shrink-0 text-text-tertiary">{label}</span>
      <span className="min-w-0 flex-1 break-words text-text-primary">{children}</span>
    </div>
  );
}

const HINT_KEY = 'hex.focus-hint-dismissed';

/** Shown once: the CLI can read the current selection through `hex_focus`. */
function FocusHint() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    try {
      setShow(localStorage.getItem(HINT_KEY) !== '1');
    } catch {
      setShow(false);
    }
  }, []);
  if (!show) return null;
  return (
    <div className="flex shrink-0 items-center gap-2 border-t border-border-subtle px-5 py-2.5 text-caption text-text-tertiary">
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />
      <span className="flex-1">Claude can see your selection.</span>
      <button
        type="button"
        onClick={() => {
          try {
            localStorage.setItem(HINT_KEY, '1');
          } catch {
            /* storage blocked */
          }
          setShow(false);
        }}
        className="rounded px-1.5 py-0.5 text-text-secondary hover:bg-surface-2 hover:text-text-primary"
      >
        Got it
      </button>
    </div>
  );
}
