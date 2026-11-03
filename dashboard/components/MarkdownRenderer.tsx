'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/** Long-form markdown (overviews, descriptions) in the dashboard's reading style. */
export function MarkdownRenderer({ content, className }: { content: string; className?: string }) {
  return (
    <div
      className={`prose max-w-none text-body
        prose-headings:font-semibold prose-headings:text-text-primary
        prose-h1:text-title prose-h2:text-heading prose-h3:text-body
        prose-p:text-text-secondary prose-p:leading-relaxed
        prose-strong:text-text-primary
        prose-code:rounded prose-code:bg-surface-2 prose-code:px-1 prose-code:py-px prose-code:font-normal prose-code:text-[0.88em] prose-code:text-text-primary
        prose-code:before:content-none prose-code:after:content-none
        prose-pre:rounded-md prose-pre:border prose-pre:border-border-subtle prose-pre:bg-surface-1 prose-pre:text-text-primary
        prose-a:text-accent prose-a:no-underline hover:prose-a:underline
        prose-th:text-text-primary prose-td:text-text-secondary
        prose-hr:border-border-subtle
        prose-blockquote:border-border-default prose-blockquote:text-text-secondary
        prose-li:text-text-secondary prose-li:marker:text-text-tertiary
        ${className ?? ''}`}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}

/**
 * Keep inline text inline: a line that starts like a list ("1. ", "- "), a heading
 * ("# ") or a quote ("> ") would render a block element inside the caller's <p> or
 * <span>, which is invalid HTML; the browser re-nests it and hydration fails.
 * Diane writes flows as "1. … 2. …", so this is the common case, not an edge.
 */
export function escapeBlockMarkers(text: string): string {
  return text
    .split('\n')
    .map((l) =>
      l.replace(/^(\s*)(\d+)([.)])(\s)/, '$1$2\\$3$4').replace(/^(\s*)([-*+#>])(\s)/, '$1\\$2$3'),
    )
    .join('\n');
}

/**
 * Inline markdown for short strings (lead text, bullets, model claims).
 * Renders without a block <p> wrapper so it sits inline.
 */
export function InlineMarkdown({ children }: { children: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => <>{children}</>,
        code: ({ children }) => (
          <code className="rounded bg-surface-2 px-1 py-px font-mono text-[0.86em] text-text-primary">
            {children}
          </code>
        ),
        strong: ({ children }) => (
          <strong className="font-semibold text-text-primary">{children}</strong>
        ),
        a: ({ href, children }) => (
          <a href={href} target="_blank" rel="noreferrer" className="text-accent hover:underline">
            {children}
          </a>
        ),
      }}
    >
      {escapeBlockMarkers(children)}
    </ReactMarkdown>
  );
}
