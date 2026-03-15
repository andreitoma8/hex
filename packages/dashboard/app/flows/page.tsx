'use client';

import { useEffect, useState } from 'react';
import { MermaidViewer, LoadingSpinner } from '@/components/MermaidViewer';

interface FlowEntry {
  name: string;
  filename: string;
}

export default function FlowsPage() {
  const [flows, setFlows] = useState<FlowEntry[]>([]);
  const [activeTab, setActiveTab] = useState(0);
  const [syntax, setSyntax] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/flows')
      .then((res) => res.json())
      .then((data) => {
        setFlows(data.flows ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // Load syntax when active tab changes
  useEffect(() => {
    if (flows.length === 0) return;
    const flow = flows[activeTab];
    if (!flow) return;

    setSyntax(null);
    fetch(`/api/mermaid?file=${encodeURIComponent(flow.filename)}`)
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load flow');
        return res.json();
      })
      .then((data) => setSyntax(data.syntax ?? null))
      .catch(() => setSyntax(null));
  }, [flows, activeTab]);

  if (loading) {
    return (
      <div>
        <h2 className="mb-sp-5 text-title font-semibold text-text-primary">Flows</h2>
        <div className="flex h-[600px] items-center justify-center rounded-md border border-border-default bg-surface-1">
          <LoadingSpinner label="Loading flows..." />
        </div>
      </div>
    );
  }

  if (flows.length === 0) {
    return (
      <div>
        <h2 className="mb-sp-5 text-title font-semibold text-text-primary">Flows</h2>
        <div className="flex flex-col items-center justify-center rounded-md border border-dashed border-border-emphasis bg-surface-1 py-sp-8">
          <p className="mb-2 text-heading font-medium text-text-primary">Not Yet Generated</p>
          <p className="text-body text-text-tertiary">
            Use the flows skill to generate flow diagrams
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h2 className="mb-sp-5 text-title font-semibold text-text-primary">Flows</h2>

      {/* Segmented control (Apple-style tab bar) */}
      {flows.length > 1 && (
        <div className="mb-sp-4 inline-flex overflow-x-auto rounded-md bg-surface-3 p-1">
          {flows.map((flow, idx) => (
            <button
              key={flow.filename}
              type="button"
              onClick={() => setActiveTab(idx)}
              className={`whitespace-nowrap rounded-sm px-sp-3 py-1.5 text-body font-medium ${
                activeTab === idx
                  ? 'bg-surface-2 text-text-primary shadow-sm'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              {flow.name}
            </button>
          ))}
        </div>
      )}

      {/* Active flow diagram */}
      {syntax ? (
        <MermaidViewer key={flows[activeTab]?.filename} syntax={syntax} />
      ) : (
        <div className="flex h-[600px] items-center justify-center rounded-md border border-border-default bg-surface-1">
          <LoadingSpinner label="Loading flow diagram..." />
        </div>
      )}
    </div>
  );
}
