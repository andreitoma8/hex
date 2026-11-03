'use client';

import { usePathname } from 'next/navigation';
import { cn } from '@/lib/cn';
import { ResizeHandle } from './ResizeHandle';

/**
 * The three-pane workspace (source list | content | inspector), Mail/Xcode
 * style. Each pane scrolls on its own; the inspector appears only when
 * something is selected. Hairlines, not boxes, separate the panes, and the
 * list and inspector resize by dragging their edge (remembered per page).
 */
export function SplitView({
  toolbar,
  list,
  listWidth = 272,
  children,
  inspector,
  inspectorFloating = false,
  className,
}: {
  toolbar?: React.ReactNode;
  list?: React.ReactNode;
  listWidth?: number;
  children: React.ReactNode;
  inspector?: React.ReactNode;
  /** Float the inspector over the content (canvases keep their size). */
  inspectorFloating?: boolean;
  className?: string;
}) {
  const page = usePathname().split('/')[1] || 'today';
  const inspectorW = {
    ['--pane-w' as string]: `var(--w-${page}-inspector, 340px)`,
  } as React.CSSProperties;
  return (
    <div className={cn('flex h-full min-h-0 flex-col', className)}>
      {toolbar}
      <div className="relative flex min-h-0 flex-1">
        {list && (
          <aside
            className="relative hidden min-h-0 shrink-0 flex-col border-r border-border-subtle md:flex"
            style={{ width: `var(--w-${page}-list, ${listWidth}px)` }}
          >
            {list}
            <ResizeHandle name={`${page}-list`} edge="right" min={180} max={560} />
          </aside>
        )}
        <section className="relative flex min-h-0 min-w-0 flex-1 flex-col">
          {children}
          {inspector && inspectorFloating && (
            <aside
              className="slide-in absolute bottom-3 right-3 top-[68px] z-30 flex w-[min(var(--pane-w),calc(100%-24px))] min-h-0 flex-col rounded-lg border border-border-default bg-surface-1 shadow-lg"
              style={inspectorW}
            >
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg">
                {inspector}
              </div>
              <ResizeHandle name={`${page}-inspector`} edge="left" min={280} max={720} />
            </aside>
          )}
        </section>
        {inspector && !inspectorFloating && (
          <aside
            className="slide-in absolute inset-y-0 right-0 z-30 flex w-[min(380px,100%)] min-h-0 flex-col border-l border-border-subtle bg-surface-1 shadow-lg lg:relative lg:z-auto lg:w-[var(--pane-w)] lg:shrink-0 lg:shadow-none"
            style={inspectorW}
          >
            {inspector}
            <ResizeHandle
              name={`${page}-inspector`}
              edge="left"
              min={280}
              max={720}
              className="hidden lg:block"
            />
          </aside>
        )}
      </div>
    </div>
  );
}

/** The slim bar above a workspace: title and one line of meta on the left, actions on the right. */
export function Toolbar({
  title,
  meta,
  children,
  className,
}: {
  title: React.ReactNode;
  meta?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        'flex min-h-[56px] shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-border-subtle px-5 py-2.5 pl-16 md:pl-5',
        className,
      )}
    >
      <div className="flex min-w-0 items-baseline gap-3">
        {/* The title never gives way; long meta (a model summary) truncates instead. */}
        <h1 className="shrink-0 whitespace-nowrap text-title font-semibold text-text-primary">
          {title}
        </h1>
        {meta && <div className="min-w-0 truncate text-body text-text-tertiary">{meta}</div>}
      </div>
      {children && <div className="ml-auto flex shrink-0 items-center gap-2">{children}</div>}
    </header>
  );
}

/** A scrolling document column for content panes and document pages. */
export function ScrollArea({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={cn('min-h-0 flex-1 overflow-y-auto', className)}>{children}</div>;
}
