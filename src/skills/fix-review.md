---
description: 'Fix review: map the client''s fix commits to findings, re-run each PoC at the fix commit, review unmapped changes, then update Status and "Update from the client" on GitHub after one confirmation'
---

# Skill: Fix Review

After the client fixes the reported issues, decide for each one whether it is fixed, and review any code the fixes changed that no finding explains. Evidence first: a PoC that reproduced the issue at the audited commit and **fails** at the fix commit is the strongest proof of a fix.

Use `npx --no-install hex …` for every Hex command.

## Step 1 — Inputs

Ask for the **fix commit** (default `HEAD`; it must exist locally, so `git fetch` first) and confirm the **audited commit** (default: `settings.report.initial_commit`, else `project.commit` in `.hex/config.json`). If the audit's cards are synced to GitHub, `settings.github.repo` must be set.

## Step 2 — Deterministic pass

```bash
npx --no-install hex fix-review --from <audited> --to <fix>
```

It diffs the two commits on compiler facts (exact changed functions and storage layout) and maps changes and commit messages (`H-012`, `#12`) to every Verified or Synced card. It re-runs each card's PoC (`test/hex-pocs/…`) at the fix commit in a throwaway worktree, then writes `.hex/fix-review/<fix-sha>.json`, with per card `status` (`fixed` / `not_fixed` / `unknown` / `unaddressed`), evidence, PoC before/after, the changed functions and commits, plus `unmapped_changes`.

## Step 3 — Judgement where the evidence is not conclusive

For every card with status `unknown`, and every `fixed` card whose evidence is "code removed", spawn a background agent (one per card, up to 6 at a time) with:

> Card **{id}** (`npx --no-install hex issue show {id}`) was reported at {audited}. Decide whether commit range {audited}..{fix} fixes it. Read the original finding and the diff of the functions it touches (`git diff {audited} {fix} -- <files>`). If a PoC exists but no longer compiles, adapt it minimally to the new API and run it at the fix commit in a scratch worktree, not in the auditor's checkout. Decide: `fixed`, `partially_fixed` (say what remains) or `not_fixed`. Draft the "Update from the client" text: what changed, in which commit, and why that resolves (or does not resolve) the issue, in two sentences at most, plain prose, no line numbers. Then run:
> `npx --no-install hex fix-review propose {fix} {id} --status <status> --resolution <Fixed|Mitigated|Acknowledged|Not Fixed|Unresolved> --update-file <file> --evidence "<one sentence>"`

For `fixed` cards with a failing PoC, write the update text yourself (one sentence naming the commit) and `propose` it. For `unaddressed` cards, ask the auditor whether the client acknowledged them; if so, propose `Acknowledged` with the client's reason.

## Step 4 — Unmapped changes

Every entry in `unmapped_changes` is code the fixes changed that no finding explains: a new attack surface until reviewed. Review each one, differential-audit style (the function, its callers via `npx --no-install hex facts query callers <ref>`, the entry points that reach it). For anything risky, file a new card with `/write-finding`. Offer `/ai-audit` restricted to these files when there are many.

Record each verdict, so the dashboard's Changes page shows it as reviewed:

```bash
npx --no-install hex fix-review reviewed <fix> <Contract.function> --note "<one or two sentences; name the card if you filed one>"
```

## Step 5 — One confirmation, then GitHub

Show the whole batch as a table: card · GitHub issue · proposed Status · Update text. Then ask once:

> Apply these N updates to GitHub issues in `<repo>`? (Only the **Status** and **Update from the client** fields of each issue change.)

Only after an explicit yes:

```bash
npx --no-install hex fix-review apply <fix-sha>
```

It rewrites just those two fields in each issue body and leaves every other byte alone. `--dry-run` prints the new bodies without editing. Then run `/sync-issues` so the local cards pull the new state, and record the fix commit as the report's final commit in `.hex/config.json` → `settings.report.final_commit`.

## Step 6 — Summary

Fixed / partially fixed / not fixed / acknowledged counts, the unmapped changes and what came of them, and the next step (`/generate-report` for the final report).
