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
        <h2 className="mb-6 text-2xl font-bold text-gray-100">Access Control</h2>
        <NotYetGenerated command="solaudit access" />
      </div>
    );
  }

  const { functions, roles } = data;

  // Access control page only shows externally-callable functions
  const externalFunctions = functions.filter(
    (fn) => fn.visibility === 'external' || fn.visibility === 'public',
  );

  const writeFunctions = externalFunctions.filter(
    (fn) => fn.state_mutability !== 'view' && fn.state_mutability !== 'pure',
  );
  const readOnlyFunctions = externalFunctions.filter(
    (fn) => fn.state_mutability === 'view' || fn.state_mutability === 'pure',
  );

  // Separate "anyone" role from others
  const anyoneRole = roles.find(
    (r) => r.role.toLowerCase() === 'anyone' || r.role.toLowerCase() === 'public',
  );
  const otherRoles = roles.filter(
    (r) => r.role.toLowerCase() !== 'anyone' && r.role.toLowerCase() !== 'public',
  );

  // Set of function keys belonging to "anyone" role for highlighting
  const anyoneFnKeys = anyoneRole?.functions.map((f) => `${f.contract}::${f.function}`) ?? [];

  return (
    <div>
      <h2 className="mb-6 text-2xl font-bold text-gray-100">Access Control</h2>

      <p className="mb-6 text-sm text-gray-400">
        {externalFunctions.length} function{externalFunctions.length !== 1 ? 's' : ''} analyzed
        ({writeFunctions.length} state-changing, {readOnlyFunctions.length} read-only)
        {' '}across {roles.length} role{roles.length !== 1 ? 's' : ''}
      </p>

      <AccessClient
        writeFunctions={writeFunctions}
        readOnlyFunctions={readOnlyFunctions}
        anyoneFnKeys={anyoneFnKeys}
        anyoneRole={anyoneRole ?? null}
        otherRoles={otherRoles}
      />
    </div>
  );
}
