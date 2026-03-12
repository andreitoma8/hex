'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';

// Dynamic import of Excalidraw (no SSR — it requires browser APIs)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ExcalidrawComponent = dynamic<any>(
  () => import('@excalidraw/excalidraw').then((mod) => mod.Excalidraw),
  { ssr: false },
);

interface ExcalidrawViewerProps {
  filename: string;
}

export function ExcalidrawViewer({ filename }: ExcalidrawViewerProps) {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/excalidraw?file=${encodeURIComponent(filename)}`)
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load ${filename}`);
        return res.json();
      })
      .then((json) => {
        setData(json);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [filename]);

  if (loading) {
    return (
      <div className="flex h-[600px] items-center justify-center rounded-lg border border-gray-700 bg-gray-800">
        <p className="text-gray-400">Loading diagram...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-[600px] items-center justify-center rounded-lg border border-red-800/50 bg-red-950/20">
        <p className="text-red-400">{error}</p>
      </div>
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const elements = (data as any)?.elements ?? [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const appState = (data as any)?.appState ?? {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const files = (data as any)?.files ?? undefined;

  return (
    <div className="h-[700px] rounded-lg border border-gray-700 bg-white">
      <ExcalidrawComponent
        initialData={{
          elements,
          appState: { ...appState, viewModeEnabled: true, theme: 'light' },
          files,
        }}
        viewModeEnabled={true}
      />
    </div>
  );
}
