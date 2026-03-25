import * as parser from '@solidity-parser/parser';
import type { ASTNode, Comment } from '@solidity-parser/parser/src/ast-types.js';

export interface ParsedContract {
  name: string;
  type: 'contract' | 'interface' | 'library' | 'abstract';
  lineStart: number;
  lineEnd: number;
  baseContracts: string[];
  functions: ParsedFunction[];
  modifiers: ParsedModifier[];
  events: string[];
  errors: string[];
  stateVariables: ParsedStateVariable[];
  structs: string[];
  enums: string[];
}

export interface ParsedFunction {
  name: string;
  visibility: 'external' | 'public' | 'internal' | 'private' | 'default';
  stateMutability: string | null;
  modifiers: string[];
  lineStart: number;
  lineEnd: number;
  isConstructor: boolean;
  isFallback: boolean;
  isReceive: boolean;
}

export interface ParsedModifier {
  name: string;
  lineStart: number;
  lineEnd: number;
}

export interface ParsedStateVariable {
  name: string;
  typeName: string;
  visibility: 'public' | 'internal' | 'private';
  mutability: 'mutable' | 'constant' | 'immutable';
  lineStart: number;
  lineEnd: number;
  initialValue: string | null;
}

export interface ParsedImport {
  path: string;
  symbols: string[];
  lineStart: number;
}

export interface ParseResult {
  contracts: ParsedContract[];
  imports: ParsedImport[];
  pragmas: string[];
  comments: Comment[];
}

/**
 * Parse a Solidity source file into a structured result.
 */
export function parseSolidity(source: string, filePath?: string): ParseResult {
  const ast = parser.parse(source, {
    loc: true,
    range: true,
    tolerant: true,
    tokens: true,
  });

  const contracts: ParsedContract[] = [];
  const imports: ParsedImport[] = [];
  const pragmas: string[] = [];
  const comments = (ast as unknown as { comments?: Comment[] }).comments ?? [];

  for (const node of ast.children) {
    if (node.type === 'PragmaDirective') {
      pragmas.push(`${node.name} ${node.value}`);
    } else if (node.type === 'ImportDirective') {
      imports.push({
        path: node.path,
        symbols: (node.symbolAliases ?? []).map(
          (s: [string, string | null]) => s[0],
        ),
        lineStart: node.loc?.start.line ?? 0,
      });
    } else if (node.type === 'ContractDefinition') {
      contracts.push(parseContract(node));
    }
  }

  return { contracts, imports, pragmas, comments };
}

/**
 * Cache for parseSolidity results, keyed by filePath.
 * Persists within a single Node process (e.g., during `solaudit analyze`),
 * saving redundant re-parses when multiple commands process the same files.
 */
const parseCache = new Map<string, ParseResult>();

export function parseSolidityCached(source: string, filePath: string): ParseResult {
  const cached = parseCache.get(filePath);
  if (cached) return cached;
  const result = parseSolidity(source, filePath);
  parseCache.set(filePath, result);
  return result;
}

function parseContract(node: ASTNode & { type: 'ContractDefinition' }): ParsedContract {
  const isAbstract = node.kind === 'abstract';
  let type: ParsedContract['type'];
  if (node.kind === 'interface') type = 'interface';
  else if (node.kind === 'library') type = 'library';
  else if (isAbstract) type = 'abstract';
  else type = 'contract';

  const baseContracts = (node.baseContracts ?? []).map(
    (b: ASTNode) => {
      const base = b as ASTNode & { baseName: { namePath: string } };
      return base.baseName?.namePath ?? '';
    },
  );

  const functions: ParsedFunction[] = [];
  const modifiers: ParsedModifier[] = [];
  const events: string[] = [];
  const errors: string[] = [];
  const stateVariables: ParsedStateVariable[] = [];
  const structs: string[] = [];
  const enums: string[] = [];

  for (const sub of node.subNodes ?? []) {
    switch (sub.type) {
      case 'FunctionDefinition':
        functions.push(parseFunction(sub as ASTNode & { type: 'FunctionDefinition' }));
        break;
      case 'ModifierDefinition':
        modifiers.push({
          name: (sub as ASTNode & { name: string }).name,
          lineStart: sub.loc?.start.line ?? 0,
          lineEnd: sub.loc?.end.line ?? 0,
        });
        break;
      case 'EventDefinition':
        events.push((sub as ASTNode & { name: string }).name);
        break;
      case 'CustomErrorDefinition':
        errors.push((sub as ASTNode & { name: string }).name);
        break;
      case 'StateVariableDeclaration': {
        const sv = parseStateVariable(sub as ASTNode & { type: 'StateVariableDeclaration' });
        if (sv) stateVariables.push(sv);
        break;
      }
      case 'StructDefinition':
        structs.push((sub as ASTNode & { name: string }).name);
        break;
      case 'EnumDefinition':
        enums.push((sub as ASTNode & { name: string }).name);
        break;
    }
  }

  return {
    name: node.name ?? '',
    type,
    lineStart: node.loc?.start.line ?? 0,
    lineEnd: node.loc?.end.line ?? 0,
    baseContracts,
    functions,
    modifiers,
    events,
    errors,
    stateVariables,
    structs,
    enums,
  };
}

function parseFunction(node: ASTNode & { type: 'FunctionDefinition' }): ParsedFunction {
  const funcNode = node as ASTNode & {
    name: string | null;
    visibility: string;
    stateMutability: string | null;
    modifiers: Array<{ name: string }>;
    isConstructor: boolean;
    isFallback: boolean;
    isReceiveEther: boolean;
  };

  return {
    name: funcNode.name ?? (funcNode.isConstructor ? 'constructor' : funcNode.isFallback ? 'fallback' : 'receive'),
    visibility: (funcNode.visibility as ParsedFunction['visibility']) || 'default',
    stateMutability: funcNode.stateMutability,
    modifiers: (funcNode.modifiers ?? []).map((m) => m.name),
    lineStart: node.loc?.start.line ?? 0,
    lineEnd: node.loc?.end.line ?? 0,
    isConstructor: funcNode.isConstructor ?? false,
    isFallback: funcNode.isFallback ?? false,
    isReceive: funcNode.isReceiveEther ?? false,
  };
}

function parseStateVariable(node: ASTNode & { type: 'StateVariableDeclaration' }): ParsedStateVariable | null {
  const svNode = node as ASTNode & {
    variables: Array<{
      name: string;
      typeName: ASTNode;
      visibility: string;
      isDeclaredConst: boolean;
      isImmutable: boolean;
      expression: ASTNode | null;
    }>;
  };

  const v = svNode.variables?.[0];
  if (!v) return null;

  let mutability: ParsedStateVariable['mutability'] = 'mutable';
  if (v.isDeclaredConst) mutability = 'constant';
  else if (v.isImmutable) mutability = 'immutable';

  return {
    name: v.name,
    typeName: typeNameToString(v.typeName),
    visibility: (v.visibility as ParsedStateVariable['visibility']) || 'internal',
    mutability,
    lineStart: node.loc?.start.line ?? 0,
    lineEnd: node.loc?.end.line ?? 0,
    initialValue: v.expression ? expressionToString(v.expression) : null,
  };
}

function typeNameToString(node: ASTNode): string {
  if (!node) return 'unknown';
  const n = node as ASTNode & { name?: string; namePath?: string; type: string; baseTypeName?: ASTNode; length?: ASTNode; keyType?: ASTNode; valueType?: ASTNode; components?: ASTNode[] };

  switch (n.type) {
    case 'ElementaryTypeName':
      return n.name ?? 'unknown';
    case 'UserDefinedTypeName':
      return n.namePath ?? 'unknown';
    case 'ArrayTypeName':
      return `${typeNameToString(n.baseTypeName!)}[]`;
    case 'Mapping':
      return `mapping(${typeNameToString(n.keyType!)} => ${typeNameToString(n.valueType!)})`;
    default:
      return 'unknown';
  }
}

function expressionToString(node: ASTNode): string {
  const n = node as unknown as { type: string; number?: string; value?: string | boolean };
  switch (n.type) {
    case 'NumberLiteral':
      return n.number ?? '';
    case 'StringLiteral':
      return `"${n.value ?? ''}"`;
    case 'BooleanLiteral':
      return String(n.value ?? '');
    default:
      return '';
  }
}

// ─── External call extraction from AST ────────────────────────────

export interface ASTExternalCall {
  contract: string;
  function: string;
  target: string;
  method: string;
  file: string;
  lineStart: number;
  lineEnd: number;
  snippet: string;
  callType: 'member_access' | 'low_level';
}

/**
 * Extract external calls from parsed Solidity AST by walking all function bodies.
 * Identifies MemberAccess + FunctionCall on external contracts and low-level calls.
 */
export function extractExternalCalls(
  source: string,
  filePath: string,
): ASTExternalCall[] {
  let ast;
  try {
    ast = parser.parse(source, { loc: true, range: true, tolerant: true });
  } catch {
    return [];
  }

  const calls: ASTExternalCall[] = [];
  const lines = source.split('\n');

  for (const node of ast.children) {
    if (node.type !== 'ContractDefinition') continue;
    const contractNode = node as ASTNode & { type: 'ContractDefinition'; name: string; subNodes: ASTNode[] };
    if (contractNode.kind === 'interface' || contractNode.kind === 'library') continue;

    for (const sub of contractNode.subNodes ?? []) {
      if (sub.type !== 'FunctionDefinition') continue;
      const funcNode = sub as ASTNode & {
        name: string | null;
        isConstructor: boolean;
        isFallback: boolean;
        isReceiveEther: boolean;
        body: ASTNode | null;
      };
      const funcName = funcNode.name ?? (funcNode.isConstructor ? 'constructor' : funcNode.isFallback ? 'fallback' : 'receive');

      if (!funcNode.body) continue;
      walkForExternalCalls(funcNode.body, contractNode.name, funcName, filePath, lines, calls);
    }
  }

  return calls;
}

function walkForExternalCalls(
  node: ASTNode,
  contractName: string,
  funcName: string,
  filePath: string,
  lines: string[],
  calls: ASTExternalCall[],
): void {
  if (!node || typeof node !== 'object') return;

  // Skip emit statements — they are events, not external calls
  if (node.type === 'EmitStatement') return;

  if (node.type === 'FunctionCall') {
    const fc = node as ASTNode & {
      expression: ASTNode;
      arguments: ASTNode[];
    };

    // Check for MemberAccess pattern: expr.method(...)
    if (fc.expression?.type === 'MemberAccess') {
      const ma = fc.expression as ASTNode & {
        expression: ASTNode;
        memberName: string;
      };

      const target = expressionToCallTarget(ma.expression);
      const method = ma.memberName;

      // Skip common non-external patterns
      if (!isLikelyExternalCall(target, method)) {
        // Still walk children
        walkChildren(node, contractName, funcName, filePath, lines, calls);
        return;
      }

      const lineStart = node.loc?.start.line ?? 0;
      const lineEnd = node.loc?.end.line ?? 0;
      const snippet = lines.slice(Math.max(0, lineStart - 1), lineEnd).join('\n').trim();

      // Detect low-level calls
      const isLowLevel = ['call', 'staticcall', 'delegatecall', 'send'].includes(method);

      calls.push({
        contract: contractName,
        function: funcName,
        target,
        method,
        file: filePath,
        lineStart,
        lineEnd,
        snippet,
        callType: isLowLevel ? 'low_level' : 'member_access',
      });
    }

    // Check for NameValueExpression (low-level calls with value: foo.call{value: x}(...))
    if (fc.expression?.type === 'NameValueExpression') {
      const nve = fc.expression as ASTNode & {
        expression: ASTNode;
      };
      if (nve.expression?.type === 'MemberAccess') {
        const ma = nve.expression as ASTNode & {
          expression: ASTNode;
          memberName: string;
        };
        const target = expressionToCallTarget(ma.expression);
        const method = ma.memberName;
        const lineStart = node.loc?.start.line ?? 0;
        const lineEnd = node.loc?.end.line ?? 0;
        const snippet = lines.slice(Math.max(0, lineStart - 1), lineEnd).join('\n').trim();

        calls.push({
          contract: contractName,
          function: funcName,
          target,
          method,
          file: filePath,
          lineStart,
          lineEnd,
          snippet,
          callType: 'low_level',
        });
      }
    }
  }

  walkChildren(node, contractName, funcName, filePath, lines, calls);
}

function walkChildren(
  node: ASTNode,
  contractName: string,
  funcName: string,
  filePath: string,
  lines: string[],
  calls: ASTExternalCall[],
): void {
  for (const key of Object.keys(node)) {
    if (key === 'loc' || key === 'range') continue;
    const val = (node as unknown as Record<string, unknown>)[key];
    if (Array.isArray(val)) {
      for (const item of val) {
        if (item && typeof item === 'object' && 'type' in item) {
          walkForExternalCalls(item as ASTNode, contractName, funcName, filePath, lines, calls);
        }
      }
    } else if (val && typeof val === 'object' && 'type' in val) {
      walkForExternalCalls(val as ASTNode, contractName, funcName, filePath, lines, calls);
    }
  }
}

function expressionToCallTarget(node: ASTNode): string {
  if (!node) return '';
  const n = node as ASTNode & { name?: string; namePath?: string; type: string; expression?: ASTNode; memberName?: string; arguments?: ASTNode[] };

  switch (n.type) {
    case 'Identifier':
      return n.name ?? '';
    case 'MemberAccess':
      return `${expressionToCallTarget(n.expression!)}.${n.memberName}`;
    case 'FunctionCall': {
      // Handle type casts like IERC20(token)
      const callee = n.expression as ASTNode & { namePath?: string; name?: string; type: string };
      if (callee?.type === 'UserDefinedTypeName' || callee?.type === 'Identifier') {
        return callee.namePath ?? callee.name ?? '';
      }
      return expressionToCallTarget(n.expression!);
    }
    case 'IndexAccess':
      return expressionToCallTarget(n.expression!);
    default:
      return '';
  }
}

/**
 * Heuristic: is this likely an external call vs an internal/library call?
 */
function isLikelyExternalCall(target: string, method: string): boolean {
  // Low-level calls are always external
  if (['call', 'staticcall', 'delegatecall', 'send', 'transfer'].includes(method)) return true;

  // Skip common library/internal patterns
  if (target === 'abi') return false;
  if (target === 'msg' || target === 'block' || target === 'tx') return false;
  if (target === 'super') return false;
  if (target === 'this') return false;
  if (target === 'type') return false;

  // Skip string/bytes methods
  if (method === 'concat') return false;

  // Math library methods on types
  if (['add', 'sub', 'mul', 'div', 'mod'].includes(method) && !target.includes('(')) return false;

  // If target starts with uppercase or is a cast like IERC20, likely external
  if (target.match(/^[A-Z]/)) return true;

  // If target is a variable (lowercase), could be external
  if (target.match(/^[a-z_]/)) return true;

  return false;
}

/**
 * Extract the Solidity version from pragma statements.
 */
export function extractSolidityVersion(pragmas: string[]): string | null {
  for (const p of pragmas) {
    const match = p.match(/solidity\s+[\^~>=<]*\s*([\d.]+)/);
    if (match) return match[1];
  }
  return null;
}
