import type { SlitherDetectorResult } from '../parsers/slither.js';
import type { ASTExternalCall } from '../parsers/solidity-parser.js';
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
 * Build external calls from AST-extracted calls, optionally enriched with Slither data.
 */
export function buildExternalCalls(
  astCalls: ASTExternalCall[],
  stateVarsImmutability: Map<string, boolean>,
  scopeContracts: Set<string>,
  accessControlledSetters: Map<string, string>,
  slitherDetectors?: SlitherDetectorResult[],
): ExternalCall[] {
  // Build Slither enrichment maps if available
  const slitherUnchecked = new Set<string>();
  const slitherReentrancy = new Set<string>();

  if (slitherDetectors) {
    for (const det of slitherDetectors) {
      for (const elem of det.elements) {
        if (elem.type !== 'node') continue;
        const key = `${elem.source_mapping.filename_relative}:${elem.source_mapping.lines[0]}`;
        if (det.check === 'unchecked-transfer' || det.check === 'unchecked-lowlevel') {
          slitherUnchecked.add(key);
        }
        if (det.check.startsWith('reentrancy')) {
          slitherReentrancy.add(key);
        }
      }
    }
  }

  const calls: ExternalCall[] = [];
  const seen = new Set<string>();

  for (const ac of astCalls) {
    const key = `${ac.file}:${ac.lineStart}:${ac.method}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const callType = classifyCallType(ac.method);
    const trustLevel = classifyTrustLevel(ac.target, stateVarsImmutability, scopeContracts, accessControlledSetters);

    // Slither enrichment
    const lineKey = `${ac.file}:${ac.lineStart}`;
    const hasSlither = slitherDetectors != null;
    const isUnchecked = slitherUnchecked.has(lineKey);
    const isReentrancy = slitherReentrancy.has(lineKey);

    calls.push({
      contract: ac.contract,
      function: ac.function,
      evidence: {
        file: ac.file,
        line_start: ac.lineStart,
        line_end: ac.lineEnd,
        snippet: ac.snippet,
      },
      target: ac.target,
      method: ac.method,
      return_checked: {
        value: hasSlither ? !isUnchecked : true,
        confidence: hasSlither ? 'high' : 'low',
        derived_from: hasSlither ? 'slither' : 'heuristic',
        ...(hasSlither ? {} : { reasoning: 'No Slither data — assuming checked' }),
      },
      inside_reentrancy_guard: {
        value: hasSlither ? !isReentrancy : false,
        confidence: hasSlither ? (isReentrancy ? 'high' : 'medium') : 'low',
        derived_from: hasSlither ? 'slither' : 'heuristic',
        ...(hasSlither ? {} : { reasoning: 'No Slither data — reentrancy guard status unknown' }),
      },
      call_type: callType,
      trust_level: trustLevel,
    });
  }

  return calls;
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
  const varName = varMatch?.[1] ?? target;

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
  if (stateVarsImmutability.get(varName)) {
    return {
      value: 'semi-trusted',
      confidence: 'medium',
      derived_from: 'heuristic',
      reasoning: 'Target address is immutable — set at construction',
      warnings: ['Implementation could be upgradeable proxy'],
    };
  }

  // Check if settable by privileged role
  if (accessControlledSetters.has(varName)) {
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
