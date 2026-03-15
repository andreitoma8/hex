'use client';

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';

interface MermaidViewerProps {
  syntax: string;
}

function parseMermaidComments(raw: string) {
  const lines = raw.split('\n');
  const overview: string[] = [];
  const legend: string[] = [];
  const mermaid: string[] = [];
  let inLegend = false;

  for (const line of lines) {
    if (inLegend) {
      if (line.startsWith('%%')) {
        legend.push(line.replace(/^%%\s*/, ''));
      }
      continue;
    }
    if (line.trim().startsWith('%% --- Legend')) {
      inLegend = true;
      continue;
    }
    if (line.startsWith('%%') && mermaid.length === 0) {
      overview.push(line.replace(/^%%\s*/, ''));
    } else {
      mermaid.push(line);
    }
  }

  return {
    overview: overview.join(' ').trim(),
    legend: legend.filter((l) => l.trim()).map((l) => l.trim()),
    syntax: mermaid.join('\n'),
  };
}

export function MermaidViewer({ syntax }: MermaidViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [scale, setScale] = useState(1);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const translateStart = useRef({ x: 0, y: 0 });

  const parsed = useMemo(() => parseMermaidComments(syntax), [syntax]);

  useEffect(() => {
    let cancelled = false;

    async function render() {
      try {
        const mermaid = (await import('mermaid')).default;
        mermaid.initialize({
          startOnLoad: false,
          theme: 'dark',
          securityLevel: 'loose',
          fontFamily: 'ui-sans-serif, system-ui, sans-serif',
        });

        const id = `mermaid-${Date.now()}`;
        const { svg } = await mermaid.render(id, parsed.syntax);

        if (!cancelled && svgRef.current) {
          svgRef.current.innerHTML = svg;
          // Make SVG responsive
          const svgEl = svgRef.current.querySelector('svg');
          if (svgEl) {
            svgEl.style.maxWidth = '100%';
            svgEl.style.height = 'auto';
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    }

    render();
    return () => { cancelled = true; };
  }, [parsed.syntax]);

  const zoom = useCallback((delta: number) => {
    setScale((s) => Math.min(Math.max(0.25, s + delta), 4));
  }, []);

  const resetView = useCallback(() => {
    setScale(1);
    setTranslate({ x: 0, y: 0 });
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    zoom(delta);
  }, [zoom]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY };
    translateStart.current = { ...translate };
  }, [translate]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging) return;
    setTranslate({
      x: translateStart.current.x + (e.clientX - dragStart.current.x),
      y: translateStart.current.y + (e.clientY - dragStart.current.y),
    });
  }, [dragging]);

  const handleMouseUp = useCallback(() => {
    setDragging(false);
  }, []);

  if (error) {
    return (
      <div className="flex h-[600px] items-center justify-center rounded-lg border border-red-800/50 bg-red-950/20">
        <div className="max-w-lg text-center">
          <p className="mb-2 text-red-400">Failed to render diagram</p>
          <pre className="text-xs text-red-300/60 whitespace-pre-wrap">{error}</pre>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Overview */}
      {parsed.overview && (
        <p className="mb-2 text-sm text-gray-400">{parsed.overview}</p>
      )}

      <div className="relative rounded-lg border border-gray-700 bg-gray-800">
        {/* Zoom controls */}
        <div className="absolute top-3 right-3 z-10 flex gap-1">
          <button
            type="button"
            onClick={() => zoom(0.2)}
            className="rounded bg-gray-700 px-2.5 py-1 text-sm text-gray-300 hover:bg-gray-600 transition-colors"
            title="Zoom in"
          >
            +
          </button>
          <button
            type="button"
            onClick={() => zoom(-0.2)}
            className="rounded bg-gray-700 px-2.5 py-1 text-sm text-gray-300 hover:bg-gray-600 transition-colors"
            title="Zoom out"
          >
            −
          </button>
          <button
            type="button"
            onClick={resetView}
            className="rounded bg-gray-700 px-2.5 py-1 text-sm text-gray-300 hover:bg-gray-600 transition-colors"
            title="Reset view"
          >
            ⟳
          </button>
          <span className="flex items-center rounded bg-gray-700/50 px-2 text-xs text-gray-400">
            {Math.round(scale * 100)}%
          </span>
        </div>

        {/* Diagram viewport */}
        <div
          ref={containerRef}
          className="h-[700px] overflow-hidden cursor-grab active:cursor-grabbing"
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          <div
            ref={svgRef}
            className="flex h-full w-full items-center justify-center p-8"
            style={{
              transform: `translate(${translate.x}px, ${translate.y}px) scale(${scale})`,
              transformOrigin: 'center center',
              transition: dragging ? 'none' : 'transform 0.1s ease-out',
            }}
          />
        </div>
      </div>

      {/* Legend */}
      {parsed.legend.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs font-mono text-gray-500">
          {parsed.legend.map((line, i) => (
            <span key={i}>{line}</span>
          ))}
        </div>
      )}
    </div>
  );
}
