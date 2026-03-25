import fs from 'node:fs';
import path from 'node:path';
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

// Patterns that indicate validation within a function body
const VALIDATION_PATTERNS = [
  /require\s*\([^)]+\)/,
  /if\s*\([^)]*\)\s*(revert|require)/,
  /revert\s+\w+\(/,
];

// Pattern for event emission
const EMIT_PATTERN = /emit\s+(\w+)\s*\(/;

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
      // If parsing fails, try grep-based extraction
      extractConstraintsGrep(source, normalFile, constraints);
      continue;
    }

    for (const contract of parsed.contracts) {
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

        // Extract the function body from source
        const funcBody = extractFunctionBody(source, func.name, func.lineStart);
        if (!funcBody) continue;

        // Find which state variable this setter modifies
        const modifiedVar = findModifiedVariable(func.name, stateVarNames, funcBody);
        if (!modifiedVar) continue;

        // Check for validation
        let validation: string | null = null;
        for (const pattern of VALIDATION_PATTERNS) {
          const match = funcBody.match(pattern);
          if (match) {
            validation = match[0];
            break;
          }
        }

        // Check for event emission
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
          validation,
          enforcement: validation ? 'ENFORCED' : 'UNENFORCED',
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
 * Extract the body of a function from source code.
 */
function extractFunctionBody(source: string, funcName: string, startLine: number): string | null {
  const lines = source.split('\n');
  // Search from the function start line for the function signature
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

    // Don't search too far
    if (i - start > 200) break;
  }

  if (bodyStart === -1 || bodyEnd === -1) return null;
  return lines.slice(bodyStart, bodyEnd + 1).join('\n');
}

/**
 * Find which state variable a setter function modifies.
 */
function findModifiedVariable(funcName: string, stateVars: Set<string>, funcBody: string): string | null {
  // Strategy 1: Infer from function name (e.g., setMaxSlippage → maxSlippage)
  for (const prefix of SETTER_PREFIXES) {
    if (funcName.toLowerCase().startsWith(prefix.toLowerCase())) {
      const rest = funcName.slice(prefix.length);
      if (rest.length === 0) continue;
      // Try both camelCase and lowercase first char
      const camelCase = rest[0].toLowerCase() + rest.slice(1);
      if (stateVars.has(camelCase)) return camelCase;
      if (stateVars.has(rest)) return rest;
      // Try with underscore prefix
      if (stateVars.has(`_${camelCase}`)) return `_${camelCase}`;
    }
  }

  // Strategy 2: Look for assignment to a state variable in the function body
  for (const varName of stateVars) {
    // Match "varName = " or "varName[" assignments
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
 */
function extractConstraintsGrep(source: string, file: string, constraints: ConstraintEntry[]): void {
  const lines = source.split('\n');
  const funcPattern = /function\s+(set|update|configure|change|adjust|modify)(\w+)\s*\(/i;

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(funcPattern);
    if (!match) continue;

    const funcName = match[1] + match[2];
    const varName = match[2][0].toLowerCase() + match[2].slice(1);

    // Look ahead for validation and event emission (next 30 lines)
    const bodySlice = lines.slice(i, Math.min(i + 30, lines.length)).join('\n');
    let validation: string | null = null;
    for (const pattern of VALIDATION_PATTERNS) {
      const valMatch = bodySlice.match(pattern);
      if (valMatch) {
        validation = valMatch[0];
        break;
      }
    }

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
