import * as parser from '@solidity-parser/parser';
import type { ASTNode, Comment } from '@solidity-parser/parser/src/ast-types.js';

export interface ParsedContract {
  name: string;
  type: 'contract' | 'interface' | 'library' | 'abstract';
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
