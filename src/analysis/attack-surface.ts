import type { AccessControl, ExternalCalls, StateVars } from '../types/index.js';
import type { PatternResult } from './pattern-detection.js';
import type { ConstraintResult } from './constraint-extraction.js';

export interface EntryPoint {
  contract: string;
  function: string;
  visibility: string;
  state_mutability: string;
  modifiers: string[];
  mutates: string[];
  patterns: string[];
  file: string;
  line: number;
}

export interface TokenInteraction {
  contract: string;
  function: string;
  target: string;
  direction: 'in' | 'out' | 'both';
  mechanism: string;
  file: string;
}

export interface ExternalDependency {
  target: string;
  type: string;
  trust: string;
  called_by: string[];
}

export interface AttackSurfaceResult {
  entry_points: {
    permissionless: EntryPoint[];
    role_gated: EntryPoint[];
    owner_only: EntryPoint[];
  };
  token_interactions: TokenInteraction[];
  external_dependencies: ExternalDependency[];
  risk_signals: string[];
  summary: {
    total_entry_points: number;
    permissionless_count: number;
    role_gated_count: number;
    owner_only_count: number;
    external_dependency_count: number;
    risk_signal_count: number;
  };
}

const OWNER_MODIFIERS = new Set([
  'onlyOwner', 'onlyAdmin', 'onlyGovernance', 'onlyDAO',
  'onlyTimelock', 'onlyMultisig',
]);

const ROLE_MODIFIERS = new Set([
  'onlyRole', 'onlyKeeper', 'onlyBot', 'onlyOperator',
  'onlyRelayer', 'onlyMinter', 'onlyBurner', 'onlyPauser',
  'onlyManager', 'onlyGuardian', 'whenNotPaused',
]);

const TOKEN_METHODS = new Set([
  'transfer', 'transferFrom', 'safeTransfer', 'safeTransferFrom',
  'approve', 'mint', 'burn', 'deposit', 'withdraw',
]);

const ORACLE_KEYWORDS = ['oracle', 'price', 'feed', 'chainlink', 'pyth', 'twap'];
const DEX_KEYWORDS = ['swap', 'router', 'uniswap', 'sushiswap', 'curve', 'balancer', 'pool'];
const LENDING_KEYWORDS = ['lend', 'borrow', 'aave', 'compound', 'lending'];

/**
 * Build an attack surface summary by cross-referencing existing analysis outputs.
 */
export function buildAttackSurface(
  access: AccessControl | null,
  calls: ExternalCalls | null,
  stateVars: StateVars | null,
  patterns: PatternResult | null,
  constraints: ConstraintResult | null,
): AttackSurfaceResult {
  const permissionless: EntryPoint[] = [];
  const roleGated: EntryPoint[] = [];
  const ownerOnly: EntryPoint[] = [];
  const tokenInteractions: TokenInteraction[] = [];
  const externalDeps: ExternalDependency[] = [];
  const riskSignals: string[] = [];

  // Build state variable write map for cross-referencing
  const varWriteMap = new Map<string, Set<string>>();
  if (stateVars) {
    for (const sv of stateVars.variables) {
      const writers = new Set<string>(sv.written_by.functions);
      varWriteMap.set(`${sv.contract}.${sv.name}`, writers);
    }
  }

  // Build pattern map per file for enrichment
  const filePatterns = new Map<string, Set<string>>();
  if (patterns) {
    for (const [flag, data] of Object.entries(patterns.flags)) {
      if (!data.detected) continue;
      for (const loc of data.locations) {
        if (!filePatterns.has(loc.file)) filePatterns.set(loc.file, new Set());
        filePatterns.get(loc.file)!.add(flag);
      }
    }
  }

  // Classify entry points from access control data
  if (access) {
    for (const func of access.functions) {
      if (func.visibility !== 'external' && func.visibility !== 'public') continue;
      if (func.state_mutability === 'view' || func.state_mutability === 'pure') continue;

      const modifiers = func.modifiers || [];
      const funcPatterns: string[] = [];

      // Enrich with pattern flags for this file
      const funcFile = func.evidence?.file || '';
      if (filePatterns.has(funcFile)) {
        funcPatterns.push(...filePatterns.get(funcFile)!);
      }

      // Find what state this function mutates
      const mutates: string[] = [];
      if (stateVars) {
        for (const sv of stateVars.variables) {
          if (sv.contract !== func.contract) continue;
          if (sv.written_by.functions.includes(func.function)) {
            mutates.push(sv.name);
          }
        }
      }

      const entry: EntryPoint = {
        contract: func.contract,
        function: func.function,
        visibility: func.visibility,
        state_mutability: func.state_mutability ?? 'nonpayable',
        modifiers,
        mutates,
        patterns: funcPatterns,
        file: funcFile,
        line: func.evidence?.line_start ?? 0,
      };

      const isOwnerOnly = modifiers.some((m) => OWNER_MODIFIERS.has(m));
      const isRoleGated = modifiers.some((m) => ROLE_MODIFIERS.has(m) || m.includes('Role'));

      if (isOwnerOnly) {
        ownerOnly.push(entry);
      } else if (isRoleGated) {
        roleGated.push(entry);
      } else if (modifiers.length === 0 || !isOwnerOnly) {
        permissionless.push(entry);
      }
    }
  }

  // Extract token interactions from external calls
  if (calls) {
    for (const call of calls.calls) {
      const method = call.method || '';
      if (TOKEN_METHODS.has(method) || method.includes('transfer') || method.includes('Transfer')) {
        const direction: 'in' | 'out' | 'both' =
          method.includes('From') || method === 'deposit' ? 'in' :
          method === 'withdraw' ? 'out' : 'out';

        tokenInteractions.push({
          contract: call.contract,
          function: call.function,
          target: call.target || 'unknown',
          direction,
          mechanism: method,
          file: call.evidence?.file || '',
        });
      }

      // Classify external dependencies
      const target = (call.target || '').toLowerCase();
      let depType = 'custom';
      if (ORACLE_KEYWORDS.some((k) => target.includes(k))) depType = 'oracle';
      else if (DEX_KEYWORDS.some((k) => target.includes(k))) depType = 'dex';
      else if (LENDING_KEYWORDS.some((k) => target.includes(k))) depType = 'lending';

      const trustValue = String(call.trust_level.value);
      if (trustValue === 'external' || trustValue === 'semi-trusted') {
        const existing = externalDeps.find((d) => d.target === call.target);
        if (existing) {
          existing.called_by.push(`${call.contract}.${call.function}`);
        } else {
          externalDeps.push({
            target: call.target || 'unknown',
            type: depType,
            trust: trustValue,
            called_by: [`${call.contract}.${call.function}`],
          });
        }
      }
    }
  }

  // Generate risk signals from cross-referencing
  // 1. Permissionless functions with balance-dependent patterns
  if (patterns?.flags.BALANCE_DEPENDENT?.detected) {
    for (const entry of permissionless) {
      const pats = filePatterns.get(entry.file);
      if (pats?.has('BALANCE_DEPENDENT')) {
        riskSignals.push(
          `Permissionless ${entry.contract}.${entry.function}() in file with balanceOf(address(this)) — donation attack surface`,
        );
      }
    }
  }

  // 2. Callback patterns in permissionless functions
  if (patterns?.flags.CALLBACK?.detected) {
    for (const entry of permissionless) {
      const pats = filePatterns.get(entry.file);
      if (pats?.has('CALLBACK')) {
        riskSignals.push(
          `Permissionless ${entry.contract}.${entry.function}() in file with callbacks — reentrancy surface`,
        );
      }
    }
  }

  // 3. Oracle reads without staleness checks (heuristic)
  if (patterns?.flags.ORACLE?.detected && patterns?.flags.TEMPORAL?.detected === false) {
    riskSignals.push('Oracle integration detected but no temporal checks found — potential staleness risk');
  }

  // 4. Unenforced constraints
  if (constraints && constraints.summary.unenforced > 0) {
    riskSignals.push(
      `${constraints.summary.unenforced} setter(s) lack input validation — admin can set arbitrary values`,
    );
  }

  // 5. Missing events on setters
  if (constraints && constraints.summary.missing_events > 0) {
    riskSignals.push(
      `${constraints.summary.missing_events} setter(s) don't emit events — silent state changes`,
    );
  }

  // 6. Delegatecall in permissionless context
  if (patterns?.flags.DELEGATECALL?.detected) {
    for (const entry of permissionless) {
      const pats = filePatterns.get(entry.file);
      if (pats?.has('DELEGATECALL')) {
        riskSignals.push(
          `Permissionless ${entry.contract}.${entry.function}() in file with delegatecall — arbitrary execution risk`,
        );
      }
    }
  }

  // 7. Unchecked arithmetic in share/monetary calculations
  if (patterns?.flags.UNCHECKED?.detected) {
    const hasShareOrMonetary =
      patterns?.flags.SHARE_ALLOCATION?.detected || patterns?.flags.MONETARY_PARAMETER?.detected;
    if (hasShareOrMonetary) {
      riskSignals.push('Unchecked arithmetic in codebase with share/monetary calculations — overflow/underflow risk');
    }
  }

  const totalEntryPoints = permissionless.length + roleGated.length + ownerOnly.length;

  return {
    entry_points: {
      permissionless,
      role_gated: roleGated,
      owner_only: ownerOnly,
    },
    token_interactions: tokenInteractions,
    external_dependencies: externalDeps,
    risk_signals: riskSignals.slice(0, 30),
    summary: {
      total_entry_points: totalEntryPoints,
      permissionless_count: permissionless.length,
      role_gated_count: roleGated.length,
      owner_only_count: ownerOnly.length,
      external_dependency_count: externalDeps.length,
      risk_signal_count: riskSignals.length,
    },
  };
}
