'use client';

import { useEffect, useRef, useState } from 'react';
import { CodeViewer } from './CodeViewer';
import { IconClose } from './ui/Icons';
import { setFocus } from '@/lib/focus';
import { cn } from '@/lib/cn';

/**
 * A clickable `file:line` reference. Opens a code peek over the page with the
 * whole file, scrolled to and tinting the range, and tells the CLI about it.
 */
export function CodeReference({
  file,
  lineStart,
  lineEnd,
  className,
  label,
}: {
  file: string;
  lineStart?: number;
  lineEnd?: number;
  className?: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const loc = lineStart
    ? `${file}:${lineStart}${lineEnd && lineEnd !== lineStart ? `-${lineEnd}` : ''}`
    : file;

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
          setFocus({
            ref: loc,
            kind: 'code_range',
            label: loc,
            file,
            ...(lineStart ? { line_start: lineStart, line_end: lineEnd ?? lineStart } : {}),
          });
        }}
        className={cn(
          'max-w-full truncate rounded-sm text-left font-mono text-caption text-accent hover:underline',
          className,
        )}
        title={`Open ${loc}`}
      >
        {label ?? loc}
      </button>
      {open && (
        <CodePeek
          file={file}
          start={lineStart}
          end={lineEnd}
          title={loc}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

export function CodePeek({
  file,
  start,
  end,
  title,
  onClose,
}: {
  file: string;
  start?: number;
  end?: number;
  title: string;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return (
    <div
      ref={ref}
      tabIndex={-1}
      className="fade-in fixed inset-0 z-[8000] flex items-center justify-center p-6 outline-none"
      style={{ background: 'var(--overlay-bg)' }}
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="rise-in flex h-[min(78vh,760px)] w-full max-w-4xl flex-col overflow-hidden rounded-lg border border-border-default bg-surface-0 shadow-lg"
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border-subtle px-4 py-2.5">
          <span className="truncate font-mono text-caption text-text-secondary">{title}</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 text-text-tertiary hover:bg-surface-2 hover:text-text-primary"
          >
            <IconClose className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1">
          <CodeViewer file={file} range={start ? { start, end: end ?? start } : null} />
        </div>
      </div>
    </div>
  );
}
