---
description: "Initialize a Solidity audit project: deterministic analysis + protocol overview + system diagram + flow charts + spec conformance, all in one run"
---

# Skill: Initialize Audit

**Recommended model:** Opus (this skill performs all reasoning-heavy pre-review work; switch to Opus before invoking)

You are setting up a new Solidity audit project with Hex. This single skill replaces the old chain of `/init-audit` → `/generate-overview` → `/generate-diagram` → `/generate-flows` → `/check-spec-conformance`. By the time it finishes, every analysis page on the dashboard has data and every DEVIATES/PARTIAL spec item has been materialized as a Potential card on the issue board.

## Prerequisites

- The auditor has cloned or received the client project.
- Node.js and npm are installed.
- Hex CLI is installed (`npm install -g hex-audit`).

## Phase 1 — Config + dependency safety

### 1.1 Gather information

Ask the auditor for:
- **Project directory path** — where the client project lives (default: current directory).
- **Scope** — glob or explicit list of files in audit scope (e.g., `src/core/**/*.sol`).
- **Commit hash** — the specific commit being audited (default: HEAD).
- **Chain** — target chain (default: ethereum).
- **Documentation URL** — if available.

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
npx hex init --project "<path>" --scope "<scope>" --commit <hash> --chain <chain> --docs "<url>"
npx hex analyze
```

`hex analyze` runs stats → deps → access → state → calls → patterns → constraints in parallel, then `surface` last. If a tool is missing (Slither, forge), the corresponding analysis is skipped — note the limitation and move on.

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
|----------|------|-------|------|
| ... | ... | ... | ... |

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

## Phase 4 — Flow charts

Same context as Phase 3, plus `.hex/external-calls.json`.

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
- **ERC-4626**: rounding direction per spec, preview vs actual, max* return values.
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

Also write a human-readable `.hex/spec-conformance.md` rendering the same data grouped by status (DEVIATES first, CONFORMS last).

## Phase 6 — Materialize conformance items onto the board

For every item in `spec-conformance.json.items` with `status` of `DEVIATES` or `PARTIAL`, append a tracking entry to `.hex/tracking.json` (creating the file if missing). Schema:

```json
{
  "id": "<spec-item-id, e.g. SC-001>",
  "title": "<spec-item.finding's first sentence, truncated to ~80 chars>",
  "severity": "<spec-item.severity_hint, default 'Info' if absent>",
  "source": "conformance",
  "status": "pending_validation",
  "poc_status": "not_started",
  "poc_file": null,
  "duplicates": [],
  "notes": "<spec source + spec_location URL — so the board card has provenance>"
}
```

These appear on the dashboard's Issues board as Potential cards immediately. The auditor validates them later with `/validate-issue <id>`.

**Idempotency:** if a tracking entry with the same id already exists, leave it alone (the auditor may have already edited/promoted it).

## Phase 7 — Report and start the dashboard

Summarize:
- Files / contracts in scope, total nSLOC.
- Number of external/public functions, state variables.
- Number of conformance DEVIATES/PARTIAL items materialized to the board.
- Any warnings or limitations (missing tools, failed coverage, etc.).

Then offer:

```bash
npx hex dashboard
```

Opens `http://localhost:3000` with live refresh on `.hex/` changes.

## Outputs (recap)

After this skill finishes, the following exist in `.hex/`:

- `config.json`, `stats.json`, `deps.json`, `access-control.json`, `state-vars.json`, `external-calls.json`, `patterns.json`, `constraints.json`, `attack-surface.json`
- `overview.md`
- `diagrams/diagram.mmd` (+ split diagrams if needed)
- `diagrams/flow-*.mmd`
- `spec-conformance.json`, `spec-conformance.md`
- `tracking.json` — populated with conformance DEVIATES/PARTIAL items as Potential issues
