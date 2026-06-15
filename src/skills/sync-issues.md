---
description: 'Two-way sync between local Hex findings and GitHub Issues — GitHub is the source of truth; identity is the issue number'
---

# Skill: Sync Issues

**Recommended model:** Sonnet

Hex's GitHub Issues integration. Hex never authenticates with GitHub — you authenticate once via `gh auth login` and this skill drives the `gh` CLI. One invocation runs both directions.

## The model: GitHub is the source of truth, identity is the issue number

Once an issue is on GitHub it is **read-only in Hex** (status `synced`, locked on the board). Edits — severity, description, recommendation, status — happen on GitHub; this skill pulls them back into the local finding. `/generate-overleaf` reports **only** from synced issues.

**Identity is the GitHub issue number `#N`.** There is no hidden footer in the issue body (auditors create issues by hand, so a footer can't be relied on). Reconciliation matches a local finding to the issue number it has stored in `github.issue_number`. The body is exactly the five-field template, nothing hidden.

All board mutations go through `hex issue` — never hand-edit `tracking.json` / `findings.json`.

## Context

- `<output_dir>/config.json` — needs `settings.github.repo`.
- `<output_dir>/findings.json` — local findings (some already carry a `github.issue_number`).
- `<output_dir>/tracking.json` — status (`verified` are push candidates).

## Phase 0 — Preflight

**0a.** `gh auth status`. If non-zero, print "gh CLI is not authenticated. Run `gh auth login` once, then re-run /sync-issues." and stop. If `gh` is missing, point to `https://cli.github.com/`.

**0b.** Resolve `settings.github.repo`. If missing, **AskUserQuestion** for `owner/repo`, validate the shape, persist to `config.json`.

**0c.** `gh repo view <repo> --json viewerPermission`. If `READ`/null, **AskUserQuestion**: "Read-only access — push will fail. Continue pull-only? (yes/no)". Track `push_enabled`.

**0d. Fetch the repo's existing labels** — Hex stamps issues it creates, but **never creates a label**, so it can only use labels that already exist:

```bash
gh label list --repo <repo> --json name --jq '.[].name'
```

Keep the result as the set `EXISTING`. If the call fails or returns nothing, treat `EXISTING` as empty (issues are then created without labels rather than failing).

## Phase 1 — Pull (all issues, GitHub → local)

**1a. Fetch every issue — no label filter.** Audit repos contain only audit findings, so pull them all:

```bash
gh issue list --repo <repo> --state all --limit 1000 \
  --json number,title,body,state,author,createdAt,updatedAt,url
```

**1b. Parse each issue.** Title is `[Severity] Title`. Body is the five-field template:

```markdown
**File(s)**: [`<file>`](<url>)

**Description**: <text>

**Recommendation(s)**: <text>

**Status**: <Fixed|Mitigated|Acknowledged|Not Fixed|Unresolved>

**Update from the client**: <text>
```

Extract severity from the title, and the four body fields. If a body is **blatantly malformed** (no `**Description**:` marker), warn (`Skipping #N: not in the Hex finding format`) and skip it — do not fail the whole sync. Otherwise treat it as a valid finding (most will be).

**1c. Reconcile by issue number `#N`:**
- **A local finding already records `github.issue_number === N`** → it's the same issue; pull GitHub's content into it:
  ```bash
  npx hex issue sync-set <local-H-id> --issue-number N --issue-url <url> --state <open|closed> \
    --title "<title-without-[Severity]>" --severity <Severity> \
    --description-file /tmp/N_desc.md --recommendation-file /tmp/N_reco.md \
    --resolution "<Status>" --update-from-client-file /tmp/N_update.md
  ```
- **No local finding has `#N`** (a teammate's hand-added issue, or one created outside Hex) → create a local finding for it, then sync-set:
  ```bash
  ID=$(npx hex issue new --source github --source-ref N --title "<title>" --severity <Severity>)
  npx hex issue sync-set "$ID" --issue-number N --issue-url <url> --state <open|closed> \
    --description-file /tmp/N_desc.md --recommendation-file /tmp/N_reco.md \
    --resolution "<Status>" --update-from-client-file /tmp/N_update.md
  ```

Either way the card lands in the **Synced** column, locked. Reconcile strictly by `#N`; never scan the body for an identifier.

## Phase 1.5 — Dedup before push (GitHub is canonical)

Before pushing, guard against filing a finding that is already on GitHub (e.g. a teammate created it by hand, and you pulled it into Synced in Phase 1). For each **verified** local finding that has no `github.issue_number` yet, semantically compare it against every **synced** finding on these axes:

| Signal | Compare |
|---|---|
| **contract** (boolean) | affected contract name |
| **function** (boolean) | affected function name |
| **root_cause** (`same`/`overlapping`/`different`) | the technical mechanism |
| **attack_vector** (`same`/`overlapping`/`different`) | what an attacker actually does |

A match is at least one of: `root_cause = same` AND `function = true`; or `root_cause = same` AND `contract = true` AND `attack_vector = same`; or `root_cause = overlapping` AND `function = true` AND `attack_vector = same`.

On match — the synced (on-GitHub) finding is canonical, so the local verified copy becomes the duplicate. Do **not** push it:

```bash
npx hex issue move <verified-H-id> --to duplicate --duplicate-of <synced-H-id>
```

Then append to `<output_dir>/comparison.json` under `duplicates` (the board renders the chip + signals from this):

```json
{ "ai_finding": "<verified-H-id>", "matches": "<synced-H-id>", "confidence": "high|medium|low",
  "match_signals": { "contract": true, "function": true, "root_cause": "same", "attack_vector": "same" },
  "reasoning": "<one sentence>" }
```

If `comparison.json` doesn't exist, create it with `{ "duplicates": [], "novel": [], "rejected": [] }`.

## Phase 2 — Push (verified local findings → GitHub)

Skip if `push_enabled` is false.

Candidates: findings whose tracking status is in `settings.github.publish_status` (default `["verified"]`) **and** which have no `github.issue_number` yet, **and** which Phase 1.5 did not flag as duplicates. (Synced findings are already on GitHub; duplicates/rejected/unverified are never pushed.)

For each candidate, render the body with the exact five-field template (see Phase 1b — `dashboard/lib/finding-markdown.ts::findingToGithubBody` is the canonical renderer). Write it to a temp file. **No body footer.**

**Labels (creation only).** Stamp each newly-created issue with the standard finding labels, keeping **only those present in `EXISTING`** (Hex never creates a label):

- `Draft`
- `Finding`
- `Severity: <Severity>` — the finding's severity verbatim (`Critical` / `High` / `Medium` / `Low` / `Info`).
- `Status: Unresolved` — new findings start Unresolved.

Drop any of these four that aren't in `EXISTING`, then pass the survivors as repeated `--label` flags:

```bash
gh issue create --repo <repo> --title "[<Severity>] <title>" --body-file <tmp> \
  --label "Draft" --label "Finding" --label "Severity: <Severity>" --label "Status: Unresolved"
```

Stamp labels **only at creation** — never edit labels on an issue that already exists, and never create a new label.

Parse the returned URL for `#N`, then lock it into Synced and record the number:

```bash
npx hex issue sync-set <H-id> --issue-number N --issue-url <url> --state open
```

From now on the finding is identified by `#N`; the next pull matches it by number, so it never duplicates.

If a single `gh` call fails, log the error and continue with the next candidate — never abort the whole sync.

## Phase 3 — Status report

Print:

```
GitHub sync complete (<repo>)
  ↓ Pulled K issues (S synced into the board, M skipped as malformed)
  ↑ Pushed P verified findings as new issues
  Errors: <n>
```

## Conflict resolution

- **Field content** — GitHub wins for synced issues. Every pull overwrites the local finding's title/severity/description/recommendation/status/update from the issue.
- **State (open/closed)** — from GitHub, stored on `github.state`.
- **Comments** — Hex never reads or posts comments.

## Error handling

- Per-issue errors are isolated — log and continue.
- Rate limit (403 / "rate limit"): print "Rate-limited — try again later." and stop the current phase.
- Network failures: print the `gh` error and stop the current phase; completed work stays persisted.

## What this skill does NOT do

- Authenticate (use `gh auth login`).
- Post or read comments.
- Create a new label, or touch labels on issues that already exist. (Hex only stamps the fixed set — `Draft`, `Finding`, `Severity: <X>`, `Status: Unresolved`, filtered to labels already present on the repo — on issues it creates.)
- Embed any hidden footer or marker in the issue body.
- Delete remote issues.
- Push `rejected`, `unverified`, `duplicate`, or already-`synced` findings.
