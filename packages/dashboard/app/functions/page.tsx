import { readJsonFile } from '@/lib/data';
import { NotYetGenerated } from '@/components/NotYetGenerated';
import { FunctionsClient } from './FunctionsClient';

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
  modifiers: string[];
  state_vars_read: string[];
  state_vars_written: string[];
  external_calls: string[];
  evidence: Evidence;
}

function buildFunctionRows(
  access: AccessControl,
  calls: ExternalCalls | null,
  stateVars: StateVars | null,
): FunctionRow[] {
  const rows: FunctionRow[] = [];

  for (const fn of access.functions) {
    // Find state variables this function reads/writes
    const varsRead: string[] = [];
    const varsWritten: string[] = [];
    if (stateVars) {
      for (const sv of stateVars.variables) {
        if (sv.contract !== fn.contract) continue;
        if (sv.readers.some((r) => r.function === fn.function)) {
          varsRead.push(sv.name);
        }
        if (sv.writers.some((w) => w.function === fn.function)) {
          varsWritten.push(sv.name);
        }
      }
    }

    // Find external calls made by this function
    const extCalls: string[] = [];
    if (calls) {
      for (const c of calls.calls) {
        if (c.contract === fn.contract && c.function === fn.function) {
          extCalls.push(`${c.target}.${c.method}`);
        }
      }
    }

    rows.push({
      contract: fn.contract,
      name: fn.function,
      visibility: fn.visibility,
      state_mutability: fn.state_mutability ?? 'nonpayable',
      modifiers: fn.modifiers,
      state_vars_read: varsRead,
      state_vars_written: varsWritten,
      external_calls: extCalls,
      evidence: fn.evidence,
    });
  }

  return rows;
}

// ─── Component ──────────────────────────────────────────────────────

export default function FunctionsPage() {
  const access = readJsonFile<AccessControl>('access-control.json');

  if (!access) {
    return (
      <div>
        <h2 className="mb-6 text-2xl font-bold text-gray-100">Functions</h2>
        <NotYetGenerated command="solaudit access" />
      </div>
    );
  }

  const calls = readJsonFile<ExternalCalls>('external-calls.json');
  const stateVars = readJsonFile<StateVars>('state-vars.json');
  const rows = buildFunctionRows(access, calls, stateVars);

  return (
    <div>
      <h2 className="mb-6 text-2xl font-bold text-gray-100">Functions</h2>
      <p className="mb-6 text-sm text-gray-400">
        {rows.length} function{rows.length !== 1 ? 's' : ''} across{' '}
        {new Set(rows.map((r) => r.contract)).size} contracts
      </p>
      <FunctionsClient rows={rows} />
    </div>
  );
}
