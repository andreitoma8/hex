---
description: 'Two-way sync between local Hex findings and GitHub Issues — pulls teammates issues into the dashboard and pushes verified findings out'
---

# Skill: Sync GitHub

**Recommended model:** Sonnet

This skill is the orchestrator for Hex's GitHub Issues integration. Hex itself never authenticates with GitHub — you (the auditor) authenticate once via `gh auth login`, and this skill drives the `gh` CLI via bash. A single invocation runs both directions: pull teammates' issues into the local dashboard, then push your verified findings out as issues.

## Context Assembly

Read these files before running:

- `<output_dir>/config.json` — needs `settings.github.repo` set. If missing, the skill prompts.
- `<output_dir>/findings.json` — local canonical findings.
- `<output_dir>/tracking.json` — for status (`verified` vs `pending_validation` vs `rejected`).
- `<output_dir>/external/github/findings.json` if it already exists — last pulled teammate findings (so the diff can be reported).

Output paths the skill writes:

- `<output_dir>/findings.json` (updated `github.*` blocks on local findings that have a GitHub issue).
- `<output_dir>/external/github/findings.json` (teammate findings in `AiResultFile` shape).
- `<output_dir>/external/github/sync-status.json` (`GithubSyncStatus` shape — counters + timestamp the dashboard reads).
- `<output_dir>/external/github/raw-issues.json` (optional debugging cache of the full gh JSON).

## Phase 0 — Preflight

**0a. Check `gh` is installed and authenticated.**

```bash
gh auth status
```

If exit code is non-zero, print:

```
gh CLI is not authenticated. Run `gh auth login` once on this machine, then re-run /sync-github.
```

…and stop. Do NOT prompt for a token. Hex never stores GitHub credentials.

If `gh` is not installed at all (`command -v gh` fails), print:

```
gh CLI is not installed. Install from https://cli.github.com/ (Windows: winget install GitHub.cli), then run `gh auth login`.
```

…and stop.

**0b. Resolve the audit repo.**

Read `config.json` → `settings.github.repo`. If missing or empty:

Use the **AskUserQuestion** tool:

```
Which GitHub repo should this audit publish findings to? (e.g. nethermind/audit-vaultx)
```

When the user replies, write the value back to `settings.github.repo` and persist `config.json`. If they provide an obviously invalid format (no `/`), re-prompt. Optionally also ask for `settings.github.default_labels` if you want non-defaults; otherwise use `["hex", "audit"]`.

**0c. Sanity-check the repo is reachable.**

```bash
gh repo view <repo> --json name,owner,viewerPermission
```

If `viewerPermission` is `READ` or null, warn the user:

```
You have read-only access to <repo>. The pull phase will work; the push phase will fail.
Continue with pull-only? (yes/no)
```

Use **AskUserQuestion** to confirm. Track `push_enabled = true|false` based on the answer.

## Phase 1 — Pull

**1a. Fetch all open + closed issues with the configured labels.**

Build the label filter from `settings.github.default_labels` (default `hex,audit`). Concatenate with commas — gh treats this as AND.

```bash
gh issue list \
  --repo <repo> \
  --label "hex" \
  --state all \
  --limit 1000 \
  --json number,title,body,labels,state,author,createdAt,updatedAt,url
```

Save the raw JSON to `<output_dir>/external/github/raw-issues.json` for debugging.

For each issue, also fetch its comments (the issue list response doesn't include them):

```bash
gh issue view <number> --repo <repo> --json comments
```

Batch these — for performance, only fetch comments for issues whose `updatedAt` is newer than the last sync's `last_synced_at` (read from `external/github/sync-status.json` if it exists). On first sync, fetch comments for everything.

**1b. Classify each issue.**

Scan each issue's `body` for the round-trip footer:

```
<!-- hex-finding-id: F<NNN> -->
```

The footer regex is exactly `<!--\s*hex-finding-id:\s*(F\d+)\s*-->`. Be tolerant of whitespace.

For each issue:

- **Footer present, finding ID matches an entry in local `findings.json`** → this is a known local finding. Update its `github` block:
  ```json
  {
    "issue_number": <num>,
    "issue_url": "<url>",
    "state": "<open|closed>",
    "last_synced_at": "<now ISO>",
    "sync_status": "in_sync",
    "comments": [
      { "author": "<login>", "body": "<text>", "created_at": "<iso>", "url": "<url>" }
    ]
  }
  ```
  Persist to `findings.json` via atomic write.

- **Footer present but no matching local finding** → an issue you pushed previously but the local file no longer has. Add a tracking entry in `tracking.json` with:
  ```json
  {
    "id": "F<NNN>",
    "title": "<issue title>",
    "severity": "<parsed from labels — severity:critical → Critical>",
    "source": "manual",
    "status": "pending_validation",
    "poc_status": "not_started",
    "poc_file": null,
    "duplicates": [],
    "notes": "Restored from GitHub issue #<num>: <url>"
  }
  ```
  Do NOT write to `findings.json` — the body content may have been edited by reviewers and we don't want to clobber local state. Surface the issue in the status report so the user can decide to restore it manually.

- **No footer** → a teammate's finding. Append to a `findings` array destined for `<output_dir>/external/github/findings.json`, normalised into the `AiResultFile` shape:
  ```json
  {
    "tool": "github",
    "ran_at": "<now ISO>",
    "total_findings": <count>,
    "findings": [
      {
        "id": "github-<issue_number>",
        "tool": "github",
        "title": "<issue title>",
        "severity": "<parsed from labels, default Medium>",
        "description": "<issue body without footer>",
        "affected_code": [<best-effort file refs extracted from body>],
        "confidence": "medium",
        "category": "<parsed from labels if present>",
        "raw_category": "github-issue"
      }
    ]
  }
  ```

After processing all issues, write the assembled `AiResultFile` to `external/github/findings.json` atomically.

Severity parsing: look at the issue's labels for one prefixed with `severity:`. Strip the prefix and title-case: `severity:critical` → `Critical`. If no severity label, default to `Medium`.

## Phase 2 — Push

Skip this phase if `push_enabled` is false (set in 0c).

**2a. Identify candidates.**

From local `findings.json`, select every finding whose corresponding tracking entry has a status in `settings.github.publish_status` (default `["verified"]`).

Filter further:

- If the finding already has a `github.issue_number` → candidate for `gh issue edit`.
- If no `github.issue_number` → candidate for `gh issue create`.

If there are zero candidates, log "Nothing to push." and proceed to Phase 3.

**2b. For each candidate, render the issue body.**

Issue title:

```
[<Severity>] <finding.title>
```

Issue body (write to a temp file, then `--body-file`):

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

The HTML comment footer at the very bottom is **the round-trip identity key**. Never omit it. Use the finding's actual ID verbatim (whatever the producer chose: `F001`, `VX-003`, etc.).

**2c. Build the label set.**

```
<default_labels…> severity:<lowercased severity> source:<finding.source or 'manual'> status:<tracking.status>
```

Apply via `--label` flags (one per label).

**2d. Create or update.**

If creating (no existing `issue_number`):

```bash
gh issue create \
  --repo <repo> \
  --title "<title>" \
  --body-file <tmpfile> \
  --label "hex" --label "audit" --label "severity:critical" --label "source:manual" --label "status:verified"
```

Parse the returned issue URL (format: `https://github.com/<owner>/<repo>/issues/<num>`) to extract the number. Update the local finding's `github` block:

```json
{
  "issue_number": <num>,
  "issue_url": "<url>",
  "state": "open",
  "last_synced_at": "<now>",
  "sync_status": "in_sync",
  "comments": []
}
```

If updating an existing issue:

```bash
gh issue edit <num> \
  --repo <repo> \
  --title "<title>" \
  --body-file <tmpfile> \
  --add-label "severity:critical" --add-label "status:verified"
  # Do NOT --remove-label, since teammates may have added labels we shouldn't strip.
```

If `gh` returns a non-zero exit code on push, capture stderr, set the finding's `github.sync_status` to `conflict`, append a single-line error to the in-memory error list, and continue with the next finding. Never abort the whole sync on one failure.

**2e. Persist updates.**

Write the updated `findings.json` atomically once, after every push (not per-finding) — minimises the dashboard watcher's churn.

## Phase 3 — Dedup

Invoke the existing `/compare-findings` skill (do NOT re-implement its logic). It picks up the new `external/github/findings.json` automatically because its Context Assembly already says "all files in `ai-results/`" — extend that mental model by passing the path explicitly:

> Run /compare-findings, but additionally include `external/github/findings.json` as a finding source. Treat the `tool` field `github` as a non-AI source so duplicates against it surface with `source: github` in the labels, not `source: ai`.

`/compare-findings` writes `comparison.json` with `match_signals` blocks. The dashboard already renders these in `/all-findings`'s expand row — no UI changes needed for the dedup display.

## Phase 4 — Status report

Build a `GithubSyncStatus` record and write it to `<output_dir>/external/github/sync-status.json`:

```json
{
  "repo": "<repo>",
  "last_synced_at": "<now ISO>",
  "pushed": <count of newly created issues>,
  "updated": <count of updated issues>,
  "pulled": <count of issues seen>,
  "teammate_findings": <count of footer-less issues>,
  "duplicates_detected": <count from comparison.json>,
  "errors": [<one line per push/pull error>]
}
```

Print to the user:

```
GitHub sync complete (<repo>)
  ↑ Pushed N new, updated M
  ↓ Pulled K issues — J teammate findings, L matched local
  ⇄ /compare-findings detected D duplicates
<if errors:>
  Errors:
    - <error 1>
```

Tell the user to open the dashboard (`/all-findings`) to see the merged view. The sidebar's "synced just now" indicator will reflect the new timestamp within a few seconds via the file watcher.

## Conflict resolution defaults

When the local finding and the remote issue disagree:

- **Body content** → local wins. The next push re-renders the issue body from `findings.json`. Reviewer additions inside `### Affected code` etc. will be overwritten. (Reviewer additions in COMMENTS are preserved — comments are never touched.)
- **State (open/closed)** → remote wins. If a reviewer closes the issue on GitHub, the local finding's `github.state` becomes `closed`, but no other local fields change. Surface this in `/all-findings` so the auditor can decide whether to also mark the finding as rejected.
- **Comments** → remote-only. Hex pulls comments for display in the dashboard; it never posts comments. Auditors discuss inside GitHub.

## Error handling rules

- **Per-issue errors are isolated** — one bad issue should not abort the sync. Log to the `errors[]` array in `sync-status.json` and keep going.
- **Rate limiting** — if `gh` exits with a 403 or output mentions "rate limit", read the `X-RateLimit-Reset` epoch from the response if available and print "Rate-limited — sync resumes after <ISO time>." Stop. Do not retry within the same skill invocation.
- **Network failures** — print the underlying gh error verbatim and stop the current phase. Already-completed phases (e.g. push completed but pull failed) are still persisted.

## What this skill does NOT do

- Does not authenticate. Auth is `gh auth login`, done once by the user, outside Hex.
- Does not post comments. Auditors discuss inside GitHub itself.
- Does not create labels. If a label doesn't exist in the target repo, `gh issue create` returns an error; surface it and prompt the user to create the labels manually (one-time setup).
- Does not delete remote issues. If a local finding is removed from `findings.json`, the GitHub issue stays open until a human closes it.
- Does not push rejected or unverified findings unless the user explicitly added that status to `settings.github.publish_status`.
