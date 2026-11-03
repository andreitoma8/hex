---
name: init-audit
description: 'Initialize a Solidity audit with Hex: dependency safety, exact compiler facts, then a team of agents that builds and verifies the protocol model (actors, assets, privileges, accounting, state machines, invariants), spec conformance and explanatory diagrams. Full or differential (base → head) audits.'
---

# Skill: Initialize Audit

You are the **orchestrator** of the pre-review. You gather inputs, run the safety gate and the deterministic layer yourself, then direct agents in four waves. By the end the dashboard shows a verified protocol model, proposed invariants, conformance cards and diagrams that explain the system.

Use `npx --no-install hex …` for every Hex command (an unrelated npm package is called `hex`; `--no-install` makes sure only Hex runs). When the Hex MCP tools are available (`hex_facts_query`, `hex_model_get`, …) you may use them instead; they do the same thing.

## How the agents work together

The topology follows one rule: **silo where independence is the point, share where integration is the point.**

- **Discovery is siloed.** Each contract reader sees only its own cluster plus the exact facts. Readers do not see each other's notes, so one reader's framing cannot anchor another's. The docs extractor reads documentation only and never code, so a gap between what the docs promise and what the code does shows up as a mismatch instead of being explained away.
- **Synthesis is shared.** One synthesizer reads every draft and the facts and writes one consistent model.
- **Verification is siloed again.** Skeptics get the claims and the code, but not the synthesizer's reasoning, so they check what the code does rather than whether the argument sounds right.
- **Diagrams are shared.** Composers draw from the verified model.

Agents never message each other. They communicate through files under `.hex/model/` (drafts, verdicts, specs), and they answer exact cross-contract questions ("who calls X?", "who writes Y?", "which entry points reach Z?") with `npx --no-install hex facts query …` instead of guessing or asking another agent.

Agent prompts are in `references/agents/` next to this file. Claude Code prints this skill's base directory when it loads the skill ("Base directory for this skill: …"); the references live under it. If no base directory was printed, Glob exactly `.claude/skills/init-audit/references/agents/*.md`. Spawn agents with the Agent tool as **background** calls, in **one message per wave**, and wait for every completion notification before starting the next wave. Never poll or sleep.

It runs in one of two modes, chosen in Phase 0:

- **Full**: audit the whole scope at one commit (the default).
- **Differential**: audit what changed between a previously audited **base** commit and the **head** commit, plus the flows those changes reach. Sections marked **(differential)** run only in this mode.

---

## Phase 0 — Inputs, safety gate, exact facts (orchestrator, sequential)

### 0.1 Gather information

Ask the auditor (one AskUserQuestion where possible):

- **Audit type**: *Full* or *Differential*. Ask this first; the rest branches on it.
- **Project directory** (default: current directory), **scope** globs (e.g. `src/**/*.sol`), **commit** (default `HEAD`), **chain** (default ethereum), **documentation URL** if any, and optionally the **GitHub repo** (`owner/repo`) findings sync to.
- **(differential)** The **base commit** (required), the **head commit** (default `HEAD`, which must be checked out; `git fetch --unshallow` first on a shallow clone), and an optional **previous audit**: the earlier engagement's `.hex/` folder or its report (PDF or Markdown). When a previous `.hex/` is given, propose its `project.scope_globs` (or `project.scope`) as the scope and its `project.commit` as the base, and confirm both.

### 0.2 Dependency safety (BEFORE anything compiles)

Build scripts and install hooks are a supply-chain vector. Check, before any `forge build`, `npm install` or compile:

1. `package.json` install hooks (`preinstall`, `postinstall`, `prepare`, `prebuild`, `pretest`) that shell out, download, or touch files outside the project.
2. Foundry `lib/` submodules: each `lib/*/foundry.toml` for `ffi = true`, broad `fs_permissions`, or `script` entries.
3. Root `foundry.toml`: `ffi = true` is **high risk**; `fs_permissions` broader than read-only on `./src`/`./out`; profile overrides that differ from the main profile.
4. `remappings.txt`: every target exists in `lib/`; flag shadowed or hijacking remaps (`@openzeppelin/=lib/malicious-oz/`).
5. Root-level `*.sh`, `*.py`, `Makefile` targets and `.github/` workflows.
6. Plaintext secrets in `.env*` (do not print the values).
7. `.vscode/extensions.json` recommending unknown publishers.

**If anything looks risky, STOP and warn before compiling.** Then evaluate Solidity dependencies: known libraries and versions with advisories (OZ < 4.9.3, old Solmate `SafeTransferLib`), typosquats (`@openzepplin`), unused dependencies, and unknown packages with inline assembly, `selfdestruct` or `delegatecall` to fixed addresses.

### 0.3 Initialize and build the deterministic layer

```bash
npx --no-install hex init --project "<path>" --scope "<globs>" --commit <hash> --chain <chain> --docs "<url>" [--github-repo <owner/repo>] \
  [--mode diff --base <base-commit> [--previous-audit "<path>"]]
npx --no-install hex analyze
```

`hex analyze` compiles into `.hex/.cache` (never the client's `out/`) and writes:

- `.hex/facts.json`: exact compiler facts (call graph with `internal`/`super`/`library`/`external`/`virtual`/`modifier` edges, reads/writes per function, inheritance linearization, entry points, compiler storage layouts);
- `.hex/stats.json`: nSLOC, ERC usage, coverage;
- **(differential)** `.hex/diff.json` and `.hex/diff/changes.patch`: changed entities, slot-exact storage-layout changes, and impacted functions with reason chains.

Read the first lines of `facts.json`. If `"source": "parser-fallback"`, the build failed: tell the auditor that facts are approximate (calls resolved by name, layout without packing) and how to fix the build, then continue.

**(differential)** If `diff` failed (usually a commit missing from a shallow clone), stop: a differential audit without the diff is a full audit under the wrong label.

### 0.4 Plan the waves

From `facts.json` and `stats.json`, group the in-scope contracts into **clusters** of roughly 800–1500 nSLOC. Contracts that inherit from each other or call each other heavily belong together (use `linearization`, and `calls` edges between contracts). One reader per cluster; a small codebase may be a single cluster. Write the plan as a short list for the auditor (cluster → contracts → nSLOC) and continue without waiting.

**(differential)** Readers cover only clusters that contain changed or impacted functions (`npx --no-install hex diff --scan-files` lists the files); each reader also gets `.hex/diff/changes.patch`.

`mkdir -p .hex/model/drafts .hex/model/verdicts .hex/model/diagrams`

---

## Phase 1 — Discovery (siloed, parallel)

Spawn in **one message**:

| Agent | Prompt file | Count | Writes |
|---|---|---|---|
| Contract reader | `references/agents/contract-reader.md` | one per cluster | `.hex/model/drafts/reader-<n>.json` |
| Docs extractor | `references/agents/docs-extractor.md` | one, only when there is documentation (URL, `docs/`, README with protocol text) | `.hex/model/drafts/docs-claims.json` |
| Standards checker | `references/agents/standards-checker.md` | one, only when `stats.json` lists ERCs/EIPs or contracts implement known interfaces | `.hex/model/drafts/standards.json` |
| **(differential)** Prior-audit importer | `references/agents/prior-audit.md` | one, only with a previous audit | `.hex/previous-audit/findings.json` |

Substitute the placeholders each prompt file declares (cluster contracts and files, output path, docs URL, previous-audit path). Do not paste source code into prompts; agents read files themselves.

## Phase 2 — Synthesis (shared)

Spawn **one** synthesizer (`references/agents/synthesizer.md`). It reads every draft plus the facts and writes:

- `.hex/model/protocol.json` (schema in its prompt; every claim has a `claim_id` and evidence),
- `.hex/model/invariants.json` (all `status: "proposed"`),
- `.hex/overview.md` (2–3 paragraphs + key contracts table; the report's System Overview is built from it),
- **(differential)** `.hex/diff-overview.md`.

When it finishes, run `npx --no-install hex model validate`. Every function id the model cites must exist in the facts. If validation fails, send the errors back to the synthesizer (SendMessage to the same agent) and re-validate. Do not hand-edit the model.

## Phase 3 — Verification (siloed, parallel)

On a re-run, first move the previous conformance results aside so the checker works fresh but can keep ids stable (cards cite them as `source_ref`): `mv .hex/spec-conformance.json .hex/model/drafts/spec-conformance.prev.json` (skip if absent).

Spawn in **one message**:

| Agent | Prompt file | Count | Writes |
|---|---|---|---|
| Skeptic | `references/agents/skeptic.md` | one per section group: (actors + privileges + trust), (assets + external dependencies), (accounting), (state machines + risky flows), (invariants) — skip empty groups | `.hex/model/verdicts/<group>.json` |
| Conformance checker | `references/agents/conformance-checker.md` | one, when Phase 1 produced docs claims or standards checks | `.hex/spec-conformance.json` + `.md` |
| **(differential)** Regression checker | `references/agents/regression-checker.md` | one, when prior findings were imported | `.hex/previous-audit/review.json` |

Each skeptic gets **only** its claims (the JSON array for its sections, extracted from `protocol.json` without any prose) and the code. Then:

```bash
npx --no-install hex model apply-verdicts
```

It marks each claim `verified` or `contested` (any contesting skeptic wins), and records verdicts on invariant ids on the invariant itself (`verification`). Contested claims and invariants stay with the skeptic's note; the dashboard shows them, so the auditor sees where the system is not what it seems before accepting anything. Leads that skeptics raise go to the contract notes with `npx --no-install hex note lead <Contract> --text "<…>" --source init-audit --source-ref skeptic-<group>-<claim_id>`; skip leads that repeat one already in `npx --no-install hex note show <Contract>` (skeptics work in silos, so they often rediscover the same bug).

## Phase 4 — Diagrams (shared, parallel)

Spawn one diagram composer per view that has material in the verified model (`references/agents/diagram-composer.md`, with `{view}` set to `custody`, `privilege`, `accounting`, `state-machine` or `sequence`). In **one message**. Each writes `.hex/model/diagrams/<name>.spec.json`. Then:

```bash
npx --no-install hex diagram build
```

If a spec is invalid, send the error to its composer and rebuild. **(differential)** Composers draw the impacted flows and changed state; `hex diagram build` highlights changed functions automatically.

## Phase 5 — Cards, summary, dashboard (orchestrator)

1. **Conformance cards.** For every item in `spec-conformance.json` with status `DEVIATES` or `PARTIAL`, unless a tracking entry already has that `source_ref`:
   ```bash
   npx --no-install hex issue new --source conformance --source-ref "<SC-NNN>" --title "<first sentence of finding, ~80 chars, plain text without backticks>" --severity "<severity_hint or Info>"
   ```
   Then run `npx --no-install hex issue dedup <new id>` and apply its match rules. A conformance item often restates a finding the auditor already filed (a deviation from ERC-4626 is also a manual "first-depositor inflation" card); when it matches, `npx --no-install hex issue mark-duplicate <new id> --of <existing id> --root-cause <same|overlapping> --attack-vector <same|overlapping|different> [--same-contract] [--same-function] --reasoning "<one sentence>" --confidence <level>`, so the existing card (GitHub-synced cards first) stays canonical.
2. **(differential) Regression cards.** For every `regressed` item in `previous-audit/review.json` (skip ids that already have a `prior-audit` tracking entry), create `npx --no-install hex issue new --source prior-audit --source-ref "<prior id>" --title "<title>" --severity <Severity>`, record the returned id as the item's `issue_id`, and rewrite the card's description for the head code with `npx --no-install hex issue patch <id> --description-file …`.
3. **Summary.** Scope (files, contracts, nSLOC); facts source; model size and how many claims were contested (name the contested ones in one line each, since they are the most valuable output); proposed invariants (`npx --no-install hex invariant list`), with a reminder to accept the ones that hold (`npx --no-install hex invariant accept INV-…` or on the dashboard's Model page); conformance cards created; diagrams built; **(differential)** base → head, files changed, impacted entry points, storage-layout changes, and the prior-findings tally. Suggest next steps: `/ai-audit` (in a differential audit it scans only changed and impacted code), `/fuzz` once invariants are accepted, and the Review page's blind spots.
4. **Dashboard.** Launch it in the background (`run_in_background: true`):
   ```bash
   npx --no-install hex dashboard --project "<absolute project dir>"
   ```
   and print one line: `Dashboard starting at http://localhost:3000`.

## Writing standard (applies to every agent's prose)

Everything written to `.hex/` may reach a client report. Plain, specific, technical prose. Backtick identifiers (`deposit(...)`, `totalAssets`). No em dashes, no filler, no speculation in the overview. Claims cite evidence as `file` + line range; the evidence is for navigation and never appears as "line N" in report prose.
