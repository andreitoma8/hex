# Upstream

`/ai-audit` is a fork of **pashov's `solidity-auditor` skill**, version 4.1:

- Repository: https://github.com/pashov/skills (`solidity-auditor/`)
- Commit: `92b0ea6786e6c210bc9a839e4813d50876c1c550` (2026-10-05, "solidity-auditor: bump VERSION to 4.1")
- License: MIT (see `LICENSE` in this directory, copied from the upstream repository)

The 12 hacking agents, the SOP, the judging gates, the report language rules, the dedup and
assembly procedure, and `assemble.sh` are upstream's work. Hex keeps them as close to upstream's
wording as possible so a future upstream release can be merged by re-applying the changes below.

## Hex changes

Mechanical (re-apply with sed after pulling a new upstream version):

| Upstream | Hex |
|---|---|
| `.solidity-auditor/` (runs, ledger) | `.hex/ai-audit/` |
| `#solidity-auditor-memory v1` (ledger header) | `#hex-ai-audit-memory v1` |
| `{project-name}-pashov-ai-audit-report-{stamp}.md` | `{project-name}-hex-ai-audit-report-{stamp}.md` |
| `# Run K — solidity-auditor` | `# Run K — ai-audit` |
| disclaimer's pashov.com consultation sentence | removed |
| `mktemp -d ./.audit-XXXXXX` | `mkdir -p .hex/ai-audit && mktemp -d .hex/ai-audit/tmp-XXXXXX` |

By hand:

- `SKILL.md` — `name: ai-audit` and a Hex description; a "Hex fork" note; Mode Selection gains
  `hex-scope` (files from `.hex/config.json` → `project.scope`) and `diff` (changed + impacted
  files from `npx --no-install hex diff --scan-files`), with upstream's `find` kept as the fallback outside a
  Hex project; Turn 1 resolves `{resolved_path}` from the skill's base directory (never a
  `**/references/...` Glob, which matches other copies of this skill) and drops the `VERSION`
  check against pashov/skills; Turn 2 step 1b writes `diff-focus.md` via `npx --no-install hex diff --focus`
  and the bundle table appends it in a differential audit; the prune does not run in `diff`
  mode; **Turn 6** publishes to the Hex board; a one-line Hex banner replaces the ASCII banner.
- `SKILL.md` Turn 2 step 1c — accepted invariants (`hex invariant export`) and triage rules
  (`hex rules list`) are appended to every bundle when the Hex project has them.
- `references/agent-prompts.md` — a "differential audit" paragraph in both prompt templates,
  included only when `diff-focus.md` is appended.
- `references/dedup-and-assembly.md` — Turn 4 step 5a: the `key` is built on every scan (memory
  on or off), since Turn 6 keeps the board idempotent on it.
- `references/assemble.sh` — one added line persists the cross-run winners as
  `{dir}/winners.tsv` before the work dir is deleted. The report it writes is unchanged apart
  from the disclaimer.
- New: `references/hex-export.sh` (winners → `hex-digest.md`) and `references/hex-board.md`
  (Turn 6: digest → raw records → `hex issue new` cards; triage-rule exclusions; dedup through
  the shared `hex issue dedup` / `mark-duplicate` engine; leads → `hex note lead`; then
  `/prevalidate` on the new cards).
- Every Hex command is `npx --no-install hex …` (an unrelated npm package is named `hex`).
- Removed: upstream `README.md` and `VERSION` (Hex ships the skill inside `hex-audit`; use
  `npx --no-install hex update`).
