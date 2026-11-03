'use client';

import { setPaneWidth, storePaneWidth } from '@/lib/pane-width';
import { cn } from '@/lib/cn';

/**
 * A drag handle on one edge of a pane (the pane must be positioned). Dragging
 * sets the pane's width variable live; release remembers it; double-click
 * resets it; arrow keys nudge it by 16px. A hairline shows on hover.
 */
export function ResizeHandle({
  name,
  edge,
  min,
  max,
  className,
}: {
  name: string;
  /** The pane edge the handle sits on: `right` for a left-hand pane. */
  edge: 'left' | 'right';
  min: number;
  max: number;
  className?: string;
}) {
  const clamp = (w: number) => Math.min(max, Math.max(min, w));
  const settle = () => window.dispatchEvent(new Event('resize'));

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const pane = e.currentTarget.parentElement;
    if (!pane || e.button !== 0) return;
    e.preventDefault();
    const handle = e.currentTarget;
    const startX = e.clientX;
    const startW = pane.getBoundingClientRect().width;
    let w = startW;
    handle.setPointerCapture(e.pointerId);
    document.body.classList.add('is-resizing');
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      w = clamp(edge === 'right' ? startW + dx : startW - dx);
      setPaneWidth(name, w);
    };
    const up = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
      handle.removeEventListener('pointercancel', up);
      document.body.classList.remove('is-resizing');
      if (Math.round(w) !== Math.round(startW)) storePaneWidth(name, w);
      settle();
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
    handle.addEventListener('pointercancel', up);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const pane = e.currentTarget.parentElement;
    if (!pane) return;
    e.preventDefault();
    const grow = (e.key === 'ArrowRight') === (edge === 'right');
    const w = clamp(pane.getBoundingClientRect().width + (grow ? 16 : -16));
    setPaneWidth(name, w);
    storePaneWidth(name, w);
    settle();
  };

  const reset = () => {
    setPaneWidth(name, null);
    storePaneWidth(name, null);
    settle();
  };

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize pane"
      tabIndex={0}
      title="Drag to resize · double-click to reset"
      onPointerDown={onPointerDown}
      onDoubleClick={reset}
      onKeyDown={onKeyDown}
      className={cn(
        'group/resize absolute inset-y-0 z-20 w-2 cursor-col-resize touch-none focus-visible:outline-none',
        edge === 'right' ? '-right-1' : '-left-1',
        className,
      )}
    >
      <span className="mx-auto block h-full w-px transition-colors duration-200 group-hover/resize:bg-border-emphasis group-focus-visible/resize:bg-border-emphasis" />
    </div>
  );
}
