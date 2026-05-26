---
description: 'Two-way sync between local Hex findings and GitHub Issues — pulls teammate issues into the board (canonical), pushes verified findings out, runs inline dedup'
---

# Skill: Sync Issues

**Recommended model:** Sonnet

This skill is Hex's GitHub Issues integration. Hex never authenticates with GitHub — you authenticate once via `gh auth login` and this skill drives the `gh` CLI via bash. A single invocation runs both directions plus inline dedup.

**Dedup direction note.** GitHub is the **source of truth**. When a teammate's pulled GitHub issue matches a local potential issue (same root cause, same contract/function), the **local** entry is marked Duplicate — not the GitHub one. The rationale is multi-auditor coordination: if a teammate already filed an issue, your in-progress local card is redundant. This is opposite of the auditagent dedup direction in `/ingest-aa-report`.

## Context Assembly

Read:
- `<output_dir>/config.json` — needs `settings.github.repo` set.
- `<output_dir>/findings.json` — local canonical findings.
- `<output_dir>/tracking.json` — for status filtering on push (default: only `verified` is pushed).
- `<output_dir>/external/github/findings.json` if it exists — last pulled state.
- `<output_dir>/external/github/sync-status.json` for `last_synced_at`.

Writes to:
- `<output_dir>/findings.json` — updates `github.*` blocks on local findings.
- `<output_dir>/external/github/findings.json` — teammate findings in `AiResultFile` shape.
- `<output_dir>/external/github/sync-status.json` — counters + timestamp.
- `<output_dir>/external/github/raw-issues.json` — debug cache of the gh JSON.
- `<output_dir>/tracking.json` — teammate findings as new entries; local entries flipped to `duplicate` on match.
- `<output_dir>/comparison.json` — appended with `match_signals` for each dedup hit.

## Phase 0 — Preflight

**0a. `gh` installed and authenticated?** Run `gh auth status`. If non-zero exit, print:

```
gh CLI is not authenticated. Run `gh auth login` once on this machine, then re-run /sync-issues.
```

…and stop. Hex never stores GitHub credentials.

If `gh` itself is missing: instruct install from `https://cli.github.com/` then `gh auth login`.

**0b. Resolve `settings.github.repo`.** If missing, use **AskUserQuestion**: "Which GitHub repo should this audit sync to? (e.g. `nethermind/audit-vaultx`)". Validate it has an `owner/repo` shape. Persist back to `config.json`.

**0c. Permission check.** Run `gh repo view <repo> --json viewerPermission`. If `READ` or null, **AskUserQuestion**: "Read-only access to <repo>. Push will fail. Continue with pull-only? (yes/no)". Track `push_enabled`.

## Phase 1 — Pull

**1a. Fetch issues.**

```bash
gh issue list --repo <repo> --label "hex" --state all --limit 1000 \
  --json number,title,body,labels,state,author,createdAt,updatedAt,url
```

Save raw JSON to `external/github/raw-issues.json`.

For each issue whose `updatedAt` is newer than the prior `last_synced_at`, fetch comments:

```bash
gh issue view <number> --repo <repo> --json comments
```

(First sync: fetch for everything.)

**1b. Classify each issue.**

Find the round-trip footer in the body: regex `<!--\s*hex-finding-id:\s*(F\d+|AA-\d+|SC-\d+)\s*-->`. Then:

- **Footer present, ID matches a local `findings.json` entry** → known local finding. Update its `github` block in place:
  ```json
  {
    "issue_number": <num>,
    "issue_url": "<url>",
    "state": "open|closed",
    "last_synced_at": "<now>",
    "sync_status": "in_sync",
    "comments": [{ "author": "<login>", "body": "<text>", "created_at": "<iso>", "url": "<url>" }]
  }
  ```

- **Footer present, no matching local finding** → an issue we previously pushed that's since been deleted locally. Append a tracking entry restoring the link (status `pending_validation`, source `manual`, notes pointing at the URL). Do not touch `findings.json` — the body may have been edited remotely.

- **No footer** → teammate finding. Two writes:
  1. Add to the in-memory `external/github/findings.json` AiResultFile (`tool: "github"`, severity parsed from `severity:*` labels, default Medium):
     ```json
     {
       "id": "github-<issue_number>",
       "tool": "github",
       "title": "<issue title>",
       "severity": "Critical|High|Medium|Low|Info",
       "description": "<body without footer>",
       "affected_code": [<best-effort file refs extracted from body>],
       "confidence": "medium",
       "category": "<from label if present>",
       "raw_category": "github-issue"
     }
     ```
  2. Add to `tracking.json`:
     ```json
     {
       "id": "github-<issue_number>",
       "title": "<title>",
       "severity": "<severity>",
       "source": "github",
       "status": "pending_validation",
       "poc_status": "not_started",
       "poc_file": null,
       "duplicates": [],
       "notes": "issue=<url> author=<author>"
     }
     ```

Write `external/github/findings.json` atomically after the pass.

## Phase 2 — Inline dedup (GitHub-canonical)

For each **new github entry** added in Phase 1 step 1b's third branch, run a semantic comparison against every **existing** non-github tracking entry. Match signals:

| Signal | Compare |
|---|---|
| **contract** (boolean) | Affected contract name match? |
| **function** (boolean) | Affected function name match? |
| **root_cause** (`same` / `overlapping` / `different`) | Technical mechanism |
| **attack_vector** (`same` / `overlapping` / `different`) | What an attacker actually does |

A match requires at least one of:
- `root_cause = same` AND `function = true`, or
- `root_cause = same` AND `contract = true` AND `attack_vector = same`, or
- `root_cause = overlapping` AND `function = true` AND `attack_vector = same`.

**On match (GitHub is canonical):**

- Flip the **local** matching entry to `status: "duplicate"`, set `duplicate_of: "github-<issue_number>"` on it.
- The github entry stays `pending_validation` (it's the canonical the team is working from).
- Append to `comparison.json` under `duplicates`:
  ```json
  {
    "ai_finding": "<local-entry-id>",
    "matches": "github-<issue_number>",
    "confidence": "high|medium|low",
    "match_signals": { "contract": true, "function": true, "root_cause": "same", "attack_vector": "same" },
    "reasoning": "<one short sentence>"
  }
  ```
  (The schema field is named `ai_finding` for historical reasons but is repurposed here as "the local duplicate.")

Persist updated `tracking.json` and `comparison.json` after the dedup pass.

## Phase 3 — Push

Skip if `push_enabled = false`.

**3a. Candidates.** From `findings.json`, select each finding whose tracking entry has `status` in `settings.github.publish_status` (default `["verified"]`). Skip findings already marked `status: "duplicate"` (no point publishing a known duplicate).

Within candidates:
- Has `github.issue_number` → update via `gh issue edit`.
- No `github.issue_number` → create via `gh issue create`.

**3b. Render the body** (write to a temp file, then `--body-file`):

```markdown
**Severity:** <Severity>

<finding.description>

### Affected code

<for each finding.root_cause.locations[]>
**`<location.file>`**

```solidity
<location.snippet>
```
</for>

### Recommendation

<finding.recommendation>

---

*Synced from Hex audit `<config.project.name>` at commit `<config.project.commit>`.*

<!-- hex-finding-id: <finding.id> -->
```

The footer is the round-trip identity key — never omit.

**3c. Labels.**

```
<default_labels...> severity:<lowercased> source:<finding.source or 'manual'> status:<tracking.status>
```

Apply via repeated `--label` flags.

**3d. Create or update.**

Create:
```bash
gh issue create --repo <repo> --title "[<Severity>] <title>" --body-file <tmp> \
  --label "hex" --label "audit" --label "severity:..." --label "source:..." --label "status:..."
```

Parse the returned URL to extract the issue number; update the local finding's `github` block.

Update existing:
```bash
gh issue edit <num> --repo <repo> --title "[<Severity>] <title>" --body-file <tmp> \
  --add-label "severity:..." --add-label "status:..."
```

Do NOT `--remove-label` — teammates may have added labels we shouldn't strip.

If push fails for any single finding: capture stderr, set its `github.sync_status` to `conflict`, append a one-line error, continue with the next finding. Never abort the whole sync on one failure.

**3e. Persist** `findings.json` once after all pushes, atomically.

## Phase 4 — Status report

Write `external/github/sync-status.json`:

```json
{
  "repo": "<repo>",
  "last_synced_at": "<now>",
  "pushed": <new-created>,
  "updated": <existing-updated>,
  "pulled": <total-issues-seen>,
  "teammate_findings": <count-of-footer-less>,
  "duplicates_detected": <local-entries-flipped-to-duplicate>,
  "errors": [<one-line-per-error>]
}
```

Print:

```
GitHub sync complete (<repo>)
  ↑ Pushed N new, updated M
  ↓ Pulled K issues — J teammate findings, L matched local
  ⇄ Dedup flipped D local entries to Duplicate (GitHub is canonical)
<if errors:>
  Errors:
    - <error 1>
```

## Conflict resolution defaults

- **Body content** — local wins on push. Reviewer edits inside `### Affected code` will be overwritten on re-push. Reviewer comments are never touched.
- **State (open/closed)** — remote wins. Updates the local finding's `github.state`. Surface in the dashboard so the auditor can decide whether to also reject the finding.
- **Comments** — pull-only. Hex never posts.

## Error handling

- Per-issue errors are isolated — log to `errors[]`, continue.
- Rate limit (403 with "rate limit" in output): print "Rate-limited — sync resumes after <ISO time>." Stop the current phase.
- Network failures: print the gh error and stop the current phase. Already-completed phases stay persisted.

## What this skill does NOT do

- Does not authenticate (use `gh auth login` once).
- Does not post comments (auditors discuss inside GitHub).
- Does not create labels (manual one-time setup; `gh issue create` errors if a label is missing).
- Does not delete remote issues.
- Does not push `rejected`, `unverified`, or `duplicate` findings.
