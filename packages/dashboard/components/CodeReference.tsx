'use client';

import { useState, useRef, useEffect } from 'react';

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
        className="font-mono text-caption text-accent hover:underline"
      >
        {label}
      </button>

      {modalOpen && (
        <ModalOverlay onClose={() => setModalOpen(false)}>
          <div
            className="relative max-h-[80vh] w-full max-w-3xl overflow-auto border border-border-emphasis bg-surface-1 shadow-2xl"
            style={{ borderRadius: 'var(--radius-md)', boxShadow: '0 0 40px rgba(0,204,51,0.08)' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="sticky top-0 flex items-center justify-between border-b border-border-default bg-surface-2 px-sp-4 py-sp-3">
              <span className="font-mono text-body text-text-primary">{label}</span>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded p-1 text-text-tertiary hover:bg-surface-3 hover:text-text-primary"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Content */}
            <div className="p-sp-4">
              {loading && <p className="text-body text-text-secondary">Loading...</p>}
              {error && <p className="text-body text-severity-critical">{error}</p>}
              {code && (
                <pre className="overflow-x-auto rounded-md bg-surface-0 p-sp-4 text-caption leading-relaxed text-text-secondary">
                  {code.split('\n').map((line, i) => {
                    const lineNum = Math.max(1, lineStart - 3) + i;
                    const isHighlighted = lineNum >= lineStart && lineNum <= (lineEnd ?? lineStart);
                    return (
                      <div
                        key={i}
                        className={isHighlighted ? 'bg-accent/10 border-l-2 border-l-accent pl-1' : ''}
                      >
                        <span className="mr-4 inline-block w-10 select-none text-right text-text-tertiary">
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
        </ModalOverlay>
      )}
    </>
  );
}

function ModalOverlay({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    overlayRef.current?.focus();
  }, []);

  return (
    <div
      ref={overlayRef}
      tabIndex={-1}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm outline-none"
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
    >
      {children}
    </div>
  );
}
