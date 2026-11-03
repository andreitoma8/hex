---
description: 'Initialize a Solidity audit project: deterministic analysis + protocol overview + system diagram + flow charts + spec conformance, all in one run'
---

# Skill: Initialize Audit

**Recommended model:** Opus (this skill performs all reasoning-heavy pre-review work; switch to Opus before invoking)

You are setting up a new Solidity audit project with Hex. This single skill replaces the old chain of `/init-audit` → `/generate-overview` → `/generate-diagram` → `/generate-flows` → `/check-spec-conformance`. By the time it finishes, every analysis page on the dashboard has data and every DEVIATES/PARTIAL spec item has been materialized as a Potential card on the issue board.

It runs in one of two modes, chosen in Phase 1:

- **Full** — audit the whole scope at one commit (the default).
- **Differential** — audit what changed between a previously audited **base** commit and the **head** commit, plus the flows those changes reach. Hex computes the change set and the impact deterministically (`hex diff` → `.hex/diff.json`); every phase below then narrows to it. Sections marked **(differential)** run only in this mode.

## Prerequisites

- The auditor has cloned or received the client project.
- Node.js and npm are installed.
- Hex CLI is installed (`npm install -g hex-audit`).

## Phase 1 — Config + dependency safety

### 1.1 Gather information

Ask the auditor for:

- **Audit type** — *Full* or *Differential*. Ask this first; the rest branches on it.
- **Project directory path** — where the client project lives (default: current directory).
- **Scope** — glob or explicit list of files in audit scope (e.g., `src/core/**/*.sol`).
- **Commit hash** — the specific commit being audited (default: HEAD).
- **Chain** — target chain (default: ethereum).
- **Documentation URL** — if available.
- **GitHub repo** (optional) — the `owner/repo` the audit's findings sync to (e.g. `nethermind/audit-vaultx`). Pass it to `hex init --github-repo` so `/sync-issues` and `/generate-report` work later. Leave blank if the engagement isn't using GitHub.

**(differential)** Also ask for:

- **Base commit** (required) — the commit the previous audit covered.
- **Head commit** — the commit audited now (default: `HEAD`). It must be **checked out**: Hex's analyses read the working tree, while `hex diff` reads both commits from git. If the clone is shallow, `git fetch --unshallow` first.
- **Previous audit** (optional) — the earlier engagement's `.hex/` folder, or its report (PDF or Markdown). Its findings become known issues, and the ones the change touches get a regression check (Phase 5b).

When a previous `.hex/` folder is given, propose its `config.json` → `project.scope_globs` (or `project.scope`) as the scope and its `project.commit` as the base commit, and confirm both with the auditor.

### 1.2 Audit dependencies (BEFORE compiling)

Build scripts and `npm install` hooks are a primary supply-chain attack vector. Check these **before** running `forge build`, `npm install`, or any compilation command:

1. **`package.json` install hooks** — `preinstall`, `postinstall`, `prepare`, `prebuild`, `pretest` scripts that shell out, download from URLs, or touch files outside the project. Cross-reference with npmjs.com advisories.
2. **Foundry `lib/` submodules** — inspect each `lib/*/foundry.toml` for `ffi = true`, broad `fs_permissions`, or `script` entries.
3. **Root `foundry.toml`**:
   - `ffi = true` → **HIGH RISK** (arbitrary system commands during build/test).
   - `fs_permissions` broader than read-only on `./src` or `./out` → flag.
   - Profile overrides differing from main profile → flag.
4. **`remappings.txt`** — verify each target exists in `lib/`; flag shadowed paths, mismatched paths, or hijack vectors (a remap of `@openzeppelin/=lib/malicious-oz/`).
5. **Suspicious files** — root-level `*.sh`, `*.py`, `Makefile` targets, `.github/` workflows.
6. **Plaintext secrets** in `.env*` files (private keys, mnemonics, API keys). Do NOT log the values.
7. **`.vscode/extensions.json`** — flag extension recommendations from unknown publishers.

**If any build-time threats are found: STOP and warn before compilation.**

After build safety passes, evaluate Solidity dependencies:

- Identify well-known libs (OpenZeppelin, Solmate, Solady, PRBMath). Flag outdated versions with known advisories (OZ < 4.9.3, Solmate `SafeTransferLib` missing code-size check, etc.).
- Flag typosquats (`@openzepplin` vs `@openzeppelin`).
- Flag unused dependencies (in `lib/` or `node_modules/` but not imported by scope files).
- Spot-check unknown packages for inline assembly, `selfdestruct`, `delegatecall` to hardcoded addresses.

### 1.3 Initialize and analyze

Run:

```bash
npx hex init --project "<path>" --scope "<scope>" --commit <hash> --chain <chain> --docs "<url>" [--github-repo <owner/repo>] \
  [--mode diff --base <base-commit> [--previous-audit "<path>"]]
npx hex analyze
```

Include `--github-repo` only if the auditor gave one. Include the `--mode diff ...` part only for a differential audit.

`hex analyze` runs stats → deps → access → state → calls → patterns → constraints in parallel, then `surface` last. If a tool is missing (Slither, forge), the corresponding analysis is skipped — note the limitation and move on.

**(differential)** `hex analyze` then runs `diff`, which writes:

- `.hex/diff.json` — changed files; changed entities (functions, modifiers, state variables, events, errors, structs, inheritance) as `added` / `modified` / `removed` / `comments_only`; `storage_layout_changes`; and `impacted` — every function the change reaches, with `depth`, `is_entry_point`, a `reasons` chain (`changed`, `calls`, `modifier`, `reads_state`, `override`, `inherits`) and a confidence.
- `.hex/diff/changes.patch` — the in-scope unified diff.

The analyses (stats, access, state, ...) still cover the whole scope at head: impacted flows run through unchanged code, and you need it as context. If `diff` failed (usually a commit missing from a shallow clone), stop and tell the auditor how to fetch it. A differential audit without the diff is a full audit under the wrong label.

### 1.4 Import prior findings (differential, previous audit given)

Normalize the previous audit's findings into `.hex/previous-audit/findings.json`:

```json
{
  "imported_at": "<ISO-8601>",
  "base_commit": "<base commit>",
  "source_path": "<the path the auditor gave>",
  "findings": [
    {
      "id": "<the prior report's own id, e.g. M-02 or H-007>",
      "title": "...",
      "severity": "Critical | High | Medium | Low | Info",
      "resolution": "Fixed | Mitigated | Acknowledged | Not Fixed | Unresolved (as the prior report states it)",
      "status": "<prior board status, when known>",
      "description": "...",
      "recommendation": "...",
      "locations": [{ "file": "src/Vault.sol", "function": "withdraw", "snippet": "<the vulnerable code as the prior report showed it>" }],
      "source": "hex | report"
    }
  ]
}
```

- **From a `.hex/` folder:** read its `findings.json` and `tracking.json`. Import every finding whose tracking status is `verified` or `synced`; skip `rejected`, `duplicate` and still-Potential cards. Keep `id`, `title`, `severity`, `resolution`, `description`, `recommendation` and `root_cause.locations` (file + snippet). Add the function name when the snippet makes it clear.
- **From a report (PDF / Markdown):** read it (PDFs in page ranges) and extract every finding: id, title, severity, the status or resolution the report gives, the description, and the affected code. Keep the snippet verbatim; it drives the regression check.

Do not create board cards here. Prior findings are context; only regressions become cards (Phase 5b).

## Phase 2 — Protocol overview

Read from the output directory (`.hex/`):

- `config.json` — project name, scope, chain, docs URL.
- `stats.json` — contracts, nSLOC, ERCs, dependencies.
- `deps.json` — contract relationships and clusters.

Run `npx hex context` to load the full codebase. If `config.json.project.docs_url` is set, fetch and read the documentation.

Write a 2–3 paragraph overview to `.hex/overview.md` covering:

1. **What the protocol does** — purpose, target users, the problem it solves.
2. **Core mechanism** — deposit/withdraw flows, token economics, governance model.
3. **Key contracts and their roles** — entry points, state holders, libraries.
4. **Notable design patterns** — upgradeability, access control, external dependencies, oracle usage.

Write for an experienced Solidity auditor. Be precise and technical. Reference specific contract names and functions where relevant.

**(differential)** The overview still describes the protocol as it stands at head. Write a second file, `.hex/diff-overview.md`, which the dashboard's Changes page shows above the change tables. Read `diff.json`, `diff/changes.patch` and `git log --oneline <base>..<head> -- <scope>` (commit messages carry the intent), then cover:

1. **What changed and why** — the features, fixes and refactors in this change set, in plain terms, with the contracts and functions involved.
2. **Removed or replaced behavior** — anything the base had that head no longer does.
3. **Storage layout** — every entry in `storage_layout_changes`, and whether the contract is deployed behind a proxy (from `patterns.json`). A shifted slot in an upgradeable contract is the first thing an auditor must see.
4. **Impacted flows** — the entry points in `impacted` (`is_entry_point: true`) grouped into user-level flows (deposit, withdraw, liquidation, ...), and how the change reaches each.

Format: `# Changes: <base short sha> → <head short sha>`, then `##` sections in that order. Same rules as the overview: descriptive, no findings, no speculation.

**Do NOT:**

- List findings or security concerns (this is purely descriptive).
- Speculate about vulnerabilities.
- Include code snippets.
- Add disclaimers about AI limitations.

**Format:**

```markdown
# Protocol Overview: [Name]

[2-3 paragraphs]

## Key Contracts

| Contract | Type | nSLOC | Role |
| -------- | ---- | ----- | ---- |
| ...      | ...  | ...   | ...  |

## External Dependencies

- [Package] v[version] — used for [purpose]

## Architecture Notes

- [Notable design decisions, patterns, or concerns to keep in mind during review]
```

## Phase 3 — System diagram

Read `.hex/overview.md`, `.hex/patterns.json` (for `UPGRADEABLE`, `CROSS_CHAIN`, `DELEGATECALL`, `protocol_hints`), `.hex/attack-surface.json` (entry-point classification, token interactions, external deps), `.hex/access-control.json` (roles + modifiers).

Detect the protocol archetype from `patterns.json` (Vault / Lending / Bridge / Governance / AMM / Staking). Multiple may apply.

Write a Mermaid `graph TD` diagram to `.hex/diagrams/diagram.mmd`. Constraints:

- **Only in-scope contracts** (per `config.json.project.scope`). Out-of-scope contracts may appear as simplified nodes if in-scope contracts interact with them; otherwise omit.
- Skip interfaces, abstract contracts, and pure libraries.
- **Maximum ~15 nodes per diagram.** If the protocol is larger, split into multiple files (`diagram-core.mmd`, `diagram-governance.mmd`, etc.) grouped by purpose.
- Prefix contract labels with a semantic symbol where applicable:
  - 🏦 Vault / ERC-4626, 💰 Token, 🔮 Oracle, 🔒 Timelock/access control, 📦 Storage, ⚡ Flash loan, 🌉 Bridge.
- Define a classDef palette at the bottom of every diagram:
  ```
  classDef core fill:#a5d8ff,stroke:#1971c2,color:#000
  classDef user fill:#b2f2bb,stroke:#2f9e44,color:#000
  classDef admin fill:#ff8787,stroke:#c92a2a,color:#000
  classDef ext fill:#ffd8a8,stroke:#e8590c,color:#000
  classDef proxy fill:#d0bfff,stroke:#7048e8,color:#000,stroke-dasharray:5 5
  classDef storage fill:#ffec99,stroke:#f08c00,color:#000
  ```
- Apply class by role: core logic → `core`, user-facing → `user`, admin/governance → `admin`, external deps → `ext`, proxy/upgradeable → `proxy`, storage/registry → `storage`.
- Edge labels: type the interaction — `-->|external call|`, `-.->|delegatecall|`, `==>|access-controlled|`, `-.->|reads|`.
- Include a short overview header comment (`%% System architecture for <Project>`) and a visual legend at the bottom showing each classDef with one-line meaning.

**(differential)** Add a `changed` classDef (`classDef changed stroke:#e8590c,stroke-width:3px`) and apply it to every contract with an entry in `diff.json` `changes` (other than `comments_only`). List it in the legend.

## Phase 4 — Flow charts

Same context as Phase 3, plus `.hex/external-calls.json`.

**(differential)** Do not draw the archetype flows below. Draw the **impacted flows** instead: group the impacted entry points in `diff.json` (`is_entry_point: true`) into user-level flows, and draw one chart per flow, from the entry point through the changed code. Mark changed steps with the `changed` classDef, and show storage-layout changes as a note on the affected state node. Same file names, shapes and limits as below.

For each archetype, generate at minimum:

- **Value Flow** — how tokens/ETH move (deposits, withdrawals, fees, swaps).
- **Permission Flow** — who can do what; role grant/revoke; admin operations.

Archetype-specific flows (only generate when the archetype is detected):

- **Vault**: deposit/mint, withdraw/redeem, strategy allocation, fee collection.
- **Lending**: borrow, repay, liquidation (health check → liquidation → seizure → bad debt).
- **Governance**: proposal lifecycle (create → vote → queue → execute), delegation.
- **Bridge**: send (lock/burn → relay → finality → mint/unlock), receive/verify.
- **AMM/DEX**: swap, add liquidity, remove liquidity, fee accrual.
- **Staking**: stake, unstake, claim, compound.
- Add an **upgrade flow** if any upgradeable proxies are detected.

Write each flow to `.hex/diagrams/flow-<name>.mmd` (e.g., `flow-deposit.mmd`). Constraints per flow:

- **In-scope contracts only.** Out-of-scope contracts may appear as `ext` nodes when called by in-scope code.
- **Max ~15 nodes per flow.** Split if larger.
- Distinct shapes by semantic role:
  - Stadium `id(["Label"])` — entry point, success outcome, or revert
  - Rectangle `id["Label"]` — internal step or external call
  - Cylinder `id[("Label")]` — state change / storage mutation
  - Rhombus `id{"Label"}` — decision / validation
- Use the same classDef palette as the diagram, plus `entry`, `state`, `decision`, `reject`, `success` variants per flow needs.
- **Every decision diamond shows BOTH the success and the revert path** — don't omit failure branches.
- Use plain-English labels (`"Burns user shares"`, not `"_burn(msg.sender, shares)"`).
- Wrap each contract's nodes in a `subgraph` swim-lane.

## Phase 5 — Spec conformance

Read `.hex/config.json` (docs URL, scope, ERCs), `.hex/stats.json` (ERC/EIP usage), `.hex/attack-surface.json` (token interactions).

**(differential)** Check only what the change can affect: NatSpec, interface and ERC requirements of the changed and impacted functions in `diff.json`, plus any documentation claim about new or changed behavior. Unchanged functions were checked by the previous audit.

Cross-reference four sources:

**5.1 External documentation.** Fetch `config.json.project.docs_url`. Extract every behavioral claim ("users can deposit X and receive Y", "fees capped at 10%", "only admin can pause"). For each claim, find the implementing code and verify match.

**5.2 NatSpec.** For every function with `@notice`/`@dev`/`@param`/`@return`:

- Does the function actually do what `@notice` says?
- Are `@param` constraints accurate?
- Does it return what `@return` claims?
- Pay extra attention to conditional NatSpec ("reverts if…", "only when…").

**5.3 Interface conformance.** For every interface the contract implements (explicit `is IFoo` or implicit):

- All interface functions implemented?
- Behavioral semantics of each function respected?

**5.4 ERC/EIP compliance.** For each ERC/EIP in `stats.json.erc_eip_usage`:

- **Fetch the canonical spec** via WebFetch from `https://eips.ethereum.org/EIPS/eip-<number>`. If the fetch fails, note `"spec_fetched": false` and fall back to training knowledge.
- Extract every MUST/SHOULD/MAY requirement into a checklist; verify each against the implementation.

Known gotchas:

- **ERC-20**: return values on transfer/approve, zero-amount transfers, approval race.
- **ERC-4626**: rounding direction per spec, preview vs actual, max\* return values.
- **ERC-721**: safeTransferFrom callbacks.
- **ERC-2612**: permit deadline, nonce handling, domain separator chain ID.

**Weird token compat.** For every contract interacting with ERC-20 tokens (check `attack-surface.json.token_interactions`), classify handling of:

- Fee-on-transfer (balance-diff accounting vs trusting transfer amount).
- Rebasing (shares vs absolute balances; stale balance caches).
- Blocklist (DoS via blocked recipient in batches/loops; liquidation/withdrawal block).
- Double-entry-point legacy tokens (dedup on contract address).

### Output format

Write `.hex/spec-conformance.json`:

```json
{
  "checked_at": "<ISO-8601>",
  "sources_checked": { "external_docs": true, "natspec": true, "interfaces": true, "erc_eip": ["ERC-20", "ERC-4626"] },
  "summary": { "total_checks": N, "conforms": N, "deviates": N, "partial": N, "unverifiable": N, "undocumented": N },
  "items": [
    {
      "id": "SC-001",
      "source": "erc_eip" | "natspec" | "interface" | "external_docs",
      "spec_text": "Verbatim text or paraphrase of the requirement",
      "spec_location": { "type": "eip", "number": 4626, "section": "Specification", "url": "https://eips.ethereum.org/EIPS/eip-4626" },
      "status": "CONFORMS" | "DEVIATES" | "PARTIAL" | "UNVERIFIABLE" | "UNDOCUMENTED",
      "finding": "Plain-English explanation of what the code does vs what the spec demands.",
      "code_location": { "file": "src/Vault.sol", "line_start": 120, "line_end": 145 },
      "severity_hint": "Low",
      "confidence": "high"
    }
  ]
}
```

The `finding` text becomes a board card's description when the item is materialized (Phase 6) and can be synced to the client's report, so write it to the same report-facing standard as a `/write-finding` finding: flat prose, no banned words / AI giveaways, and specifically **no source line numbers** ("line 56"), **no cross-references** to other items by id, and **no PoC mentions**. If code is needed to illustrate the deviation, embed a minimal fenced ```` ```solidity ```` block in the `finding` and refer to it by function/variable name. The precise line range stays in `code_location` for internal navigation only — do not transcribe it into the `finding` prose.

Also write a human-readable `.hex/spec-conformance.md` rendering the same data grouped by status (DEVIATES first, CONFORMS last).

## Phase 6 — Materialize conformance items onto the board

For every item in `spec-conformance.json.items` with `status` of `DEVIATES` or `PARTIAL`, create a board card via the CLI — it allocates a uniform `H-NNN` id, materializes the full finding (description, code location) from the spec item by `source_ref`, and writes the tracking entry. Never hand-edit `tracking.json`.

```bash
npx hex issue new --source conformance --source-ref "<spec-item-id, e.g. SC-001>" \
  --title "<spec-item.finding's first sentence, ~80 chars>" \
  --severity "<spec-item.severity_hint, default Info>"
```

`--source-ref` is the spec item's own id (e.g. `SC-001`) — Hex keeps that as the back-reference; the board card itself gets the uniform `H-NNN`. These appear on the Issues board as Potential cards immediately; the auditor validates them later with `/validate-finding <id>` (or `/validate-all-findings`).

**Idempotency:** before creating, check whether a tracking entry already has this `source_ref` (re-running `/init-audit` shouldn't double-create). Skip items whose `source_ref` is already present.

## Phase 5b — Regression check of prior findings (differential, previous audit given)

For each finding in `.hex/previous-audit/findings.json`, decide what the change did to it:

| Status | Meaning |
|---|---|
| `fixed_unchanged` | The prior finding was fixed and the change does not touch that code. |
| `fix_touched_ok` | The change touches the fixed code, and the fix still holds. |
| `regressed` | The prior finding was fixed (or mitigated), and the change re-introduces it or undoes the fix. |
| `acknowledged_still_present` | The prior finding was left open (acknowledged / not fixed) and is still present. A known issue. |
| `code_removed` | The affected code no longer exists. |

Do a deterministic first pass, then judge: a prior `snippet` that appears verbatim again in the head file is a strong regression signal for a finding marked Fixed; a finding whose file and function do not appear in `diff.json` `changes` is `fixed_unchanged` (or `acknowledged_still_present`) without further reading. Read the code for everything else.

Write `.hex/previous-audit/review.json`:

```json
{
  "reviewed_at": "<ISO-8601>",
  "items": [
    { "id": "M-02", "title": "...", "severity": "Medium", "status": "regressed", "reasoning": "<one or two sentences>", "issue_id": "H-012" }
  ]
}
```

Put **only `regressed` findings** on the board, through the CLI, which materializes the card from the prior record:

```bash
npx hex issue new --source prior-audit --source-ref "<prior id>" --title "<title>" --severity <Severity>
```

Store the printed `H-NNN` as that item's `issue_id`. Before creating, skip any prior id that already has a tracking entry with `source: prior-audit` (re-running this skill must not double-create). Then rewrite the card's description for this code with `npx hex issue patch <id> --description-file ...`: the prior text describes the base commit, and the report needs the bug as it exists at head. Acknowledged findings are **not** carded: the client already knows about them, and `/ai-audit` skips matches to them.

## Phase 7 — Report and auto-launch the dashboard

Summarize:

- Files / contracts in scope, total nSLOC.
- Number of external/public functions, state variables.
- Number of conformance DEVIATES/PARTIAL items materialized to the board.
- Any warnings or limitations (missing tools, failed coverage, etc.).
- **(differential)** Base → head, files changed (+/- lines), functions added / modified / removed, impacted entry points, storage-layout changes, and the prior-findings tally from `review.json` (regressed / still present / fixed). Suggest `/ai-audit` next: in a differential audit it scans only the changed and impacted files and briefs its agents on the change.

Then launch the dashboard in the background so the auditor's browser opens automatically. Pass `--project` with the **absolute** project directory (so the dashboard reads the right `.hex/` regardless of the current working directory), and run with `run_in_background: true` so the skill returns control while Next.js keeps serving:

```bash
npx hex dashboard --project "<absolute project dir>"
```

Print a one-line confirmation after starting it: `Dashboard starting at http://localhost:3000 (live-refreshing as .hex/ changes).`

Do NOT run the command in the foreground — that would block this skill's return. The dashboard's auto-open already handles the browser; you just need to launch the process and return.

## Outputs (recap)

After this skill finishes, the following exist in `.hex/`:

- `config.json`, `stats.json`, `deps.json`, `access-control.json`, `state-vars.json`, `external-calls.json`, `patterns.json`, `constraints.json`, `attack-surface.json`
- `overview.md`
- `diagrams/diagram.mmd` (+ split diagrams if needed)
- `diagrams/flow-*.mmd`
- `spec-conformance.json`, `spec-conformance.md`
- `tracking.json` — populated with conformance DEVIATES/PARTIAL items as Potential issues
- **(differential)** `diff.json`, `diff/changes.patch`, `diff-overview.md`, and with a previous audit `previous-audit/findings.json` and `previous-audit/review.json` (regressions carded with `source: prior-audit`)
