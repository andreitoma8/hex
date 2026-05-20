# Hex

A toolkit for Solidity smart contract auditors. Hex combines Claude Code skills, deterministic analysis tools, and a local dashboard to take you from "I just received the code" to "here are my validated findings" — faster and with better coverage.

Hex does not replace your expertise. It automates the mechanical parts of auditing (parsing, stat collection, diagramming, PoC scaffolding, finding write-ups) so you can spend your time on what actually matters: reading code and thinking about what can break.

![Hex dashboard — VaultX Protocol home page with KPI strip, AI-generated overview, and contract architecture](dashboard.png)

## How It Works

You drive Hex through Claude Code. Type `/init-audit` and Claude runs the whole pipeline. Three components do the work behind the scenes off a shared project directory:

**Claude Code skills** are the front door. They handle anything that requires reasoning — generating protocol overviews, identifying invariants, checking if code matches its spec, writing PoCs, drafting findings, orchestrating other AI audit agents. You invoke them as native slash commands (e.g., `/init-audit`, `/generate-overview`). Skills are markdown files that ship with the `hex` package and get copied into your project's `.claude/skills/` directory. They're editable per-project if you need to customise them. Skills that need deep code comprehension (PoCs, invariants, spec conformance) recommend Opus; simpler tasks (overviews, finding write-ups) work well with Sonnet.

**Every skill reads all prior analysis outputs.** When you ask Claude to identify invariants, it doesn't just read the raw source code — it also reads the stats, dependency graph, access control map, state variable inventory, external call surface, and any other analysis already generated. Each skill layer builds on top of all previous layers, which means the AI has structured, high-confidence facts to work with rather than re-deriving everything from scratch.

**The `hex` CLI** is the deterministic engine the skills call into. It wraps battle-tested tools like Slither, solc, and Forge rather than reinventing static analysis, and it emits structured JSON with confidence metadata so you always know how much to trust a given data point. You can call it directly when you want to, but you usually won't — `/init-audit` does it for you.

**The dashboard** is a local Next.js app that visualises everything the tools and skills produce. It reads directly from your project directory and auto-refreshes when files change. The Progress page also writes back to `.hex/progress.json` when you mark contracts as reviewed.

All three components read from and write to the same project directory. There is no server, no database, no accounts. Everything stays local.

## Prerequisites

Before using Hex, make sure you have the following installed:

- **Claude Code** — Anthropic's CLI tool for agentic coding
- **Node.js** (v18+) and npm
- **Foundry** (`forge`, `cast`) — or Hardhat if that's what the project uses
- **Slither** — `pip install slither-analyzer`
- **solc** — the Solidity compiler (managed via `solc-select` or Foundry)

Run `hex doctor` once you've installed Hex (next section) to confirm everything is in place — it prints a labelled preflight table with install hints for anything missing.

## Quick Start

### 1. Clone the client project and install Hex

```bash
# Clone or receive the client project as usual
git clone https://github.com/client/protocol.git
cd protocol

# Install Hex globally
npm install -g hex-audit
```

### 2. Drop the skills into the project and open Claude Code

```bash
hex claude   # copies the audit skills into .claude/skills/
claude       # open Claude Code in this directory
```

`hex claude` is the only CLI call you need before Claude Code can take over — it copies the skill files so `/init-audit` and friends show up as native slash commands. Skills are editable per-project once they land in `.claude/skills/`.

### 3. Let Claude initialise the audit

Inside Claude Code:

```
/init-audit
```

Claude will ask you for scope, commit, chain, and docs URL, then:

- Write `.hex/config.json` with your audit scope and project metadata.
- Run the full analysis pipeline (`stats`, `deps`, `access`, `state`, `calls`, `patterns`, `constraints`, then `surface`) and stream live per-step progress while it goes.
- Create a `CLAUDE.md` at the project root — a quick-reference Claude Code auto-loads into every future conversation. It contains the chain, Solidity version, docs URL, a table of every output file and what each one answers, the recommended skill order, and the available CLI commands.

By the time `/init-audit` finishes, every analysis page on the dashboard has data.

The scope you provide defines which files you are responsible for auditing. All other project files remain available to Claude for context, compilation, and test execution.

### 4. Open the dashboard

In a second terminal:

```bash
hex dashboard
```

Opens `http://localhost:3000` in your browser. Leave it open as you work — every page fills in automatically as Claude generates more analysis. Use `--port 8080` for a custom port or `--no-open` to skip the auto-open.

---

## The Audit Workflow

Hex follows a four-phase workflow. You move through the phases sequentially, but you can always go back and re-run earlier steps. Every command in this section is typed inside Claude Code.

### Phase 1 — Understand

The goal of this phase is to build a mental model of the protocol before you read a single line of code. Everything here is AI-assisted, layered on top of the deterministic data `/init-audit` has already produced.

**1.1 — Overview**

```
/generate-overview
```

Claude reads the full codebase, any documentation you linked, and all the structured analysis already generated (stats, access control, state variables, external calls, dependencies). It writes a 2–3 paragraph overview of what the protocol does, how it works, and what the key contracts are. The overview is saved to `.hex/overview.md` and displayed on the dashboard home page.

**1.2 — Stats, access, state, calls, patterns, constraints, surface**

Already generated during `/init-audit`. View them on the dashboard:

- `/stats` — Per-contract nSLOC, functions, modifiers, events, errors, assembly lines. Test coverage (line and branch percentages, uncovered lines highlighted). Dependencies and ERC/EIP usage.
- `/access` — Who can call what, grouped by role, with confidence indicators showing whether a role was detected from a known library (high) or inferred from a modifier name (low, needs verification). Roles are also tagged with `kind` (`access_control`, `state_check`, `guard`, `unknown`); unknown kinds are hidden by default behind a "Show inferred / unknown modifiers" toggle so an `onlyDuringPause` doesn't pose as a permissioned role.
- `/state` — Every state variable with its type, mutability, which functions read and write it, whether it's unused, and storage-slot collision warnings (intra-contract and inheritance divergence) when compiler artifacts are available.
- `/calls` — Every external call with trust level, return-value checking, and reentrancy-guard status.

All pages support filtering by confidence level so you can focus on entries that need manual verification.

**1.3 — System Diagram**

```
/generate-diagram
```

Generates a Mermaid architecture diagram showing concrete contracts grouped into zones, with semantic symbols (🏦 Vault, 💰 Token, 🔮 Oracle, 🔒 Governance, 📦 Storage), colour-coded nodes, interaction-typed edge labels (delegatecall, external call, access-controlled), an overview header, and a visual legend. Max ~15 nodes per diagram — large protocols are automatically split into focused diagrams. Viewable on `/diagram` with zoom and pan controls.

**1.4 — Flow Charts**

```
/generate-flows
```

Generates Mermaid flow charts for every significant path through the protocol, grouped by user type (anyone, owner, keeper, etc.), value flows (deposits, withdrawals, fee collection), and admin operations. Distinct node shapes (stadium for start/end, cylinder for state changes, rhombus for decisions), swim-lane subgraphs per contract, plain-English labels. Every decision diamond shows both success and revert paths. Only in-scope contracts get flows — out-of-scope contracts appear only as external call targets.

**1.5 — Invariants**

```
/identify-invariants
```

Claude reads the full codebase, documentation, and all prior analysis outputs (especially state variables and access control), then runs a three-pass analysis:

1. Reads the documentation and extracts every stated guarantee.
2. Reads the code and identifies enforced invariants (arithmetic, access control, state machine, token accounting).
3. Compares the two and flags discrepancies — invariants stated in docs but not enforced in code (potential bugs) and invariants enforced in code but not documented (implicit assumptions).

Each invariant gets a confidence rating. Output is saved to `.hex/invariants.md` and displayed on `/invariants`.

**1.6 — Spec Conformance**

```
/check-spec-conformance
```

Checks whether the code actually does what it claims to do. Claude cross-references four specification sources:

- **External documentation** — "users can withdraw at any time" → does the code actually allow that?
- **NatSpec comments** — does `@notice Reverts if assets is zero` actually revert?
- **Interface conformance** — does the contract implement every function from its interfaces with correct behaviour?
- **ERC/EIP compliance** — does the ERC-4626 implementation follow the rounding rules? Does ERC-20 handle zero-amount transfers?

Each check is classified `CONFORMS`, `DEVIATES`, `PARTIAL`, `UNVERIFIABLE`, or `UNDOCUMENTED`. Deviations are potential findings. ERC items include `spec_location.url` so the `/conformance` dashboard can link back to the exact EIP section. Results land in `.hex/spec-conformance.json` and render on `/conformance`.

---

### Phase 2 — Review

This is where you do the actual auditing. Hex gets out of your way here — you read code in VS Code, think about what can break, and leave `@audit-issue` comments on anything suspicious.

When you find a potential issue, drop a comment above the affected code:

```solidity
// @audit-issue Possible reentrancy — external call before state update.
IERC20(token).transfer(recipient, amount);
```

Then point Claude at it (Phase 3).

---

### Phase 3 — Findings

Once you've identified issues during review, Hex helps you validate them and write them up.

**3.1 — Generate a Proof of Concept**

```
/generate-poc for the issue at src/Vault.sol line 156 about the rounding error
```

Claude will:

1. **Read all context** — every prior analysis output (access control, state variables, external calls, invariants, spec conformance, existing findings) plus the targeted source code. Full picture before reasoning about exploitability.
2. **Reason first** — trace the execution path, check preconditions, evaluate existing protections. This reasoning is preserved in a validation memo at `.hex/validations/<id>_memo.md`, regardless of whether the issue turns out to be valid.
3. **Inspect the project's test setup** — read existing test files, base contracts, fixtures, and configuration. It reuses your project's test infrastructure rather than building from scratch.
4. **Write the PoC** — a test file matching the project's framework (Foundry, Hardhat, etc.) and coding conventions, inheriting from existing base test contracts.
5. **Run and iterate** — execute the test, debug if it fails, iterate until it passes.

If Claude concludes the issue is not valid, it explains why in the validation memo and stops. The reasoning is always preserved so nothing is lost.

**3.2 — Write the Finding**

After a PoC passes:

```
/write-finding for the rounding error issue in src/Vault.sol
```

Claude reads the issue description, the validation memo, the PoC, and the relevant code, then writes a structured finding entry to `.hex/findings.json` with:

- Severity (Critical / High / Medium / Low / Info), assessed against a likelihood × impact matrix the skill documents inline.
- Description (self-contained: what the issue is, why it exists, what the impact would be).
- Code locations with relevant snippets.
- PoC reference.
- A suggested recommendation phrased as a direction (`Consider...`), not a prescriptive fix. The protocol team owns the implementation; the auditor proposes the shape.

`findings.json` is the canonical source of truth used for deduplication, severity stats, and the dashboard report view.

**Code-block rules in findings**

When the AI includes code snippets in a finding, it follows strict rules:

- Never modify original code in snippets (only `@audit` comments and `// ...` for omitted lines are allowed).
- Comments go on a separate line above the affected code, never inline.
- All inserted comments are full sentences with proper capitalisation and punctuation.
- No added explanatory text that wasn't in the original source.

**3.3 — Convert spec deviations into findings (optional)**

```
/conformance-to-findings
```

Batch-validates every `DEVIATES` or `PARTIAL` item from `/check-spec-conformance` and converts the real ones into structured findings. Items it rejects get a validation memo explaining why so nothing disappears silently.

---

### Phase 3.5 — Team mode (optional)

When two or three auditors share an engagement, syncing findings through GitHub Issues keeps everyone on the same page without anyone setting up a server.

Set `settings.github.repo` in `.hex/config.json` (the audit firm's internal repo, e.g. `nethermind/audit-vaultx`) and authenticate the `gh` CLI once on your machine:

```bash
gh auth login
```

Hex itself never stores GitHub credentials — `/sync-github` drives the `gh` CLI directly. Then, after writing a verified finding:

```
/sync-github
```

One invocation does both directions:

- **Pulls** every issue from the configured repo with the `hex` label, classifies each by a hidden `<!-- hex-finding-id: F<NNN> -->` footer, attaches comments and state to your matching local findings, and writes teammates' issues to `.hex/external/github/findings.json` so they show up in `/all-findings` with `source: github` and the author's GitHub login.
- **Pushes** every local finding whose tracking status is in `settings.github.publish_status` (default: `verified`) as a new issue, or updates an existing issue if the finding already has a `github.issue_number`. The body is rendered from the finding's description, code locations, and recommendation; labels are applied for severity, source, and status.
- **Deduplicates** by calling `/compare-findings`, so teammates filing the same bug surface as duplicates with the same `match_signals` you already see for AI tools.

The dashboard's `/all-findings` page shows GitHub issues inline alongside manual and AI-tool findings. Expand a row to see the issue link, state, the last few comments, and (for your local findings) the synced `github.issue_number`. The sidebar gains a second indicator under LiveStatus showing how long ago `/sync-github` last ran.

Comments stay on GitHub — Hex never posts, edits, or deletes comments. Auditors discuss inside GitHub itself.

### Phase 4 — Re-audit with AI

After your manual review is complete, run external AI audit agents as a second pass to catch anything you might have missed.

**4.1 — Run AI analysis**

```
/run-ai-analysis
```

This orchestrator skill:

1. Presents a checkbox-style tool-selection prompt (pick which AI tools to run — solidity-auditor, sc-auditor, plamen, auditagent).
2. Runs a preflight check for each tool — verifies env vars, skill installation, and system dependencies, then presents a summary table of anything missing. For plamen and auditagent, offers auto-install if not found.
3. Runs auditagent first (cloud-based async scanner from Nethermind — triggers a 30–60 min scan, collects results on subsequent runs).
4. Runs non-plamen skills (solidity-auditor, sc-auditor) **sequentially** in the orchestrator context with type-aware instructions (skill-file tools follow their `SKILL.md` methodology; MCP-server tools discover and use their MCP tools).
5. Runs plamen after non-plamen tools complete.
6. Normalises all findings and batch-writes them to `tracking.json` with `status: "unverified"`.
7. Runs `/compare-findings` automatically and prints a coverage gap summary.

If auditagent's cloud scan is still running when you finish the other tools, leave a second terminal running `hex ai-status --watch` — it polls every 5 minutes and notifies you when the scan completes so the findings don't get forgotten.

**4.2 — Compare findings**

```
/compare-findings
```

Claude semantically compares each AI finding against your own. It matches on affected contract, function, root cause, and attack vector — not string matching. Output:

- **Duplicates** — AI findings that match an existing one, with a confidence level *and* `match_signals` (which of contract / function / root cause / attack vector agreed) plus a one-line reasoning. If you disagree with a merge, you can see exactly which signal carried the call.
- **Novel** — Genuinely new findings you didn't catch, ranked by likely severity.
- **Rejected** — Out of scope or clearly invalid, with explanation.

Results land in `.hex/comparison.json` and the master tracking table updates.

**4.3 — Validate new findings**

For each novel finding the AI agents surfaced:

```
/validate-ai-finding for AI-N001
```

Claude independently traces the described attack path in the code and decides if it's valid. If valid, it generates a PoC and writes a finding. If invalid, it explains why. If uncertain, it flags specific questions for you to investigate.

**4.4 — All Findings**

View the complete picture on `/all-findings`:

- Every finding (yours and from AI agents) in one filterable table.
- Status: verified, pending validation, rejected.
- PoC status: passing, failing, not started.
- Duplicate mapping: which AI findings correspond to which of yours, with the `match_signals` expanded.
- Summary stats: total findings by status.
- Expandable rows with full finding detail.

---

## Claude Code Skills Reference

Each skill has a recommended model — switch your Claude Code model before invoking skills that recommend Opus.

| Skill | Phase | Recommended Model | What it does |
|-------|-------|-------------------|-------------|
| `init-audit` | Setup | Sonnet | Runs init + analysis tools (parallel where possible) |
| `generate-overview` | 1.1 | Sonnet | Writes 2–3 paragraph protocol overview |
| `generate-diagram` | 1.3 | Sonnet | Creates Mermaid system architecture diagram |
| `generate-flows` | 1.4 | Opus | Creates Mermaid flow charts by user type and value paths |
| `identify-invariants` | 1.5 | Opus | Three-pass invariant identification (docs → code → compare) |
| `check-spec-conformance` | 1.6 | Opus | Verifies code matches docs, NatSpec, interfaces, ERC/EIPs |
| `generate-poc` | 3.1 | Opus | Validates issue reasoning, then writes and runs PoC test |
| `write-finding` | 3.2 | Sonnet | Writes structured finding to JSON, with hedged `Consider...` recommendation tone |
| `conformance-to-findings` | 3.3 | Sonnet | Batch-converts spec conformance deviations into validated findings |
| `run-ai-analysis` | 4.1 | Opus | Orchestrates all configured AI audit tools with preflight checks |
| `compare-findings` | 4.2 | Sonnet | Semantic dedup of your findings vs AI agent findings (with `match_signals`) |
| `validate-ai-finding` | 4.3 | Opus | Interactively verifies a novel AI finding (PoC vs rational, severity adjustment) |
| `sync-github` | 3.5 | Sonnet | Two-way sync between local findings and GitHub Issues — pulls teammate issues, pushes your verified findings, then runs `/compare-findings` |

### Where Skills Live

Skills use Claude Code's native skill format, stored in `.claude/skills/<name>/SKILL.md`. They're copied there when you run `hex claude` or `hex init`.

```
.claude/skills/
├── init-audit/SKILL.md
├── generate-overview/SKILL.md
├── generate-diagram/SKILL.md
├── generate-flows/SKILL.md
├── identify-invariants/SKILL.md
├── check-spec-conformance/SKILL.md
├── generate-poc/SKILL.md
├── write-finding/SKILL.md
├── conformance-to-findings/SKILL.md
├── run-ai-analysis/SKILL.md
├── compare-findings/SKILL.md
└── validate-ai-finding/SKILL.md
```

**How Claude Code finds them:** Claude Code auto-discovers skills in `.claude/skills/`. They appear as native slash commands — type `/` in Claude Code to see them.

**Customising skills for a project:** You can edit any `SKILL.md` file in place. For example, add project-specific hints to the invariant identification skill, or adjust the PoC conventions to match an unusual test setup.

**Updating skills after upgrading Hex:**

```bash
hex update-skills              # re-copy and overwrite all skill files from the new package version
hex update-skills --keep-custom  # skip existing skill files to preserve your modifications
```

By default, `update-skills` overwrites existing skills with the latest version. Use `--keep-custom` to preserve any per-project modifications you've made.

### What Skills See

Every skill that reasons about code automatically reads all available analysis outputs from `.hex/` — not just the raw source code. By the time you invoke `identify-invariants`, the AI already has:

- The codebase statistics (nSLOC, ERCs, dependencies).
- The dependency graph (which contracts interact).
- The access control map (who can call what, with confidence levels).
- The state variable inventory (what's mutable, what's unused, who reads/writes, plus any storage-slot collisions).
- The external call surface (trust levels, return checking, reentrancy guards).
- Any previously generated outputs (overview, invariants, spec conformance results).

Each skill layer builds on all previous layers. The later you invoke a skill in the workflow, the richer its context.

---

## Dashboard Pages

The dashboard runs locally at `http://localhost:3000` and auto-refreshes when output files change. A live "Updated Ns ago" indicator in the sidebar footer tells you the watcher is connected.

| Page | URL | What you see |
|------|-----|-------------|
| Home | `/` | Project info, AI overview, key stats |
| Progress | `/progress` | Weighted progress bar (70% nSLOC reviewed, 20% audit steps, 10% findings triage), contract review checklist, audit step indicators |
| Statistics | `/stats` | Per-contract metrics, test coverage, dependencies, ERCs |
| System Diagram | `/diagram` | Mermaid architecture diagram with zoom/pan |
| Flows | `/flows` | Mermaid flow charts with zoom/pan |
| Access Control | `/access` | Role → function matrix with "Show unprotected only" and "Show inferred / unknown modifiers" toggles |
| State Variables | `/state` | Variable inventory with reader/writer tracking and storage-collision warnings |
| External Calls | `/calls` | Call surface with filterable Trust column |
| Functions | `/functions` | Aggregated function view with state/call cross-references |
| Invariants | `/invariants` | Identified invariants and doc/code discrepancies |
| Spec Conformance | `/conformance` | Code vs spec check results, deviations first, with clickable spec links |
| AI Reports | `/ai-reports` | Per-tool AI audit results with consensus badges |
| Report | `/report` | Verified findings with copy-to-clipboard (HackMD markdown format) |
| All Findings | `/all-findings` | Merged table of all findings + tracking data with filters; expand a row to see `match_signals` and any GitHub thread |

---

## Understanding Confidence Levels

Every analysis output includes confidence metadata so you know how much to trust it.

**High confidence** — Derived from compiler artifacts or established static analysis tools (solc AST, Slither detectors, compiler storage layout). Treat as ground truth.

**Medium confidence** — Derived from AST pattern matching or known library detection (e.g., recognising OpenZeppelin Ownable). Reliable for standard patterns, but may miss custom implementations.

**Low confidence** — Derived from naming heuristics (e.g., inferring a "keeper" role from a modifier named `onlyKeeper`). Use as a starting point, then verify manually.

Access-control roles also carry a `kind` field (`access_control`, `state_check`, `guard`, or `unknown`) and an `is_likely_access_control` flag. `/access` hides roles classified as `unknown` by default and exposes a "Show inferred / unknown modifiers" toggle so an `onlyDuringPause` doesn't pose as a permissioned role just because its modifier name starts with `only`.

Storage-slot collisions and inheritance-layout divergences detected from the compiler's storage layout are flagged with `Critical` severity in `state-vars.json` and roll into `attack-surface.json`.

On the dashboard, confidence is shown as coloured badges. You can filter any analysis page by confidence level to quickly find entries that need your attention.

---

## Output Directory Structure

All Hex outputs live in a single directory inside the project (default: `.hex/`, configurable in `config.json`).

```
.hex/
├── config.json              # Audit scope, settings
├── overview.md              # AI-generated protocol overview
├── stats.json               # Codebase statistics and test coverage
├── deps.json                # Contract dependency graph
├── access-control.json      # Role → function mapping (with `kind`, `is_likely_access_control`)
├── state-vars.json          # State variable inventory + storage_collisions
├── external-calls.json      # External call surface
├── patterns.json            # Security pattern flags (ORACLE, TEMPORAL, etc.)
├── constraints.json         # Setter validation (AST-aware) and event analysis
├── attack-surface.json      # Attack surface summary
├── invariants.md            # Identified invariants
├── spec-conformance.json    # Spec vs code conformance checks (with spec_location.url for ERCs)
├── spec-conformance.md      # Rendered conformance report
├── diagrams/                # All Mermaid diagram files
│   ├── diagram.mmd          # System architecture diagram
│   └── flow-*.mmd           # Flow charts (one per flow)
├── progress.json            # Audit progress tracking (contract review state)
├── findings.json            # Canonical finding data
├── validations/             # Issue validation memos
│   ├── A001_memo.md
│   └── A003_memo.md
├── ai-results/              # AI audit tool outputs (per-tool subdirectories)
│   ├── solidity-auditor/
│   │   ├── raw-output.md
│   │   ├── findings.json
│   │   └── metadata.json
│   ├── sc-auditor/
│   │   ├── raw-output.md
│   │   ├── findings.json
│   │   └── metadata.json
│   ├── plamen/
│   │   ├── raw-output.md
│   │   ├── findings.json
│   │   ├── metadata.json
│   │   └── _scope.txt       # Generated scope file for plamen
│   ├── auditagent/
│   │   ├── raw-output.md
│   │   ├── findings.json
│   │   └── metadata.json    # Includes scan_id
│   └── <other-tool>/
│       ├── raw-output.md
│       ├── findings.json
│       └── metadata.json
├── ai-status.json           # AI tool run status tracker (used by `hex ai-status`)
├── comparison.json          # Finding dedup results (with match_signals)
└── tracking.json            # Master tracking table
```

You can change the output directory by setting `settings.output_dir` in `config.json` before running init.

---

## Scope vs. Full Project Access

When you initialise an audit, you specify which files are in scope. This is the set of contracts you're responsible for auditing — all analysis tools focus on these files.

But the entire project remains accessible. Claude Code can read out-of-scope contracts, run the existing test suite, compile everything, and leverage the project's test infrastructure when writing PoCs. The scope simply tells the tools where to focus their output.

```
# In-scope: these are what you're auditing
src/core/Vault.sol, src/core/Strategy.sol, src/libraries/Math.sol

# Still accessible: tests, mocks, deploy scripts, dependencies, interfaces
# Claude Code can read them all, forge can compile and run tests against them
```

---

## CLI Reference

You usually don't call these directly — `/init-audit` and the other skills do. But they're the deterministic engine underneath, and they're useful when you want to re-run a single analysis, script something, or troubleshoot.

All commands run from within the project directory (or with `--project /path/to/project`).

| Command | What it does |
|---------|-------------|
| `hex doctor` | Preflight check: node, forge, slither, solc, Claude Code, output-dir writability, project config |
| `hex claude` | Copy skills to `.claude/skills/` for Claude Code discovery |
| `hex init` | Initialise audit config — scope, commit, chain, docs URL (called by `/init-audit`) |
| `hex analyze` | Run all analysis commands in parallel (stats, deps, access, state, calls, patterns, constraints), then surface |
| `hex stats` | Generate codebase statistics and test coverage |
| `hex deps` | Build contract dependency graph |
| `hex access` | Extract access control mapping (roles → functions, including inherited) |
| `hex state` | Generate state variable inventory + storage-collision detection |
| `hex calls` | Map external call surface (AST-based, Slither optional) |
| `hex patterns` | Detect security-relevant patterns (ORACLE, FLASH_LOAN, TEMPORAL, etc.) |
| `hex constraints` | Extract setter validation status (AST-aware, follows helpers and modifiers) |
| `hex surface` | Build attack surface summary cross-referencing all analysis |
| `hex context` | Assemble optimised AI context from codebase |
| `hex context --target Vault` | Context for a specific contract and its dependencies |
| `hex context --estimate` | Show token count without generating context |
| `hex dashboard` | Start local dashboard and open in browser |
| `hex dashboard --port 8080` | Start dashboard on a custom port |
| `hex update-skills` | Re-copy skill files from package (overwrites by default) |
| `hex update-skills --keep-custom` | Skip existing skill files instead of overwriting |
| `hex ai-status` | Show the latest status for async AI tools (currently `auditagent`) |
| `hex ai-status --watch` | Poll every 5 minutes until all pending scans resolve (auditagent typically 30–60 min) |
