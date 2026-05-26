import { readJsonFile } from '@/lib/data';
import { NotYetGenerated } from '@/components/NotYetGenerated';
import { AccessClient } from './AccessClient';

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

interface RoleFunctionRef {
  contract: string;
  function: string;
}

interface Role {
  role: string;
  description: string;
  confidence: string;
  derived_from: string;
  reasoning: string;
  modifier: string | null;
  functions: RoleFunctionRef[];
  warnings: string[];
  kind?: 'access_control' | 'state_check' | 'guard' | 'unknown';
  is_likely_access_control?: boolean;
}

interface AccessControl {
  functions: AccessFunction[];
  roles: Role[];
}

// ─── Component ──────────────────────────────────────────────────────

export default function AccessPage() {
  const data = readJsonFile<AccessControl>('access-control.json');

  if (!data) {
    return (
      <div>
        <h2 className="mb-sp-5 text-title font-semibold text-text-primary">Access Control</h2>
        <NotYetGenerated command="hex access" />
      </div>
    );
  }

  const { functions, roles } = data;

  const externalFunctions = functions.filter(
    (fn) => fn.visibility === 'external' || fn.visibility === 'public',
  );

  const writeFunctions = externalFunctions.filter(
    (fn) => fn.state_mutability !== 'view' && fn.state_mutability !== 'pure',
  );
  const readOnlyFunctions = externalFunctions.filter(
    (fn) => fn.state_mutability === 'view' || fn.state_mutability === 'pure',
  );

  const anyoneRole = roles.find(
    (r) => r.role.toLowerCase() === 'anyone' || r.role.toLowerCase() === 'public',
  );
  const otherRoles = roles.filter(
    (r) => r.role.toLowerCase() !== 'anyone' && r.role.toLowerCase() !== 'public',
  );

  const anyoneFnKeys = anyoneRole?.functions.map((f) => `${f.contract}::${f.function}`) ?? [];

  // Unprotected count: state-changing functions callable by anyone
  const writeFnKeys = new Set(writeFunctions.map((fn) => `${fn.contract}::${fn.function}`));
  const unprotectedCount = anyoneFnKeys.filter((k) => writeFnKeys.has(k)).length;

  return (
    <div>
      <h2 className="mb-sp-5 text-title font-semibold text-text-primary">Access Control</h2>

      {/* Summary strip */}
      <div className="mb-sp-5 flex flex-wrap gap-sp-3">
        <div className="flex items-center gap-2 rounded-md border border-border-default bg-surface-2 px-sp-4 py-sp-2">
          <span className="text-heading font-semibold text-text-primary">{externalFunctions.length}</span>
          <span className="text-caption text-text-secondary">Total</span>
        </div>
        <div className="flex items-center gap-2 rounded-md border border-border-default bg-surface-2 px-sp-4 py-sp-2">
          <span className="text-heading font-semibold text-text-primary">{writeFunctions.length}</span>
          <span className="text-caption text-text-secondary">State-Changing</span>
        </div>
        {unprotectedCount > 0 && (
          <div className="flex items-center gap-2 rounded-md border border-[var(--critical)]/30 bg-[var(--critical)]/5 px-sp-4 py-sp-2">
            <span className="text-heading font-semibold text-[var(--critical)]">{unprotectedCount}</span>
            <span className="text-caption text-[var(--critical)]/80">Unprotected</span>
          </div>
        )}
      </div>

      <AccessClient
        writeFunctions={writeFunctions}
        readOnlyFunctions={readOnlyFunctions}
        anyoneFnKeys={anyoneFnKeys}
        anyoneRole={anyoneRole ?? null}
        otherRoles={otherRoles}
        allRoles={roles}
      />
    </div>
  );
}
