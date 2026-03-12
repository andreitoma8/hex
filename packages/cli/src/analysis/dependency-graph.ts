import fs from 'node:fs';
import path from 'node:path';
import type { ParsedImport, ParsedContract } from '../parsers/solidity-parser.js';
import { normalizePath, splitLines } from '../core/paths.js';

export interface DependencyData {
  graph: Record<string, { inherits: string[]; imports: string[]; calls: string[] }>;
  clusters: Array<{ id: string; contracts: string[]; total_nsloc: number }>;
  inheritanceTrees: string[][];
  topologicalOrder: string[];
}

/**
 * Load remappings from remappings.txt or foundry.toml.
 */
export function loadRemappings(projectDir: string): Map<string, string> {
  const remappings = new Map<string, string>();

  // Try remappings.txt
  const remappingsFile = path.join(projectDir, 'remappings.txt');
  if (fs.existsSync(remappingsFile)) {
    const content = fs.readFileSync(remappingsFile, 'utf-8');
    for (const line of splitLines(content)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIndex = trimmed.indexOf('=');
      if (eqIndex > 0) {
        remappings.set(trimmed.slice(0, eqIndex), trimmed.slice(eqIndex + 1));
      }
    }
    return remappings;
  }

  // Try foundry.toml
  const foundryToml = path.join(projectDir, 'foundry.toml');
  if (fs.existsSync(foundryToml)) {
    const content = fs.readFileSync(foundryToml, 'utf-8');
    const match = content.match(/remappings\s*=\s*\[([\s\S]*?)\]/);
    if (match) {
      const items = match[1].match(/"([^"]+)"|'([^']+)'/g);
      if (items) {
        for (const item of items) {
          const cleaned = item.replace(/["']/g, '');
          const eqIndex = cleaned.indexOf('=');
          if (eqIndex > 0) {
            remappings.set(cleaned.slice(0, eqIndex), cleaned.slice(eqIndex + 1));
          }
        }
      }
    }
  }

  return remappings;
}

/**
 * Resolve an import path using remappings.
 */
export function resolveImportPath(
  importPath: string,
  remappings: Map<string, string>,
): string {
  for (const [prefix, target] of remappings) {
    if (importPath.startsWith(prefix)) {
      return importPath.replace(prefix, target);
    }
  }
  return importPath;
}

/**
 * Build the dependency graph from parsed files.
 */
export function buildDependencyGraph(
  fileData: Map<string, { contracts: ParsedContract[]; imports: ParsedImport[] }>,
  nslocMap: Map<string, number>,
): DependencyData {
  const graph: Record<string, { inherits: string[]; imports: string[]; calls: string[] }> = {};
  const allContracts = new Set<string>();

  // Collect all contract names
  for (const [, data] of fileData) {
    for (const contract of data.contracts) {
      allContracts.add(contract.name);
    }
  }

  // Build adjacency for each contract
  for (const [, data] of fileData) {
    for (const contract of data.contracts) {
      const inherits = contract.baseContracts.filter((b) => allContracts.has(b));
      const importedNames = data.imports.map((i) => {
        // Extract filename without extension as potential contract name
        const baseName = path.basename(i.path, '.sol');
        return baseName;
      }).filter((n) => allContracts.has(n));

      graph[contract.name] = {
        inherits,
        imports: [...new Set(importedNames)],
        calls: [], // Populated later from function calls analysis
      };
    }
  }

  // Detect clusters via union-find
  const clusters = detectClusters(graph, nslocMap);

  // Build inheritance trees
  const inheritanceTrees = buildInheritanceTrees(graph);

  // Topological sort
  const topologicalOrder = topologicalSort(graph);

  return { graph, clusters, inheritanceTrees, topologicalOrder };
}

/**
 * Detect clusters using union-find on the undirected dependency graph.
 */
function detectClusters(
  graph: Record<string, { inherits: string[]; imports: string[]; calls: string[] }>,
  nslocMap: Map<string, number>,
): Array<{ id: string; contracts: string[]; total_nsloc: number }> {
  const parent = new Map<string, string>();

  function find(x: string): string {
    if (!parent.has(x)) parent.set(x, x);
    if (parent.get(x) !== x) {
      parent.set(x, find(parent.get(x)!));
    }
    return parent.get(x)!;
  }

  function union(x: string, y: string): void {
    const px = find(x);
    const py = find(y);
    if (px !== py) parent.set(px, py);
  }

  // Initialize all nodes
  for (const name of Object.keys(graph)) {
    parent.set(name, name);
  }

  // Union connected nodes
  for (const [name, deps] of Object.entries(graph)) {
    for (const dep of [...deps.inherits, ...deps.imports, ...deps.calls]) {
      if (graph[dep]) union(name, dep);
    }
  }

  // Group by root
  const groups = new Map<string, string[]>();
  for (const name of Object.keys(graph)) {
    const root = find(name);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root)!.push(name);
  }

  let clusterId = 0;
  const clusters: Array<{ id: string; contracts: string[]; total_nsloc: number }> = [];
  for (const [, contracts] of groups) {
    contracts.sort();
    const totalNsloc = contracts.reduce((s, c) => s + (nslocMap.get(c) ?? 0), 0);
    clusters.push({
      id: `cluster-${clusterId++}`,
      contracts,
      total_nsloc: totalNsloc,
    });
  }

  return clusters;
}

/**
 * Build inheritance trees (linear chains from base to derived).
 */
function buildInheritanceTrees(
  graph: Record<string, { inherits: string[] }>,
): string[][] {
  const trees: string[][] = [];
  const visited = new Set<string>();

  // Find contracts that nothing inherits from (roots of inheritance trees)
  const inherited = new Set<string>();
  for (const deps of Object.values(graph)) {
    for (const base of deps.inherits) {
      inherited.add(base);
    }
  }

  // For each leaf contract, trace up the inheritance chain
  for (const name of Object.keys(graph)) {
    if (visited.has(name)) continue;

    // Check if anything inherits from this contract
    const isInheritedBy = Object.entries(graph).some(
      ([, deps]) => deps.inherits.includes(name),
    );
    if (isInheritedBy && graph[name].inherits.length === 0) continue; // Skip pure base contracts

    // Trace inheritance chain
    const chain: string[] = [];
    const traceChain = (contract: string): void => {
      if (visited.has(contract)) return;
      const bases = graph[contract]?.inherits ?? [];
      for (const base of bases) {
        if (graph[base]) {
          traceChain(base);
        }
      }
      chain.push(contract);
      visited.add(contract);
    };

    traceChain(name);
    if (chain.length > 1) {
      trees.push(chain);
    }
  }

  return trees;
}

/**
 * Topological sort using Kahn's algorithm.
 */
function topologicalSort(
  graph: Record<string, { inherits: string[]; imports: string[]; calls: string[] }>,
): string[] {
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  for (const name of Object.keys(graph)) {
    if (!inDegree.has(name)) inDegree.set(name, 0);
    if (!adjacency.has(name)) adjacency.set(name, []);
  }

  for (const [name, deps] of Object.entries(graph)) {
    const allDeps = [...deps.inherits, ...deps.imports];
    for (const dep of allDeps) {
      if (graph[dep]) {
        adjacency.get(dep)!.push(name);
        inDegree.set(name, (inDegree.get(name) ?? 0) + 1);
      }
    }
  }

  const queue: string[] = [];
  for (const [name, degree] of inDegree) {
    if (degree === 0) queue.push(name);
  }

  const order: string[] = [];
  while (queue.length > 0) {
    const current = queue.shift()!;
    order.push(current);
    for (const neighbor of adjacency.get(current) ?? []) {
      const newDegree = (inDegree.get(neighbor) ?? 0) - 1;
      inDegree.set(neighbor, newDegree);
      if (newDegree === 0) queue.push(neighbor);
    }
  }

  return order;
}
