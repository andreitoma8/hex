'use client';

import { useEffect, useState } from 'react';
import { MermaidViewer } from '@/components/MermaidViewer';

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
        <h2 className="mb-6 text-2xl font-bold text-gray-100">Diagram</h2>
        <p className="text-gray-400">Loading...</p>
      </div>
    );
  }

  if (notFound || !syntax) {
    return (
      <div>
        <h2 className="mb-6 text-2xl font-bold text-gray-100">Diagram</h2>
        <div className="flex flex-col items-center justify-center rounded-lg border border-gray-700 bg-gray-800/50 py-16">
          <p className="mb-2 text-lg font-medium text-gray-300">Not Yet Generated</p>
          <p className="text-sm text-gray-500">
            Use the diagram skill to generate diagram.mmd
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h2 className="mb-6 text-2xl font-bold text-gray-100">Diagram</h2>
      <MermaidViewer syntax={syntax} />
    </div>
  );
}
