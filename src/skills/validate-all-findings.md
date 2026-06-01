---
description: "Walk every Potential issue on the board and validate them one by one (interactive)"
---

# Skill: Validate All Findings

**Recommended model:** Opus

Runs `/validate-issue` over every issue currently in the **Potential** column, one at a time, so the auditor can clear the backlog in a single pass without naming each id.

## Step 1 — Build the work list

Read `<output_dir>/tracking.json`. The Potential column is every entry whose `status` is `pending_validation` or `unverified`. Collect their ids in a stable order: severity (Critical → High → Medium → Low → Info), then id. Call this list `POTENTIAL` with size `N`.

If `N` is 0, report "No Potential issues to validate." and stop.

## Step 2 — Loop

For each issue `i` of `N` (1-based), print a header:

```
── Validating i/N: <id> [<severity>] <title> ──
```

Then run the full **`/validate-issue`** flow for that `<id>` exactly as that skill defines it:
1. Assemble context (the tracking entry + its source record + the affected source).
2. Trace the claim in the code.
3. Reach a verdict:
   - **Valid** → ask PoC-vs-memo (AskUserQuestion), write the validation memo, optionally generate the PoC, then `hex issue patch <id> ...` + `hex issue move <id> --to verified`; offer the severity-adjustment prompt.
   - **Invalid** → `hex issue move <id> --to invalid`, memo records why.
   - **Uncertain** → leave in place, `hex issue patch <id> --notes "<open questions>"`.

Do not batch or skip the interactive prompts — this skill is the same per-issue UX as `/validate-issue`, just iterated. The auditor stays in control of each verdict.

## Step 3 — Resume safety

Re-fetch the entry's current status before validating it (an earlier loop iteration, or a previous run, may have already moved it). Skip any id that is no longer in the Potential column and note it: `Skipping <id> (already <status>)`. This makes the skill safe to re-run after an interruption.

## Step 4 — Summary

After the loop, print a tally:

```
Validated N Potential issues:
  → Verified: V
  → Invalid:  X
  → Left for review (uncertain): U
```

Remind the auditor of the next steps: `/sync-issues` to push the Verified findings to GitHub, then `/generate-overleaf` for the report.
