'use client';

import { useEffect, useState } from 'react';
import { MermaidViewer } from '@/components/MermaidViewer';

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
        <h2 className="mb-6 text-2xl font-bold text-gray-100">Flows</h2>
        <p className="text-gray-400">Loading...</p>
      </div>
    );
  }

  if (flows.length === 0) {
    return (
      <div>
        <h2 className="mb-6 text-2xl font-bold text-gray-100">Flows</h2>
        <div className="flex flex-col items-center justify-center rounded-lg border border-gray-700 bg-gray-800/50 py-16">
          <p className="mb-2 text-lg font-medium text-gray-300">Not Yet Generated</p>
          <p className="text-sm text-gray-500">
            Use the flows skill to generate flow diagrams
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h2 className="mb-6 text-2xl font-bold text-gray-100">Flows</h2>

      {/* Tab bar */}
      {flows.length > 1 && (
        <div className="mb-4 flex gap-1 overflow-x-auto rounded-lg border border-gray-700 bg-gray-800 p-1">
          {flows.map((flow, idx) => (
            <button
              key={flow.filename}
              type="button"
              onClick={() => setActiveTab(idx)}
              className={`whitespace-nowrap rounded px-3 py-1.5 text-sm transition-colors ${
                activeTab === idx
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-400 hover:bg-gray-700 hover:text-gray-200'
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
        <div className="flex h-[600px] items-center justify-center rounded-lg border border-gray-700 bg-gray-800">
          <p className="text-gray-400">Loading diagram...</p>
        </div>
      )}
    </div>
  );
}
