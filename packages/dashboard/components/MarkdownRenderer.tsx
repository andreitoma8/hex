'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

export function MarkdownRenderer({ content, className }: MarkdownRendererProps) {
  return (
    <div
      className={`prose max-w-none
        prose-headings:text-text-primary
        prose-p:text-text-secondary
        prose-strong:text-text-primary
        prose-code:text-accent
        prose-code:before:content-none
        prose-code:after:content-none
        prose-pre:bg-surface-0
        prose-pre:border
        prose-pre:border-border-default
        prose-a:text-accent
        prose-a:no-underline
        hover:prose-a:underline
        prose-th:text-text-primary
        prose-td:text-text-secondary
        prose-hr:border-border-default
        prose-blockquote:border-border-emphasis
        prose-blockquote:text-text-secondary
        prose-li:text-text-secondary
        ${className ?? ''}`}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
