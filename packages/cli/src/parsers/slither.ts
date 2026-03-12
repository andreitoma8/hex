/**
 * Parse Slither JSON outputs for various printers and detectors.
 */

export interface SlitherFunctionSummary {
  contract: string;
  function: string;
  visibility: string;
  modifiers: string[];
  readVars: string[];
  writeVars: string[];
  internalCalls: string[];
  externalCalls: string[];
}

export interface SlitherDetectorResult {
  check: string;
  impact: string;
  confidence: string;
  description: string;
  elements: SlitherElement[];
}

export interface SlitherElement {
  type: string;
  name: string;
  source_mapping: {
    filename_relative: string;
    lines: number[];
    starting_column: number;
    ending_column: number;
  };
  type_specific_fields?: Record<string, unknown>;
}

export interface SlitherDataDependency {
  contract: string;
  variable: string;
  dependencies: string[];
}

/**
 * Parse Slither's function-summary printer output.
 */
export function parseFunctionSummary(json: unknown): SlitherFunctionSummary[] {
  const results: SlitherFunctionSummary[] = [];

  if (!json || typeof json !== 'object') return results;

  const data = json as Record<string, unknown>;
  const printers = (data.results as Record<string, unknown>)?.printers as unknown[];

  if (!Array.isArray(printers)) return results;

  for (const printer of printers) {
    const p = printer as Record<string, unknown>;
    if (p.printer !== 'function-summary') continue;

    const elements = p.elements as unknown[];
    if (!Array.isArray(elements)) continue;

    for (const elem of elements) {
      const e = elem as Record<string, unknown>;
      const rows = e.rows as unknown[];
      if (!Array.isArray(rows)) continue;

      for (const row of rows) {
        const r = row as Record<string, unknown>;
        results.push({
          contract: String(r.contract ?? ''),
          function: String(r.function ?? ''),
          visibility: String(r.visibility ?? ''),
          modifiers: parseStringList(r.modifiers),
          readVars: parseStringList(r.read),
          writeVars: parseStringList(r.write),
          internalCalls: parseStringList(r.internal_calls),
          externalCalls: parseStringList(r.external_calls),
        });
      }
    }
  }

  return results;
}

/**
 * Parse Slither detector results.
 */
export function parseDetectors(json: unknown): SlitherDetectorResult[] {
  if (!json || typeof json !== 'object') return [];

  const data = json as Record<string, unknown>;
  const results = data.results as Record<string, unknown>;
  const detectors = results?.detectors as unknown[];

  if (!Array.isArray(detectors)) return [];

  return detectors.map((d) => {
    const det = d as Record<string, unknown>;
    return {
      check: String(det.check ?? ''),
      impact: String(det.impact ?? ''),
      confidence: String(det.confidence ?? ''),
      description: String(det.description ?? ''),
      elements: parseElements(det.elements),
    };
  });
}

/**
 * Parse Slither data-dependency printer output.
 */
export function parseDataDependency(json: unknown): SlitherDataDependency[] {
  const results: SlitherDataDependency[] = [];

  if (!json || typeof json !== 'object') return results;

  const data = json as Record<string, unknown>;
  const printers = (data.results as Record<string, unknown>)?.printers as unknown[];

  if (!Array.isArray(printers)) return results;

  for (const printer of printers) {
    const p = printer as Record<string, unknown>;
    if (p.printer !== 'data-dependency') continue;

    const elements = p.elements as unknown[];
    if (!Array.isArray(elements)) continue;

    for (const elem of elements) {
      const e = elem as Record<string, unknown>;
      results.push({
        contract: String(e.contract ?? ''),
        variable: String(e.variable ?? ''),
        dependencies: parseStringList(e.dependencies),
      });
    }
  }

  return results;
}

/**
 * Parse Slither call-graph printer output into caller→callee edges.
 */
export function parseCallGraph(json: unknown): Array<{
  caller: { contract: string; function: string };
  callee: { contract: string; function: string };
  isExternal: boolean;
}> {
  const edges: Array<{
    caller: { contract: string; function: string };
    callee: { contract: string; function: string };
    isExternal: boolean;
  }> = [];

  if (!json || typeof json !== 'object') return edges;

  const data = json as Record<string, unknown>;
  const printers = (data.results as Record<string, unknown>)?.printers as unknown[];

  if (!Array.isArray(printers)) return edges;

  for (const printer of printers) {
    const p = printer as Record<string, unknown>;
    if (p.printer !== 'call-graph') continue;

    const elements = p.elements as unknown[];
    if (!Array.isArray(elements)) continue;

    for (const elem of elements) {
      const e = elem as Record<string, unknown>;
      edges.push({
        caller: {
          contract: String((e.caller as Record<string, unknown>)?.contract ?? ''),
          function: String((e.caller as Record<string, unknown>)?.function ?? ''),
        },
        callee: {
          contract: String((e.callee as Record<string, unknown>)?.contract ?? ''),
          function: String((e.callee as Record<string, unknown>)?.function ?? ''),
        },
        isExternal: Boolean(e.is_external),
      });
    }
  }

  return edges;
}

function parseElements(elements: unknown): SlitherElement[] {
  if (!Array.isArray(elements)) return [];
  return elements.map((e) => {
    const el = e as Record<string, unknown>;
    const sm = (el.source_mapping ?? {}) as Record<string, unknown>;
    return {
      type: String(el.type ?? ''),
      name: String(el.name ?? ''),
      source_mapping: {
        filename_relative: String(sm.filename_relative ?? ''),
        lines: Array.isArray(sm.lines) ? (sm.lines as number[]) : [],
        starting_column: Number(sm.starting_column ?? 0),
        ending_column: Number(sm.ending_column ?? 0),
      },
      type_specific_fields: el.type_specific_fields as Record<string, unknown>,
    };
  });
}

function parseStringList(val: unknown): string[] {
  if (typeof val === 'string') {
    return val
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (Array.isArray(val)) return val.map(String);
  return [];
}
