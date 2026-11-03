/**
 * Triage rules (`.hex/triage-rules.json`): the auditor's standing decisions
 * ("admin is trusted", "fee-on-transfer tokens are out of scope", known issues).
 * Fed into every AI run so the same false-positive classes stop resurfacing.
 * Node builtins only.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { TriageRule } from '../types/index.js';

const file = (outputDir: string) => path.join(outputDir, 'triage-rules.json');

export function readRules(outputDir: string): TriageRule[] {
  try {
    return (
      (JSON.parse(fs.readFileSync(file(outputDir), 'utf-8')) as { rules: TriageRule[] }).rules ?? []
    );
  } catch {
    return [];
  }
}

function writeRules(outputDir: string, rules: TriageRule[]): void {
  const p = file(outputDir);
  const tmp = p + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify({ rules }, null, 2) + '\n', 'utf-8');
  fs.renameSync(tmp, p);
}

export function addRule(
  outputDir: string,
  input: { kind: TriageRule['kind']; text: string; scope?: string[]; created_from?: string },
): TriageRule {
  const rules = readRules(outputDir);
  const max = rules.reduce((m, r) => Math.max(m, parseInt(r.id.replace(/^R-/, ''), 10) || 0), 0);
  const rule: TriageRule = {
    id: `R-${String(max + 1).padStart(3, '0')}`,
    kind: input.kind,
    text: input.text.trim(),
    scope: input.scope ?? [],
    ...(input.created_from ? { created_from: input.created_from } : {}),
    created_at: new Date().toISOString(),
  };
  rules.push(rule);
  writeRules(outputDir, rules);
  return rule;
}

export function removeRule(outputDir: string, id: string): void {
  const rules = readRules(outputDir);
  if (!rules.some((r) => r.id === id)) throw new Error(`No triage rule ${id}`);
  writeRules(
    outputDir,
    rules.filter((r) => r.id !== id),
  );
}

const KIND_LABEL: Record<TriageRule['kind'], string> = {
  out_of_scope: 'Out of scope',
  trusted_role: 'Trusted role',
  by_design: 'By design',
  known_issue: 'Known issue',
};

/** Markdown for agent bundles: what the auditor already decided not to report. */
export function rulesMarkdown(rules: TriageRule[]): string {
  if (rules.length === 0) return '';
  const out = [
    '# Triage rules — the auditor already decided these',
    '',
    'Do not report a finding whose whole impact depends on one of these. If a finding matches a rule only partly, report it and say which part the rule does not cover.',
    '',
  ];
  for (const r of rules) {
    out.push(
      `- **${r.id}** (${KIND_LABEL[r.kind]}${r.scope.length ? `; ${r.scope.join(', ')}` : ''}): ${r.text}`,
    );
  }
  return out.join('\n') + '\n';
}
