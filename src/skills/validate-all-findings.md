---
description: "Walk every Potential issue on the board and validate them one by one (interactive)"
---

# Skill: Validate All Findings

**Recommended model:** Opus

Runs `/validate-finding` over every issue currently in the **Potential** column, one at a time, so the auditor can clear the backlog in a single pass without naming each id.

Each issue gets `/validate-finding`'s full two-axis verdict — correctness **and** the Step-2.5 security-relevance gate. **`auditagent` / `github` findings skew recall-over-precision, so the realism gate is mandatory for them**; `manual` / `conformance` items already passed an auditor's eye and can lean lighter.

## Step 1 — Build the work list

Read `<output_dir>/tracking.json`. The Potential column is every entry whose `status` is `pending_validation` or `unverified`. Collect their ids in a stable order: severity (Critical → High → Medium → Low → Info), then id. Call this list `POTENTIAL` with size `N`.

If `N` is 0, report "No Potential issues to validate." and stop.

## Step 1.5 — Cheap realism pre-pass

Before deep-diving, do a fast first pass over all `N` and emit a one-line realism read per issue — the Step-2.5 reality-gate take only, no full code trace yet:

```
<id> [<sev>] <title> — likely: security | by-design | self-inflicted | incorrect | unsure
```

Print it as a table. This front-loads "which of these even deserve a deep trace" so effort concentrates on the genuine security candidates instead of spreading evenly. It's a triage hint, not a verdict — every issue still gets its real verdict in Step 2.

## Step 2 — Loop

For each issue `i` of `N` (1-based), print a header:

```
── Validating i/N: <id> [<severity>] <title> ──
```

Then run the full **`/validate-finding`** flow for that `<id>` exactly as that skill defines it:
1. Assemble context (the tracking entry + its source record + the affected source).
2. Trace the claim in the code.
3. Reach a verdict (correctness + the Step-2.5 security-relevance gate):
   - **Verified** (true + security-relevant) → re-rate severity, ask PoC-vs-memo, write the memo, `hex issue patch <id> ...` + `hex issue move <id> --to verified`.
   - **Rejected — by-design** (true, not security-relevant) → memo with `Disposition: by-design`, `hex issue patch <id> --resolution Acknowledged` + `hex issue move <id> --to rejected`.
   - **Rejected — incorrect** (false) → `hex issue move <id> --to rejected` (no resolution), memo records why.
   - **Uncertain** → leave in place, `hex issue patch <id> --notes "<open questions>"`.

Batch by tier — don't rubber-stamp. **Security-relevant candidates get the full per-issue prompt flow** (PoC-vs-memo and severity), one at a time — the auditor stays in control of every real finding. **Info / by-design / self-inflicted items may be batched**: collect them and confirm their dispositions (and any PoC/severity calls) in a single consolidated **AskUserQuestion** instead of N separate modals. That keeps a large sweep controllable without diluting scrutiny on the findings that matter.

## Step 3 — Resume safety

Re-fetch the entry's current status before validating it (an earlier loop iteration, or a previous run, may have already moved it). Skip any id that is no longer in the Potential column and note it: `Skipping <id> (already <status>)`. This makes the skill safe to re-run after an interruption.

## Step 4 — Summary

After the loop, print a tally:

```
Validated N Potential issues:
  → Verified:                       V
  → Rejected (incorrect):           X
  → Rejected (valid, not security): B
  → Left for review (uncertain):    U
```

Remind the auditor of the next steps: `/sync-issues` to push the Verified findings to GitHub, then `/generate-overleaf` for the report.
