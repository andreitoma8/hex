'use client';

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';

/* ── Terminal loading indicator (reusable) ── */
export function LoadingSpinner({ label = 'loading...' }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-sp-8 font-mono">
      <style>{`
        @keyframes hex-blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
        .hex-cursor { animation: hex-blink 1s step-end infinite; }
      `}</style>
      <span className="text-body text-accent">
        {'> '}{label}<span className="hex-cursor">_</span>
      </span>
    </div>
  );
}

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
  const [rendering, setRendering] = useState(true);
  const [scale, setScale] = useState(1);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const translateStart = useRef({ x: 0, y: 0 });

  const parsed = useMemo(() => parseMermaidComments(syntax), [syntax]);

  useEffect(() => {
    let cancelled = false;
    setRendering(true);

    async function render() {
      try {
        const mermaid = (await import('mermaid')).default;
        mermaid.initialize({
          startOnLoad: false,
          theme: 'base',
          themeVariables: {
            background: '#080808',
            mainBkg: '#0d1a0d',
            primaryColor: '#0d1a0d',
            primaryBorderColor: 'rgba(0,204,51,0.40)',
            primaryTextColor: '#00cc33',
            lineColor: 'rgba(0,204,51,0.55)',
            secondaryColor: '#181818',
            tertiaryColor: '#222222',
            clusterBkg: '#0a100a',
            clusterBorder: 'rgba(0,204,51,0.20)',
            edgeLabelBackground: '#080808',
            titleColor: '#aaaaaa',
            fontFamily: '"JetBrains Mono", ui-monospace, monospace',
            fontSize: '12px',
            labelTextColor: '#00cc33',
            nodeBorder: 'rgba(0,204,51,0.40)',
            actorBkg: '#0d1a0d',
            actorBorder: 'rgba(0,204,51,0.40)',
            actorTextColor: '#00cc33',
            actorLineColor: 'rgba(0,204,51,0.30)',
            signalColor: 'rgba(0,204,51,0.55)',
            signalTextColor: '#aaaaaa',
          },
          securityLevel: 'loose',
          fontFamily: '"JetBrains Mono", ui-monospace, monospace',
        });

        const id = `mermaid-${Date.now()}`;
        const { svg } = await mermaid.render(id, parsed.syntax);

        if (!cancelled && svgRef.current) {
          svgRef.current.innerHTML = svg;
          const svgEl = svgRef.current.querySelector('svg');
          if (svgEl) {
            svgEl.style.maxWidth = 'none';
            svgEl.style.height = 'auto';

            // Auto-fit: scale down to fit container if diagram overflows
            if (containerRef.current) {
              const padding = 48;
              const containerW = containerRef.current.clientWidth - padding;
              const containerH = containerRef.current.clientHeight - padding;
              const svgW = svgEl.width.baseVal.value || svgEl.getBoundingClientRect().width;
              const svgH = svgEl.height.baseVal.value || svgEl.getBoundingClientRect().height;
              if (svgW > 0 && svgH > 0) {
                const fitScale = Math.min(containerW / svgW, containerH / svgH, 1);
                setScale(fitScale);
                setTranslate({ x: 0, y: 0 });
              }
            }
          }
          setRendering(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
          setRendering(false);
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
      <div className="flex h-[600px] items-center justify-center rounded-md border border-severity-critical/30 bg-severity-critical/5">
        <div className="max-w-lg text-center">
          <p className="mb-2 text-severity-critical">Failed to render diagram</p>
          <pre className="whitespace-pre-wrap text-caption text-severity-critical/60">{error}</pre>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Overview */}
      {parsed.overview && (
        <p className="mb-2 text-body text-text-secondary">{parsed.overview}</p>
      )}

      {/* Full-bleed canvas */}
      <div className="relative rounded-md border border-border-default bg-surface-1">
        {/* Rendering overlay */}
        {rendering && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-surface-1">
            <LoadingSpinner label="rendering diagram" />
          </div>
        )}

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
            className="flex h-full w-full items-center justify-center p-sp-6"
            style={{
              transform: `translate(${translate.x}px, ${translate.y}px) scale(${scale})`,
              transformOrigin: 'center center',
              transition: dragging ? 'none' : 'transform 0.1s ease-out',
            }}
          />
        </div>

        {/* Floating zoom controls — bottom right */}
        <div className="absolute bottom-3 right-3 z-10 flex items-center gap-1 rounded-md bg-surface-2/90 p-1 shadow-lg backdrop-blur-sm border border-border-default">
          <button
            type="button"
            onClick={() => zoom(0.2)}
            className="rounded px-2.5 py-1 text-body text-text-secondary hover:bg-surface-3 hover:text-text-primary"
            title="Zoom in"
          >
            +
          </button>
          <button
            type="button"
            onClick={() => zoom(-0.2)}
            className="rounded px-2.5 py-1 text-body text-text-secondary hover:bg-surface-3 hover:text-text-primary"
            title="Zoom out"
          >
            −
          </button>
          <button
            type="button"
            onClick={resetView}
            className="rounded px-2.5 py-1 text-body text-text-secondary hover:bg-surface-3 hover:text-text-primary"
            title="Reset view"
          >
            ⟳
          </button>
          <span className="px-2 text-caption text-text-tertiary">
            {Math.round(scale * 100)}%
          </span>
        </div>

        {/* Floating legend overlay — bottom left */}
        {parsed.legend.length > 0 && (
          <div className="absolute bottom-3 left-3 z-10 flex flex-wrap gap-x-3 gap-y-1 rounded-md bg-surface-2/80 px-3 py-2 text-caption font-mono text-text-tertiary backdrop-blur-sm border border-border-default">
            {parsed.legend.map((line, i) => (
              <span key={i}>{line}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
