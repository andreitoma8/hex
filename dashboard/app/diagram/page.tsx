'use client';

import { useEffect, useState } from 'react';
import { MermaidViewer, LoadingSpinner } from '@/components/MermaidViewer';

export default function DiagramPage() {
  const [syntax, setSyntax] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/mermaid?file=diagram.mmd')
      .then((res) => {
        if (res.status === 404) {
          setNotFound(true);
          setLoading(false);
          return null;
        }
        if (!res.ok) throw new Error('Failed to load diagram');
        return res.json();
      })
      .then((data) => {
        if (data?.syntax) {
          setSyntax(data.syntax);
        }
        setLoading(false);
      })
      .catch(() => {
        setNotFound(true);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div>
        <h2 className="mb-sp-5 text-title font-semibold text-text-primary">Diagram</h2>
        <div className="flex h-[600px] items-center justify-center rounded-md border border-border-default bg-surface-1">
          <LoadingSpinner label="Loading diagram..." />
        </div>
      </div>
    );
  }

  if (notFound || !syntax) {
    return (
      <div>
        <h2 className="mb-sp-5 text-title font-semibold text-text-primary">Diagram</h2>
        <div className="flex flex-col items-center justify-center rounded-md border border-dashed border-border-emphasis bg-surface-1 py-sp-8">
          <p className="mb-2 text-heading font-medium text-text-primary">Not Yet Generated</p>
          <p className="text-body text-text-tertiary">
            Use the diagram skill to generate diagram.mmd
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h2 className="mb-sp-5 text-title font-semibold text-text-primary">Diagram</h2>
      <MermaidViewer syntax={syntax} />
    </div>
  );
}
