import { cn } from '@/lib/cn';

/**
 * One sentence and the single command that fills the view. Used wherever a
 * page or pane has nothing to show yet.
 */
export function EmptyState({
  sentence,
  command,
  className,
}: {
  sentence: string;
  command?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex h-full min-h-[200px] flex-col items-center justify-center px-6 text-center fade-in',
        className,
      )}
    >
      <p className="max-w-sm text-body text-text-secondary">{sentence}</p>
      {command && (
        <code className="mt-3 rounded-md bg-surface-2 px-2.5 py-1 font-mono text-caption text-text-primary">
          {command}
        </code>
      )}
    </div>
  );
}
