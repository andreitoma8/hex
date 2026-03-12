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
      className={`prose prose-invert max-w-none
        prose-headings:text-gray-100
        prose-p:text-gray-300
        prose-strong:text-gray-200
        prose-code:text-green-400
        prose-code:before:content-none
        prose-code:after:content-none
        prose-pre:bg-gray-800
        prose-pre:border
        prose-pre:border-gray-700
        prose-a:text-blue-400
        prose-a:no-underline
        hover:prose-a:underline
        prose-th:text-gray-300
        prose-td:text-gray-400
        prose-hr:border-gray-700
        prose-blockquote:border-gray-600
        prose-blockquote:text-gray-400
        prose-li:text-gray-300
        ${className ?? ''}`}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
