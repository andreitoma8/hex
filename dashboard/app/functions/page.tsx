import { readJsonFile } from '@/lib/data';
import { NotYetGenerated } from '@/components/NotYetGenerated';
import { FunctionsClient } from './FunctionsClient';

// Read .hex/ at request time, not at build time. Without this, next build
// prerenders this page with whatever .hex/ data was available in the build
// environment and ships static HTML — the dashboard then renders that
// stale (or empty) HTML for every audit project, ignoring the runtime cwd.
export const dynamic = 'force-dynamic';


// ─── Types ──────────────────────────────────────────────────────────

interface Evidence {
  file: string;
  line_start: number;
  line_end: number;
  snippet?: string;
}

interface AccessFunction {
  contract: string;
  function: string;
  visibility: string;
  state_mutability: string | null;
  modifiers: string[];
  evidence: Evidence;
  inherited_from?: string;
  inheritance_depth?: number;
}

interface AccessControl {
  functions: AccessFunction[];
  roles: { role: string; functions: { contract: string; function: string }[] }[];
}

interface ConfidenceValue {
  value: boolean | string;
  confidence: string;
  derived_from: string;
}

interface ExternalCall {
  contract: string;
  function: string;
  target: string;
  method: string;
  call_type: string;
  trust_level: ConfidenceValue;
}

interface ExternalCalls {
  calls: ExternalCall[];
}

interface StateVariable {
  contract: string;
  name: string;
  type: string;
  visibility: string;
  mutability: string;
  readers: { function: string; confidence: string }[];
  writers: { function: string; confidence: string }[];
}

interface StateVars {
  variables: StateVariable[];
}

// ─── Build aggregated function view ─────────────────────────────────

interface FunctionRow {
  contract: string;
  name: string;
  visibility: string;
  state_mutability: string;
  state: 'writable' | 'read-only';
  payable: 'payable' | 'non-payable';
  modifiers: string[];
  state_vars_read: string[];
  state_vars_written: string[];
  external_calls: string[];
  evidence: Evidence;
  inherited_from?: string;
  inheritance_depth?: number;
}

function buildFunctionRows(
  access: AccessControl,
  calls: ExternalCalls | null,
  stateVars: StateVars | null,
): FunctionRow[] {
  const rows: FunctionRow[] = [];

  for (const fn of access.functions) {
    const varsRead: string[] = [];
    const varsWritten: string[] = [];
    if (stateVars) {
      for (const sv of stateVars.variables) {
        if (sv.contract !== fn.contract) continue;
        if (sv.readers?.some((r) => r.function === fn.function)) {
          varsRead.push(sv.name);
        }
        if (sv.writers?.some((w) => w.function === fn.function)) {
          varsWritten.push(sv.name);
        }
      }
    }

    const extCalls: string[] = [];
    if (calls) {
      for (const c of calls.calls) {
        if (c.contract === fn.contract && c.function === fn.function) {
          extCalls.push(`${c.target}.${c.method}`);
        }
      }
    }

    const mutability = fn.state_mutability ?? 'nonpayable';
    const isReadOnly = mutability === 'view' || mutability === 'pure';
    const isPayable = mutability === 'payable';

    rows.push({
      contract: fn.contract,
      name: fn.function,
      visibility: fn.visibility,
      state_mutability: mutability,
      state: isReadOnly ? 'read-only' : 'writable',
      payable: isPayable ? 'payable' : 'non-payable',
      modifiers: fn.modifiers,
      state_vars_read: varsRead,
      state_vars_written: varsWritten,
      external_calls: extCalls,
      evidence: fn.evidence,
      inherited_from: fn.inherited_from,
      inheritance_depth: fn.inheritance_depth,
    });
  }

  // Sort: primary by contract name, secondary by inheritance depth (own=0 first, deepest ancestor last)
  rows.sort((a, b) => {
    const cmp = a.contract.localeCompare(b.contract);
    if (cmp !== 0) return cmp;
    return (a.inheritance_depth ?? 0) - (b.inheritance_depth ?? 0);
  });

  return rows;
}

// ─── Component ──────────────────────────────────────────────────────

export default function FunctionsPage() {
  const access = readJsonFile<AccessControl>('access-control.json');

  if (!access) {
    return (
      <div>
        <h2 className="mb-sp-5 text-title font-semibold text-text-primary">Functions</h2>
        <NotYetGenerated command="hex access" />
      </div>
    );
  }

  const calls = readJsonFile<ExternalCalls>('external-calls.json');
  const stateVars = readJsonFile<StateVars>('state-vars.json');
  const rows = buildFunctionRows(access, calls, stateVars);

  return (
    <div>
      <h2 className="mb-sp-5 text-title font-semibold text-text-primary">Functions</h2>
      <p className="mb-sp-4 text-body text-text-secondary">
        {rows.length} function{rows.length !== 1 ? 's' : ''} across{' '}
        {new Set(rows.map((r) => r.contract)).size} contracts
      </p>
      <FunctionsClient rows={rows} />
    </div>
  );
}
