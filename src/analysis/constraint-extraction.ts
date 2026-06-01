import fs from 'node:fs';
import path from 'node:path';
import * as parser from '@solidity-parser/parser';
import { parseSolidity } from '../parsers/solidity-parser.js';
import { normalizePath } from '../core/paths.js';

export interface ConstraintEntry {
  variable: string;
  contract: string;
  setter: string;
  setter_line: number;
  file: string;
  validation: string | null;
  enforcement: 'ENFORCED' | 'UNENFORCED';
  emits_event: boolean;
  event_name: string | null;
}

export interface ConstraintResult {
  constraints: ConstraintEntry[];
  summary: {
    total_setters: number;
    enforced: number;
    unenforced: number;
    missing_events: number;
  };
}

// Patterns that indicate a setter function
const SETTER_PREFIXES = ['set', 'update', 'configure', 'change', 'adjust', 'modify'];

// Library modifiers that always enforce a check even when we can't see their body.
const KNOWN_ACCESS_MODIFIERS = new Set([
  'onlyOwner', 'onlyAdmin', 'onlyRole', 'onlyGovernance', 'onlyGuardian',
  'onlyOperator', 'onlyMinter', 'onlyPauser', 'onlyKeeper',
  'onlyAuthorized', 'onlyManager',
]);

// Modifiers that revert based on state (pausability, initialization, reentrancy).
// They count as enforcement because the function won't run when the state predicate fails.
const STATE_GUARD_MODIFIERS = new Set([
  'whenNotPaused', 'whenPaused', 'initializer', 'reinitializer', 'onlyInitializing',
  'nonReentrant', 'nonreentrant',
]);

// Pattern for event emission (regex fallback)
const EMIT_PATTERN = /emit\s+(\w+)\s*\(/;

interface AstNode {
  type: string;
  loc?: { start: { line: number }; end: { line: number } };
  [key: string]: unknown;
}

/**
 * Generic AST walker. `visit` returns `true` to short-circuit.
 */
function walkAst(node: unknown, visit: (n: AstNode) => boolean | void): boolean {
  if (!node || typeof node !== 'object') return false;
  const n = node as AstNode;
  if (typeof n.type === 'string') {
    if (visit(n) === true) return true;
  }
  for (const key of Object.keys(n)) {
    if (key === 'loc' || key === 'range' || key === 'parent') continue;
    const v = (n as Record<string, unknown>)[key];
    if (Array.isArray(v)) {
      for (const item of v) {
        if (walkAst(item, visit)) return true;
      }
    } else if (v && typeof v === 'object') {
      if (walkAst(v, visit)) return true;
    }
  }
  return false;
}

/**
 * Does an AST subtree directly contain a validation statement
 * (require / revert / assert / `if (cond) revert ...`)?
 */
function hasDirectValidation(body: unknown): string | null {
  if (!body) return null;
  let reason: string | null = null;
  walkAst(body, (n) => {
    if (n.type === 'RevertStatement') {
      reason = 'revert with custom error';
      return true;
    }
    if (n.type === 'FunctionCall') {
      const callee = n.expression as AstNode | undefined;
      if (!callee) return false;
      const name =
        (callee.name as string | undefined) ?? (callee.namePath as string | undefined);
      if (name === 'require') {
        reason = 'require()';
        return true;
      }
      if (name === 'assert') {
        reason = 'assert()';
        return true;
      }
      if (name === 'revert') {
        reason = 'revert(...)';
        return true;
      }
    }
    return false;
  });
  return reason;
}

/**
 * Check whether a setter's modifiers contribute enforcement.
 */
function modifierEnforces(
  modName: string,
  modBodies: Map<string, unknown>,
): string | null {
  if (KNOWN_ACCESS_MODIFIERS.has(modName)) return `library-style access modifier '${modName}'`;
  if (STATE_GUARD_MODIFIERS.has(modName)) return `state guard modifier '${modName}'`;
  const body = modBodies.get(modName);
  if (body) {
    const reason = hasDirectValidation(body);
    if (reason) return `validation inside modifier '${modName}' (${reason})`;
  }
  // Heuristic for unknown but identity-shaped modifiers (e.g., onlyCustomRole)
  if (/^only[A-Z]/.test(modName)) return `naming heuristic — modifier '${modName}' likely gates by caller`;
  return null;
}

/**
 * Walk the function body, follow calls into same-contract helpers (up to 2 deep),
 * and look for validation inside any of them.
 */
function helperCallEnforces(
  body: unknown,
  funcBodies: Map<string, unknown>,
  depth: number,
  seen: Set<string>,
): string | null {
  if (depth > 2 || !body) return null;
  let result: string | null = null;
  walkAst(body, (n) => {
    if (n.type === 'FunctionCall') {
      const callee = n.expression as AstNode | undefined;
      if (!callee) return false;
      const name =
        (callee.name as string | undefined) ?? (callee.namePath as string | undefined);
      if (typeof name !== 'string' || seen.has(name)) return false;
      const target = funcBodies.get(name);
      if (!target) return false;
      seen.add(name);
      const direct = hasDirectValidation(target);
      if (direct) {
        result = `validation inside helper '${name}()' (${direct})`;
        return true;
      }
      const deeper = helperCallEnforces(target, funcBodies, depth + 1, seen);
      if (deeper) {
        result = deeper;
        return true;
      }
    }
    return false;
  });
  return result;
}

interface FunctionContext {
  name: string;
  body: unknown;
  modifiers: string[];
  lineStart: number;
}

interface ContractEnforcement {
  modifierBodies: Map<string, unknown>;
  functionBodies: Map<string, unknown>;
  functions: FunctionContext[];
}

/**
 * Build modifier/function body maps for each contract in a file via a fresh AST walk.
 */
function buildContractEnforcementMaps(source: string): Map<string, ContractEnforcement> {
  const map = new Map<string, ContractEnforcement>();
  let ast;
  try {
    ast = parser.parse(source, { loc: true, range: true, tolerant: true });
  } catch {
    return map;
  }

  for (const node of (ast as unknown as { children: AstNode[] }).children) {
    if (node.type !== 'ContractDefinition') continue;
    const contractNode = node as AstNode & { name: string; subNodes: AstNode[] };

    const modifierBodies = new Map<string, unknown>();
    const functionBodies = new Map<string, unknown>();
    const functions: FunctionContext[] = [];

    for (const sub of contractNode.subNodes ?? []) {
      if (sub.type === 'ModifierDefinition') {
        const m = sub as AstNode & { name: string; body: unknown };
        modifierBodies.set(m.name, m.body);
      } else if (sub.type === 'FunctionDefinition') {
        const f = sub as AstNode & {
          name: string | null;
          body: unknown;
          modifiers?: Array<{ name: string }>;
          isConstructor?: boolean;
          isFallback?: boolean;
        };
        const name = f.name ?? '';
        if (name) {
          functionBodies.set(name, f.body);
          functions.push({
            name,
            body: f.body,
            modifiers: (f.modifiers ?? []).map((m) => m.name),
            lineStart: f.loc?.start.line ?? 0,
          });
        }
      }
    }

    map.set(contractNode.name, { modifierBodies, functionBodies, functions });
  }

  return map;
}

interface EnforcementVerdict {
  enforced: boolean;
  reason: string | null;
}

function determineEnforcement(
  ctx: FunctionContext,
  contract: ContractEnforcement,
): EnforcementVerdict {
  // 1. Inline require / revert / assert / if-revert
  const direct = hasDirectValidation(ctx.body);
  if (direct) return { enforced: true, reason: direct };

  // 2. Modifier-resident validation
  for (const modName of ctx.modifiers) {
    const reason = modifierEnforces(modName, contract.modifierBodies);
    if (reason) return { enforced: true, reason };
  }

  // 3. Helper-call validation (depth 2)
  const helperReason = helperCallEnforces(ctx.body, contract.functionBodies, 0, new Set([ctx.name]));
  if (helperReason) return { enforced: true, reason: helperReason };

  return { enforced: false, reason: null };
}

/**
 * Extract constraint variables and their enforcement status from in-scope files.
 */
export function extractConstraints(projectDir: string, scopeFiles: string[]): ConstraintResult {
  const constraints: ConstraintEntry[] = [];

  for (const scopeFile of scopeFiles) {
    const filePath = path.resolve(projectDir, scopeFile);
    if (!fs.existsSync(filePath)) continue;

    const source = fs.readFileSync(filePath, 'utf-8');
    const normalFile = normalizePath(scopeFile);

    let parsed;
    try {
      parsed = parseSolidity(source, normalFile);
    } catch {
      extractConstraintsGrep(source, normalFile, constraints);
      continue;
    }

    const enforcementMaps = buildContractEnforcementMaps(source);

    for (const contract of parsed.contracts) {
      const enforcement = enforcementMaps.get(contract.name);
      // Collect state variable names for this contract
      const stateVarNames = new Set<string>();
      if (contract.stateVariables) {
        for (const sv of contract.stateVariables) {
          stateVarNames.add(sv.name);
        }
      }

      for (const func of contract.functions) {
        // Check if this is a setter function
        const isSetter = SETTER_PREFIXES.some((prefix) =>
          func.name.toLowerCase().startsWith(prefix.toLowerCase()),
        );
        if (!isSetter) continue;
        if (func.stateMutability === 'view' || func.stateMutability === 'pure') continue;

        // Extract the function body from source for variable detection + emit detection
        const funcBody = extractFunctionBody(source, func.name, func.lineStart);
        if (!funcBody) continue;

        // Find which state variable this setter modifies
        const modifiedVar = findModifiedVariable(func.name, stateVarNames, funcBody);
        if (!modifiedVar) continue;

        // Validation via AST traversal (covers modifiers + helpers + custom errors)
        let verdict: EnforcementVerdict = { enforced: false, reason: null };
        if (enforcement) {
          const ctx = enforcement.functions.find((f) => f.name === func.name);
          if (ctx) {
            verdict = determineEnforcement(ctx, enforcement);
          }
        }

        // Check for event emission (regex; emits are syntactically simple)
        let emitsEvent = false;
        let eventName: string | null = null;
        const emitMatch = funcBody.match(EMIT_PATTERN);
        if (emitMatch) {
          emitsEvent = true;
          eventName = emitMatch[1];
        }

        constraints.push({
          variable: modifiedVar,
          contract: contract.name,
          setter: func.name,
          setter_line: func.lineStart,
          file: normalFile,
          validation: verdict.reason,
          enforcement: verdict.enforced ? 'ENFORCED' : 'UNENFORCED',
          emits_event: emitsEvent,
          event_name: eventName,
        });
      }
    }
  }

  const enforced = constraints.filter((c) => c.enforcement === 'ENFORCED').length;
  const unenforced = constraints.filter((c) => c.enforcement === 'UNENFORCED').length;
  const missingEvents = constraints.filter((c) => !c.emits_event).length;

  return {
    constraints,
    summary: {
      total_setters: constraints.length,
      enforced,
      unenforced,
      missing_events: missingEvents,
    },
  };
}

/**
 * Extract the body of a function from source code (used for variable name
 * detection and event emission scan only; enforcement classification uses the AST).
 */
function extractFunctionBody(source: string, funcName: string, startLine: number): string | null {
  const lines = source.split('\n');
  const start = Math.max(0, startLine - 1);
  let braceCount = 0;
  let inFunction = false;
  let bodyStart = -1;
  let bodyEnd = -1;

  for (let i = start; i < lines.length; i++) {
    const line = lines[i];

    if (!inFunction && line.includes(`function ${funcName}`)) {
      inFunction = true;
    }

    if (inFunction) {
      for (const ch of line) {
        if (ch === '{') {
          if (bodyStart === -1) bodyStart = i;
          braceCount++;
        }
        if (ch === '}') {
          braceCount--;
          if (braceCount === 0) {
            bodyEnd = i;
            break;
          }
        }
      }
      if (bodyEnd !== -1) break;
    }

    if (i - start > 200) break;
  }

  if (bodyStart === -1 || bodyEnd === -1) return null;
  return lines.slice(bodyStart, bodyEnd + 1).join('\n');
}

/**
 * Find which state variable a setter function modifies.
 */
function findModifiedVariable(funcName: string, stateVars: Set<string>, funcBody: string): string | null {
  for (const prefix of SETTER_PREFIXES) {
    if (funcName.toLowerCase().startsWith(prefix.toLowerCase())) {
      const rest = funcName.slice(prefix.length);
      if (rest.length === 0) continue;
      const camelCase = rest[0].toLowerCase() + rest.slice(1);
      if (stateVars.has(camelCase)) return camelCase;
      if (stateVars.has(rest)) return rest;
      if (stateVars.has(`_${camelCase}`)) return `_${camelCase}`;
    }
  }

  for (const varName of stateVars) {
    const assignPattern = new RegExp(`\\b${escapeRegex(varName)}\\s*[=\\[]`);
    if (assignPattern.test(funcBody)) return varName;
  }

  return null;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Grep-based fallback for constraint extraction when AST parsing fails.
 * Validation detection here is purposely loose — anything matching require/revert/assert
 * inside the next 30 lines counts. Auditor will be told via the validation string.
 */
function extractConstraintsGrep(source: string, file: string, constraints: ConstraintEntry[]): void {
  const lines = source.split('\n');
  const funcPattern = /function\s+(set|update|configure|change|adjust|modify)(\w+)\s*\(/i;

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(funcPattern);
    if (!match) continue;

    const funcName = match[1] + match[2];
    const varName = match[2][0].toLowerCase() + match[2].slice(1);

    const bodySlice = lines.slice(i, Math.min(i + 30, lines.length)).join('\n');
    let validation: string | null = null;
    if (/require\s*\(/.test(bodySlice)) validation = 'require()';
    else if (/revert\s+\w+\s*\(/.test(bodySlice)) validation = 'revert with custom error';
    else if (/\brevert\s*\(/.test(bodySlice)) validation = 'revert(...)';
    else if (/\bassert\s*\(/.test(bodySlice)) validation = 'assert()';

    let emitsEvent = false;
    let eventName: string | null = null;
    const emitMatch = bodySlice.match(EMIT_PATTERN);
    if (emitMatch) {
      emitsEvent = true;
      eventName = emitMatch[1];
    }

    constraints.push({
      variable: varName,
      contract: 'Unknown',
      setter: funcName,
      setter_line: i + 1,
      file,
      validation,
      enforcement: validation ? 'ENFORCED' : 'UNENFORCED',
      emits_event: emitsEvent,
      event_name: eventName,
    });
  }
}
