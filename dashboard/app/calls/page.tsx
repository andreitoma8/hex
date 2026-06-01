import { readJsonFile } from '@/lib/data';
import { NotYetGenerated } from '@/components/NotYetGenerated';
import { CallsClient } from './CallsClient';

// Read .hex/ at request time, not at build time. Without this, next build
// prerenders this page with whatever .hex/ data was available in the build
// environment and ships static HTML — the dashboard then renders that
// stale (or empty) HTML for every audit project, ignoring the runtime cwd.
export const dynamic = 'force-dynamic';


interface ConfidenceValue {
  value: boolean | string;
  confidence: string;
  derived_from: string;
  reasoning?: string;
  warnings?: string[];
  guard_type?: string;
}

interface Evidence {
  file: string;
  line_start: number;
  line_end: number;
  snippet?: string;
}

interface ExternalCall {
  contract: string;
  function: string;
  evidence: Evidence;
  target: string;
  method: string;
  return_checked: ConfidenceValue;
  inside_reentrancy_guard: ConfidenceValue;
  call_type: string;
  trust_level: ConfidenceValue;
}

interface ExternalCalls {
  calls: ExternalCall[];
}

export default function CallsPage() {
  const data = readJsonFile<ExternalCalls>('external-calls.json');

  if (!data) {
    return (
      <div>
        <h2 className="mb-sp-5 text-title font-semibold text-text-primary">External Calls</h2>
        <NotYetGenerated command="hex calls" />
      </div>
    );
  }

  return <CallsClient calls={data.calls} />;
}
