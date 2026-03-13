'use client';

import { useState } from 'react';

interface CodeReferenceProps {
  file: string;
  lineStart: number;
  lineEnd?: number;
  snippet?: string;
}

export function CodeReference({ file, lineStart, lineEnd, snippet }: CodeReferenceProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [code, setCode] = useState<string | null>(snippet ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const label = `${file}:${lineStart}${lineEnd && lineEnd !== lineStart ? `-${lineEnd}` : ''}`;

  const handleClick = async () => {
    setModalOpen(true);
    if (code) return;

    setLoading(true);
    try {
      const params = new URLSearchParams({
        file,
        start: String(Math.max(1, lineStart - 3)),
        end: String((lineEnd ?? lineStart) + 3),
      });
      const res = await fetch(`/api/code?${params}`);
      if (!res.ok) throw new Error('Failed to load source');
      const data = await res.json();
      setCode(data.code);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        className="font-mono text-xs text-blue-400 hover:text-blue-300 hover:underline transition-colors"
      >
        {label}
      </button>

      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={() => setModalOpen(false)}
        >
          <div
            className="relative max-h-[80vh] w-full max-w-3xl overflow-auto rounded-lg border border-gray-700 bg-gray-900 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 flex items-center justify-between border-b border-gray-700 bg-gray-800 px-4 py-3">
              <span className="font-mono text-sm text-gray-300">{label}</span>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="text-gray-400 hover:text-gray-200"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-4">
              {loading && <p className="text-sm text-gray-400">Loading...</p>}
              {error && <p className="text-sm text-red-400">{error}</p>}
              {code && (
                <pre className="overflow-x-auto rounded bg-gray-950 p-4 text-xs leading-relaxed text-gray-300">
                  {code.split('\n').map((line, i) => {
                    const lineNum = Math.max(1, lineStart - 3) + i;
                    const isHighlighted = lineNum >= lineStart && lineNum <= (lineEnd ?? lineStart);
                    return (
                      <div
                        key={i}
                        className={isHighlighted ? 'bg-yellow-900/30' : ''}
                      >
                        <span className="inline-block w-10 text-right text-gray-600 select-none mr-4">
                          {lineNum}
                        </span>
                        {line}
                      </div>
                    );
                  })}
                </pre>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
