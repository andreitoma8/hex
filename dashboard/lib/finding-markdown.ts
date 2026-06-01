import type { BoardIssue } from '@/app/issues/IssuesBoardClient';

/**
 * Single source of truth for the finding markdown format used by the board's
 * "Copy as HackMD" button (and matching the GitHub issue body the /sync-issues
 * skill renders). Keep this aligned with src/skills/sync-issues.md.
 */
export interface FormatContext {
  /** config.json settings.report.repository_url, if set */
  repositoryUrl?: string;
  /** config.json settings.report.initial_commit, if set */
  commit?: string;
}

function fileLink(file: string, ctx: FormatContext): string {
  if (ctx.repositoryUrl && ctx.commit) {
    const base = ctx.repositoryUrl.replace(/\/+$/, '');
    return `[\`${file}\`](${base}/blob/${ctx.commit}/${file})`;
  }
  // Empty link target — explicit, matches the GitHub issue template.
  return `[\`${file}\`]()`;
}

/** The five-field body shared by HackMD copy and the GitHub issue body. */
function bodyFields(issue: BoardIssue, ctx: FormatContext): string {
  const seen = new Set<string>();
  const files = issue.code_locations
    .map((l) => l.file)
    .filter((f) => f && !seen.has(f) && seen.add(f))
    .map((f) => fileLink(f, ctx))
    .join(', ');
  const status = issue.resolution || 'Unresolved';
  const update = issue.update_from_client ?? '';
  return [
    `**File(s)**: ${files}`,
    ``,
    `**Description**: ${issue.description}`,
    ``,
    `**Recommendation(s)**: ${issue.recommendation}`,
    ``,
    `**Status**: ${status}`,
    ``,
    `**Update from the client**: ${update}`,
  ].join('\n');
}

/** HackMD-style: leading `## [Severity] Title` heading, then the body. */
export function findingToHackmd(issue: BoardIssue, ctx: FormatContext = {}): string {
  return `## [${issue.severity}] ${issue.title}\n\n${bodyFields(issue, ctx)}\n`;
}

/**
 * GitHub issue body: no heading (the GH issue title carries `[Severity] Title`),
 * no attribution, and NO hidden footer. Issue identity is the GitHub issue
 * number, so nothing needs to be embedded in the body — it is exactly the five
 * fields, "nothing more, nothing less".
 */
export function findingToGithubBody(issue: BoardIssue, ctx: FormatContext = {}): string {
  return bodyFields(issue, ctx);
}

export interface ParsedGithubBody {
  files: string[];
  description: string;
  recommendation: string;
  status: string;
  update_from_client: string;
}

/**
 * Inverse of `findingToGithubBody`: parse a GitHub issue body back into fields
 * so `/sync-issues` can pull GitHub edits into local findings. Returns null when
 * the body is blatantly not in our template (no `**Description**:` marker), so
 * the caller can warn and skip. This is the format spec the sync skill mirrors.
 */
export function parseGithubBody(body: string): ParsedGithubBody | null {
  if (!/(^|\n)\s*\*\*Description\*\*\s*:/.test(body)) return null;

  // Split on the bold field labels, keeping the text that follows each up to
  // the next label.
  const labels = [
    'File(s)',
    'Description',
    'Recommendation(s)',
    'Status',
    'Update from the client',
  ];
  const section = (label: string): string => {
    const others = labels
      .filter((l) => l !== label)
      .map((l) => l.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const esc = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(
      `\\*\\*${esc}\\*\\*\\s*:\\s*([\\s\\S]*?)(?=\\n\\s*\\*\\*(?:${others.join('|')})\\*\\*\\s*:|$)`,
    );
    const m = re.exec(body);
    return m ? m[1].trim() : '';
  };

  const filesRaw = section('File(s)');
  const files = Array.from(filesRaw.matchAll(/\[`([^`]+)`\]/g)).map((m) => m[1]);

  return {
    files,
    description: section('Description'),
    recommendation: section('Recommendation(s)'),
    status: section('Status') || 'Unresolved',
    update_from_client: section('Update from the client'),
  };
}
