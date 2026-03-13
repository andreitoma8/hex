import type { ParsedContract } from '../parsers/solidity-parser.js';
import type { SlitherFunctionSummary } from '../parsers/slither.js';
import type { AccessFunction, Role, RoleFunctionRef } from '../types/index.js';

// Known OpenZeppelin access control patterns
const OZ_ACCESS_PATTERNS: Record<string, { role: string; description: string }> = {
  Ownable: { role: 'owner', description: 'Contract deployer / admin (OpenZeppelin Ownable)' },
  Ownable2Step: { role: 'owner', description: 'Contract admin with two-step transfer (OpenZeppelin Ownable2Step)' },
  AccessControl: { role: 'admin', description: 'Role-based access control (OpenZeppelin AccessControl)' },
  AccessControlEnumerable: { role: 'admin', description: 'Enumerable role-based access (OpenZeppelin AccessControlEnumerable)' },
};

// Known access-control modifiers
const KNOWN_ACCESS_MODIFIERS = new Set([
  'onlyOwner', 'onlyAdmin', 'onlyRole', 'onlyGovernance', 'onlyGuardian',
  'onlyOperator', 'onlyMinter', 'onlyPauser', 'onlyKeeper',
  'onlyAuthorized', 'onlyManager',
]);

// Non-access-control modifiers (should not be treated as access control)
const NON_ACCESS_MODIFIERS = new Set([
  'nonReentrant', 'whenNotPaused', 'whenPaused', 'initializer',
  'reinitializer', 'onlyInitializing',
]);

/**
 * Extract Tier 1 raw facts: functions with their visibility and modifiers.
 */
export function extractFunctionFacts(
  contracts: ParsedContract[],
  fileMap: Map<string, string>, // contractName -> filePath
): AccessFunction[] {
  const functions: AccessFunction[] = [];

  for (const contract of contracts) {
    const file = fileMap.get(contract.name) ?? '';

    for (const func of contract.functions) {
      if (func.isConstructor || func.isFallback || func.isReceive) continue;

      functions.push({
        contract: contract.name,
        function: func.name,
        visibility: func.visibility === 'default' ? 'internal' : func.visibility,
        state_mutability: (func.stateMutability as 'pure' | 'view' | 'nonpayable' | 'payable') ?? null,
        modifiers: func.modifiers,
        evidence: {
          file,
          line_start: func.lineStart,
          line_end: func.lineEnd,
        },
      });
    }
  }

  return functions;
}

/**
 * Merge inherited functions from Slither function-summary into the function list.
 * Slither's function-summary includes ALL functions per contract (including inherited).
 * We deduplicate: overridden functions keep the child contract's version,
 * non-overridden inherited functions get tagged with inherited_from.
 */
export function mergeInheritedFunctions(
  functions: AccessFunction[],
  slitherSummary: SlitherFunctionSummary[],
  contracts: ParsedContract[],
  fileMap: Map<string, string>,
): AccessFunction[] {
  // Build set of scope contract names
  const scopeContracts = new Set(contracts.map((c) => c.name));

  // Build set of already-known function keys (contract.function)
  const knownKeys = new Set(functions.map((f) => `${f.contract}.${f.function}`));

  // Build inheritance map: child -> parents[]
  const inheritanceMap = new Map<string, string[]>();
  for (const contract of contracts) {
    if (contract.baseContracts.length > 0) {
      inheritanceMap.set(contract.name, contract.baseContracts);
    }
  }

  // Group Slither summaries by contract
  const slitherByContract = new Map<string, SlitherFunctionSummary[]>();
  for (const s of slitherSummary) {
    if (!scopeContracts.has(s.contract)) continue;
    if (!slitherByContract.has(s.contract)) slitherByContract.set(s.contract, []);
    slitherByContract.get(s.contract)!.push(s);
  }

  const inherited: AccessFunction[] = [];

  for (const [contractName, summaries] of slitherByContract) {
    const parents = inheritanceMap.get(contractName) ?? [];
    if (parents.length === 0) continue;

    for (const summary of summaries) {
      // Skip constructors and special functions
      const funcName = summary.function;
      if (funcName === 'constructor' || funcName === 'fallback' || funcName === 'receive' || funcName === '') continue;
      // Skip if we already know about this function from AST parsing
      if (knownKeys.has(`${contractName}.${funcName}`)) continue;

      // Skip slitherConstructor naming patterns
      if (funcName.startsWith('slither')) continue;

      // Map Slither visibility to our enum
      const visibility = mapSlitherVisibility(summary.visibility);
      if (!visibility) continue;

      // Determine which parent this function comes from
      const parentContract = findParentContract(funcName, parents, slitherSummary);

      const key = `${contractName}.${funcName}`;
      if (knownKeys.has(key)) continue;
      knownKeys.add(key);

      inherited.push({
        contract: contractName,
        function: funcName,
        visibility,
        state_mutability: null,
        modifiers: summary.modifiers.filter((m) => m !== '[]' && m !== ''),
        evidence: {
          file: fileMap.get(contractName) ?? '',
          line_start: 0,
          line_end: 0,
        },
        inherited_from: parentContract ?? undefined,
      });
    }
  }

  return [...functions, ...inherited];
}

function mapSlitherVisibility(vis: string): 'external' | 'public' | 'internal' | 'private' | null {
  const normalized = vis.toLowerCase().trim();
  if (normalized === 'external') return 'external';
  if (normalized === 'public') return 'public';
  if (normalized === 'internal') return 'internal';
  if (normalized === 'private') return 'private';
  return null;
}

function findParentContract(
  funcName: string,
  parents: string[],
  allSummaries: SlitherFunctionSummary[],
): string | null {
  for (const parent of parents) {
    const parentSummary = allSummaries.find(
      (s) => s.contract === parent && s.function === funcName,
    );
    if (parentSummary) return parent;
  }
  return parents[0] ?? null;
}

/**
 * Tier 2: Interpret roles from modifiers, inheritance, and heuristics.
 */
export function interpretRoles(
  functions: AccessFunction[],
  contracts: ParsedContract[],
  slitherSummary: SlitherFunctionSummary[] | null,
): Role[] {
  const roles: Role[] = [];
  const modifierToFunctions = new Map<string, RoleFunctionRef[]>();

  // Group functions by their access-control modifiers
  for (const func of functions) {
    for (const mod of func.modifiers) {
      if (NON_ACCESS_MODIFIERS.has(mod)) continue;
      if (!modifierToFunctions.has(mod)) modifierToFunctions.set(mod, []);
      modifierToFunctions.get(mod)!.push({
        contract: func.contract,
        function: func.function,
      });
    }
  }

  // Detect OZ patterns from inheritance
  const ozDetected = new Set<string>();
  for (const contract of contracts) {
    for (const base of contract.baseContracts) {
      const pattern = OZ_ACCESS_PATTERNS[base];
      if (pattern) ozDetected.add(base);
    }
  }

  // Build roles from modifier groupings
  for (const [modifier, funcs] of modifierToFunctions) {
    const isKnown = KNOWN_ACCESS_MODIFIERS.has(modifier);
    const roleName = extractRoleName(modifier);

    // Determine confidence based on source
    let confidence: 'high' | 'medium' | 'low' = 'low';
    let derivedFrom: 'slither' | 'solc-ast' | 'heuristic' = 'heuristic';
    let description = `Role inferred from modifier name '${modifier}'`;
    const warnings: string[] = [];

    // Check if this modifier comes from a known OZ pattern
    if (modifier === 'onlyOwner' && ozDetected.has('Ownable')) {
      confidence = 'high';
      derivedFrom = slitherSummary ? 'slither' : 'solc-ast';
      description = 'Contract deployer / admin (OpenZeppelin Ownable)';
    } else if (modifier === 'onlyOwner' && ozDetected.has('Ownable2Step')) {
      confidence = 'high';
      derivedFrom = slitherSummary ? 'slither' : 'solc-ast';
      description = 'Contract admin with two-step transfer (OpenZeppelin Ownable2Step)';
    } else if (modifier === 'onlyRole') {
      confidence = 'medium';
      derivedFrom = 'solc-ast';
      description = 'Role-based access (OpenZeppelin AccessControl)';
    } else if (isKnown) {
      confidence = 'low';
      warnings.push('Custom modifier — role semantics inferred from name only');
      warnings.push('Verify modifier body to confirm actual access check');
    } else {
      confidence = 'low';
      warnings.push(`Unknown modifier '${modifier}' — may not be an access control check`);
      warnings.push('Verify modifier body to confirm actual access check');
    }

    roles.push({
      role: roleName,
      description,
      confidence,
      derived_from: derivedFrom,
      reasoning: `Functions gated by '${modifier}' modifier`,
      modifier,
      functions: funcs,
      warnings,
    });
  }

  // Add "anyone" role for unprotected external/public functions
  const unprotectedFuncs: RoleFunctionRef[] = [];
  for (const func of functions) {
    const hasAccessModifier = func.modifiers.some(
      (m) => !NON_ACCESS_MODIFIERS.has(m),
    );
    if (!hasAccessModifier) {
      unprotectedFuncs.push({
        contract: func.contract,
        function: func.function,
      });
    }
  }

  if (unprotectedFuncs.length > 0) {
    roles.push({
      role: 'anyone',
      description: 'No access restriction',
      confidence: 'high',
      derived_from: 'solc-ast',
      reasoning: 'External/public functions with no access-control modifiers',
      modifier: null,
      functions: unprotectedFuncs,
      warnings: [],
    });
  }

  return roles;
}

/**
 * Extract a human-readable role name from a modifier name.
 */
function extractRoleName(modifier: string): string {
  // Remove "only" prefix if present
  if (modifier.startsWith('only')) {
    const rest = modifier.slice(4);
    return rest.charAt(0).toLowerCase() + rest.slice(1);
  }
  return modifier;
}
