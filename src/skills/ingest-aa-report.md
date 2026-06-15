---
description: "Ingest a completed Nethermind AuditAgent scan into the board and dedup against existing issues"
---

# Skill: Ingest AuditAgent Report

**Recommended model:** Sonnet

This skill is the single point of integration with Nethermind's AuditAgent. It does **not** start scans — the auditor starts a scan separately (e.g. via the Nethermind portal or `aa scan ...` from the command line) and passes the resulting scan ID into this skill. The skill fetches the results, normalizes them into the board, and inline-dedupes against everything already there.

## When to use

After you have a scan ID for a completed (or running) AuditAgent scan and want its findings on the dashboard's Issues board. Typical sequence:

1. Auditor starts a scan elsewhere: `aa scan --quality auditor <files>`, copies the scan ID printed by the CLI.
2. Auditor invokes `/ingest-aa-report` with that ID.

## Step 1 — Resolve the scan ID

Try in order:

1. The free-text argument passed with the invocation (e.g., `/ingest-aa-report abc123def`).
2. `settings.ai.auditagent_scan_id` in `<output_dir>/config.json`.
3. **Ask the auditor** via AskUserQuestion: "Paste the AuditAgent scan ID, or type `cancel` to stop."

When a scan ID is resolved, persist it to `config.json` under `settings.ai.auditagent_scan_id` (so re-runs work without re-asking) and to `<output_dir>/ai-status.json` under `tools.auditagent.scan_id` (so `hex ai-status --watch` can poll it).

## Step 2 — Check scan status

Run:

```bash
aa scan --status <scan_id>
```

Interpret the output:

- Status indicates **pending / running / in progress** → print `Scan <scan_id> is still <status>. Come back once it completes — you can run \`hex ai-status --watch\` in another terminal to be notified.` Update `ai-status.json` with `status: "pending_scan"`. **Exit cleanly** — do NOT block.
- Status indicates **failed** or `aa` exits non-zero → print the error, update `ai-status.json` with `status: "failed"` and `error: <message>`. Exit non-zero.
- Status indicates **completed** → continue to Step 3.

Never invoke `aa scan` to start a new scan. If the auditor has no scan ID, instruct them to start one externally.

## Step 3 — Fetch findings

Run:

```bash
aa scan --report <scan_id>
```

(Or the equivalent results-fetch command exposed by the installed `aa` version — check `aa scan --help` if `--report` is not supported.)

Capture the raw output to `<output_dir>/ai-results/auditagent/raw-output.md`.

## Step 4 — Normalize into findings.json

Parse the AuditAgent output (markdown with severity-tagged sections per finding) and convert each finding into the schema:

```json
{
  "id": "AA-<NNN>",
  "tool": "auditagent",
  "title": "<finding title>",
  "severity": "Critical | High | Medium | Low | Info",
  "description": "<concise description — what it is, why it exists, the impact; trim AuditAgent's verbosity. The verbatim original stays in raw-output.md>",
  "affected_code": [
    { "file": "<path>", "snippet": "<relevant code if present>" }
  ],
  "confidence": "high | medium | low",
  "category": "<auditor-style category, e.g., Access Control, Math/Rounding>",
  "raw_category": "<the raw category string from auditagent, preserved verbatim>"
}
```

Write the full array under:

```json
{
  "tool": "auditagent",
  "ran_at": "<ISO timestamp of this ingest>",
  "duration_seconds": null,
  "total_findings": <count>,
  "findings": [ ... ]
}
```

to `<output_dir>/ai-results/auditagent/findings.json`. Also write a small `metadata.json` next to it:

```json
{
  "scan_id": "<scan_id>",
  "ingested_at": "<ISO>",
  "report_status": "completed",
  "total_findings": <count>
}
```

## Step 5 — Materialize board cards

The raw AuditAgent findings keep their own `AA-<NNN>` ids inside `ai-results/auditagent/findings.json` (that file is the source record). The **board** card gets a uniform `H-NNN` id. Create one per finding via the CLI — it allocates the id and materializes the full finding (title, severity, description, affected code) from the raw record by `source_ref`:

```bash
npx hex issue new --source auditagent --source-ref <AA-NNN> --title "<title>" --severity <Severity>
```

Capture each printed `H-NNN`. Cards land in the Potential column with `status: unverified`. Never hand-edit `tracking.json`.

## Step 6 — Inline dedup

Read all existing tracking entries (manual, conformance, github, and any previously ingested auditagent runs) — all uniform `H-NNN` ids. For each **new** auditagent card, run a semantic comparison against each existing entry on these axes:

| Signal | How to compare |
|---|---|
| **contract** (boolean) | Does the affected contract name match? |
| **function** (boolean) | Does the affected function name match? |
| **root_cause** | `same` / `overlapping` / `different` — judge the technical mechanism (e.g. "reentrancy on external call before state update" is `same` as "missing CEI pattern around external call"). |
| **attack_vector** | `same` / `overlapping` / `different` — judge what an attacker actually does to exploit it. |

A match is **at least one of**:
- `root_cause = same` AND `function = true`, or
- `root_cause = same` AND `contract = true` AND `attack_vector = same`, or
- `root_cause = overlapping` AND `function = true` AND `attack_vector = same`.

On match, **move the new auditagent card to the Duplicate column** (the canonical is the existing entry — the auditor already filed or already has it from another source):

```bash
npx hex issue move <new-H-id> --to duplicate
```

Then record the match in `<output_dir>/comparison.json` under `duplicates`. The board reads this to show the "dup of `<canonical-H-id>`" chip and the match signals (it derives `duplicate_of` from the `matches` field here):

```json
{
  "ai_finding": "<new-H-id>",
  "matches": "<canonical-H-id>",
  "confidence": "high | medium | low",
  "match_signals": { "contract": true, "function": true, "root_cause": "same", "attack_vector": "same" },
  "reasoning": "<one short sentence: which signals carried the call>"
}
```

If `comparison.json` doesn't exist, create it with `{ "duplicates": [], "novel": [], "rejected": [] }`.

For entries that don't match anything, leave them as `status: "unverified"` (the auditor will run `/validate-issue AA-<NNN>` on them).

## Step 7 — Report

Print a one-paragraph summary:

```
Ingested N AuditAgent findings (scan <scan_id>).
- M new on the Potential column
- K flagged as Duplicate of existing entries
- 0 errors

Run /validate-issue <id> on any new finding to confirm and promote it to Verified.
```

## Outputs (recap)

- `<output_dir>/ai-results/auditagent/raw-output.md`
- `<output_dir>/ai-results/auditagent/findings.json`
- `<output_dir>/ai-results/auditagent/metadata.json`
- `<output_dir>/ai-status.json` (updated)
- `<output_dir>/tracking.json` (appended)
- `<output_dir>/comparison.json` (appended)
- `<output_dir>/config.json` — `settings.ai.auditagent_scan_id` persisted if new
