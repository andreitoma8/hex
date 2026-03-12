import type { SlitherDetectorResult } from '../parsers/slither.js';
import type { ExternalCall } from '../types/index.js';

// Call type classification heuristics
const CALL_TYPE_PATTERNS: Record<string, string[]> = {
  token_transfer: ['transfer', 'transferFrom', 'safeTransfer', 'safeTransferFrom', 'approve', 'send'],
  oracle_read: ['getPrice', 'latestRoundData', 'latestAnswer', 'getRoundData', 'consult', 'observe'],
  flash_loan: ['flashLoan', 'flash', 'flashBorrow'],
  swap: ['swap', 'swapExactTokensForTokens', 'swapTokensForExactTokens', 'exactInputSingle', 'exactInput'],
  liquidity: ['addLiquidity', 'removeLiquidity', 'mint', 'burn'],
  delegate_call: ['delegatecall'],
  low_level: ['call', 'staticcall'],
};

/**
 * Build external calls data from Slither detector results.
 */
export function buildExternalCalls(
  detectors: SlitherDetectorResult[],
  stateVarsImmutability: Map<string, boolean>, // target var name -> isImmutable
  scopeContracts: Set<string>,
  accessControlledSetters: Map<string, string>, // var name -> role
): ExternalCall[] {
  const calls: ExternalCall[] = [];
  const seen = new Set<string>();

  // Process reentrancy detectors for external call info
  for (const det of detectors) {
    if (!det.check.startsWith('reentrancy') &&
        det.check !== 'unchecked-transfer' &&
        det.check !== 'unchecked-lowlevel' &&
        det.check !== 'calls-loop' &&
        det.check !== 'external-function') continue;

    for (const elem of det.elements) {
      if (elem.type !== 'node') continue;

      const key = `${elem.source_mapping.filename_relative}:${elem.source_mapping.lines[0]}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const { contract, func } = parseElementContext(elem);
      const { target, method } = parseCallTarget(elem.name);
      const callType = classifyCallType(method);

      const isUnchecked = det.check === 'unchecked-transfer' || det.check === 'unchecked-lowlevel';
      const isReentrancy = det.check.startsWith('reentrancy');

      const trustLevel = classifyTrustLevel(target, stateVarsImmutability, scopeContracts, accessControlledSetters);

      calls.push({
        contract,
        function: func,
        evidence: {
          file: elem.source_mapping.filename_relative,
          line_start: elem.source_mapping.lines[0] ?? 0,
          line_end: elem.source_mapping.lines[elem.source_mapping.lines.length - 1] ?? 0,
          snippet: elem.name,
        },
        target,
        method,
        return_checked: {
          value: !isUnchecked,
          confidence: 'high',
          derived_from: 'slither',
        },
        inside_reentrancy_guard: {
          value: !isReentrancy,
          confidence: isReentrancy ? 'high' : 'medium',
          derived_from: 'slither',
        },
        call_type: callType,
        trust_level: trustLevel,
      });
    }
  }

  return calls;
}

function parseElementContext(elem: { name: string; type_specific_fields?: Record<string, unknown> }): { contract: string; func: string } {
  const parent = elem.type_specific_fields?.parent as Record<string, unknown> | undefined;
  return {
    contract: String(parent?.contract ?? ''),
    func: String(parent?.function ?? ''),
  };
}

function parseCallTarget(name: string): { target: string; method: string } {
  // Try to extract target and method from call expression
  // e.g., "IERC20(asset).transferFrom(...)" -> target: "IERC20(asset)", method: "transferFrom"
  const match = name.match(/([^.]+)\.(\w+)\s*\(/);
  if (match) {
    return { target: match[1].trim(), method: match[2] };
  }

  // Low-level calls
  const lowLevel = name.match(/\.(\w+)\s*\{/);
  if (lowLevel) {
    return { target: name.split('.')[0]?.trim() ?? '', method: lowLevel[1] };
  }

  return { target: '', method: '' };
}

function classifyCallType(method: string): string {
  for (const [type, patterns] of Object.entries(CALL_TYPE_PATTERNS)) {
    if (patterns.some((p) => method.toLowerCase().includes(p.toLowerCase()))) {
      return type;
    }
  }
  return 'other';
}

function classifyTrustLevel(
  target: string,
  stateVarsImmutability: Map<string, boolean>,
  scopeContracts: Set<string>,
  accessControlledSetters: Map<string, string>,
): ExternalCall['trust_level'] {
  // Extract variable name from target if possible
  const varMatch = target.match(/\((\w+)\)/);
  const varName = varMatch?.[1];

  // Check if target is an in-scope contract
  if (scopeContracts.has(target)) {
    return {
      value: 'trusted',
      confidence: 'high',
      derived_from: 'solc-ast',
      reasoning: 'Target is an in-scope contract',
    };
  }

  // Check immutability
  if (varName && stateVarsImmutability.get(varName)) {
    return {
      value: 'semi-trusted',
      confidence: 'medium',
      derived_from: 'heuristic',
      reasoning: 'Target address is immutable — set at construction',
      warnings: ['Implementation could be upgradeable proxy'],
    };
  }

  // Check if settable by privileged role
  if (varName && accessControlledSetters.has(varName)) {
    return {
      value: 'semi-trusted',
      confidence: 'medium',
      derived_from: 'heuristic',
      reasoning: `Target address settable by ${accessControlledSetters.get(varName)} role`,
      warnings: ['Privileged role could set malicious address'],
    };
  }

  return {
    value: 'external',
    confidence: 'medium',
    derived_from: 'heuristic',
    reasoning: 'External target with no immutability or access control guarantees',
  };
}
