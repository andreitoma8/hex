# SolAudit

A toolkit for Solidity smart contract auditors. SolAudit combines CLI analysis tools, Claude Code skills, and a local dashboard to take you from "I just received the code" to "here are my validated findings" — faster and with better coverage.

SolAudit does not replace your expertise. It automates the mechanical parts of auditing (parsing, stat collection, diagramming, PoC scaffolding, finding write-ups) so you can spend your time on what actually matters: reading code and thinking about what can break.

## How It Works

There are three components that work together off a shared project directory:

**CLI tools** (`solaudit`) run deterministic analysis — stats, access control mapping, state variable inventory, external call surface. They wrap battle-tested tools like Slither, solc, and Forge rather than reinventing static analysis. Their output is structured JSON with confidence metadata so you always know how much to trust a given data point.

**Claude Code skills** handle anything that requires reasoning — generating protocol overviews, identifying invariants, checking if code matches its spec, writing PoCs, drafting findings. You invoke them through Claude Code in your terminal as native slash commands (e.g., `/init-audit`, `/generate-overview`). Skills are markdown files that ship with the `solaudit` package and get copied into your project's `.claude/skills/` directory. They're editable per-project if you need to customize them. Skills that need deep code comprehension (PoCs, invariants, spec conformance) recommend Opus; simpler tasks (overviews, finding write-ups) work well with Sonnet.

**Every AI skill reads all prior analysis outputs.** When you ask Claude to identify invariants, it doesn't just read the raw source code — it also reads the stats, dependency graph, access control map, state variable inventory, external call surface, and any other analysis you've already generated. Each skill layer builds on top of all previous layers, which means the AI has structured, high-confidence facts to work with rather than re-deriving everything from scratch.

**The dashboard** is a local Next.js app that visualizes everything the tools and skills produce. It reads directly from your project directory and auto-refreshes when files change. The Progress page also writes back to `.solaudit/progress.json` when you mark contracts as reviewed.

All three components read from and write to the same project directory. There is no server, no database, no accounts. Everything stays local.

## Prerequisites

Before using SolAudit, make sure you have the following installed:

- **Node.js** (v18+) and npm
- **Foundry** (`forge`, `cast`) — or Hardhat if that's what the project uses
- **Slither** — `pip install slither-analyzer`
- **solc** — the Solidity compiler (managed via `solc-select` or Foundry)
- **Claude Code** — Anthropic's CLI tool for agentic coding

## Quick Start

### 1. Clone the client project and install SolAudit

```bash
# Clone or receive the client project as usual
git clone https://github.com/client/protocol.git
cd protocol

# Install SolAudit globally (or as a dev dependency)
npm install -g solaudit
```

### 2. Set up Claude Code skills

```bash
solaudit claude
```

This copies all audit skills to `.claude/skills/` so Claude Code discovers them as native slash commands. This works before `solaudit init` — no config required.

### 3. Initialize the audit

```bash
solaudit init --scope "src/core/**/*.sol,src/Vault.sol" --commit abc123 --chain ethereum --docs "https://docs.protocol.xyz"
```

This creates a `.solaudit/` directory (configurable) inside the project with:
- `config.json` with your audit scope

It also generates a `CLAUDE.md` at the project root — a quick-reference that Claude Code auto-loads into every conversation. It contains project metadata (chain, Solidity version, docs URL), a table of all output files and what they answer, the recommended skill workflow order, and available CLI commands. This means Claude always knows where to find docs, scope, analysis data, and config without needing to be told.

The scope defines which files you are responsible for auditing. All other project files remain available for context, compilation, and test execution.

You can also run this interactively through Claude Code:

```bash
claude
> /init-audit
```

### 3. Run analysis

```bash
solaudit stats        # nSLOC, functions, ERCs, dependencies, test coverage
solaudit deps         # contract dependency graph and clusters
solaudit access       # role → function mapping with confidence levels
solaudit state        # state variable inventory (readers, writers, mutability)
solaudit calls        # external call surface with trust classification
solaudit patterns     # security pattern flags (ORACLE, FLASH_LOAN, TEMPORAL, etc.)
solaudit constraints  # setter validation and event emission analysis
solaudit surface      # attack surface summary cross-referencing all data
```

Or run everything at once through the `init-audit` skill, which runs all commands in parallel (with surface last) and gives you a summary.

### 4. Start the dashboard

```bash
solaudit dashboard
```

This starts the dashboard and opens `http://localhost:3000` in your browser. You'll see the home page with project info and stats. As you progress through the audit, every page fills in automatically.

You can customize the port or skip auto-opening the browser:

```bash
solaudit dashboard --port 8080    # custom port
solaudit dashboard --no-open      # don't open browser
```

---

## The Audit Workflow

SolAudit follows a four-phase workflow. You move through the phases sequentially, but you can always go back and re-run earlier steps.

### Phase 1 — Understand

The goal of this phase is to build a mental model of the protocol before you read a single line of code. Everything here is automated or AI-assisted.

**Step 1.1 — Overview**

```bash
claude
> /generate-overview
```

Claude reads the full codebase, any documentation you linked, and all the structured analysis already generated (stats, access control, state variables, external calls, dependencies). It then writes a 2-3 paragraph overview of what the protocol does, how it works, and what the key contracts are. The overview is saved to `.solaudit/overview.md` and displayed on the dashboard home page.

*Recommended model: Sonnet*

**Step 1.2 — Stats**

Already generated during init. View them on the dashboard at `/stats`:

- Per-contract breakdown: nSLOC, functions, modifiers, events, errors, assembly lines
- Test coverage (line and branch percentages, uncovered lines highlighted)
- Dependencies and versions
- ERC/EIP usage

Test coverage is optional — if the project has broken tests or missing dependencies, the stats command still completes and notes that coverage was unavailable.

**Step 1.3 — System Diagram**

```bash
claude
> /generate-diagram
```

Generates a Mermaid architecture diagram showing concrete contracts grouped into zones, with semantic symbols (🏦 Vault, 💰 Token, 🔮 Oracle, 🔒 Governance, 📦 Storage), color-coded nodes, interaction-typed edge labels (delegatecall, external call, access-controlled), an overview header, and a visual legend. Max ~15 nodes per diagram — large protocols are automatically split into focused diagrams. Viewable in the dashboard at `/diagram` with zoom and pan controls.

*Recommended model: Sonnet*

**Step 1.4 — Flow Charts**

```bash
claude
> /generate-flows
```

Generates Mermaid flow charts for every significant path through the protocol, grouped by user type (anyone, owner, keeper, etc.), value flows (deposits, withdrawals, fee collection), and admin operations. Each flow uses distinct node shapes (stadium for start/end, cylinder for state changes, rhombus for decisions), swim-lane subgraphs per contract, and plain-English labels throughout. Every decision diamond shows both success and revert paths. Only in-scope contracts get flows — out-of-scope contracts appear only as external call targets. Max ~15 nodes per flow — complex flows are automatically split. Includes overview header and visual legend.

*Recommended model: Opus*

**Step 1.5 — Invariants**

```bash
claude
> /identify-invariants
```

Claude reads the full codebase, documentation, and all prior analysis outputs (especially the state variable inventory, which tells it exactly which variables are bounded, mutable, or unused, and the access control map, which tells it role constraints). It performs a three-pass analysis:

1. Reads the documentation and extracts every stated guarantee
2. Reads the code and identifies enforced invariants (arithmetic, access control, state machine, token accounting)
3. Compares the two and flags discrepancies — invariants stated in docs but not enforced in code (potential bugs) and invariants enforced in code but not documented (implicit assumptions)

Each invariant gets a confidence rating. Output is saved to `.solaudit/invariants.md` and displayed at `/invariants` on the dashboard.

*Recommended model: Opus*

**Step 1.6 — Spec Conformance**

```bash
claude
> /check-spec-conformance
```

This checks whether the code actually does what it claims to do. Claude reads the full codebase, all prior analysis outputs, and the already-identified invariants, then cross-references four specification sources:

- **External documentation** — "users can withdraw at any time" → does the code actually allow that?
- **NatSpec comments** — does `@notice Reverts if assets is zero` actually revert?
- **Interface conformance** — does the contract implement all functions from its interfaces with correct behavior?
- **ERC/EIP compliance** — does the ERC-4626 implementation follow rounding rules? Does ERC-20 handle zero-amount transfers?

Each check is classified as CONFORMS, DEVIATES, PARTIAL, UNVERIFIABLE, or UNDOCUMENTED. Deviations are potential findings. Results are saved to `.solaudit/spec-conformance.json` and viewable at `/conformance` on the dashboard.

*Recommended model: Opus*

**Step 1.7 — Access Control, State Variables, External Calls**

Already generated during init. View them on the dashboard:

- `/access` — Who can call what. Functions grouped by role, with confidence indicators showing whether a role was detected from a known library (high confidence) or inferred from a modifier name (low confidence, needs verification). Interface functions are filtered out. Includes inherited functions (via Slither when available, or via `forge flatten` as fallback). A "Show unprotected only" toggle highlights state-changing functions callable by anyone.
- `/state` — Every state variable with its type, mutability, which functions read and write it, and whether it's unused. Storage slots shown only when sourced from compiler artifacts.
- `/calls` — Every external call with trust level, return value checking, and reentrancy guard status. Uses AST-based extraction (works without Slither), with optional Slither enrichment for unchecked returns and reentrancy guard detection. Trust column is filterable.

All three pages support filtering by confidence level so you can quickly see which entries need manual verification.

---

### Phase 2 — Review

This is where you do the actual auditing. SolAudit gets out of your way here — you read code in VS Code, think about what can break, and leave `@audit-issue` comments on anything suspicious.

When you find a potential issue, add a comment in the source code:

```solidity
// @audit-issue Possible reentrancy — external call before state update.
IERC20(token).transfer(recipient, amount);
```

Then point Claude at it to validate and generate a PoC (see Phase 3).

---

### Phase 3 — Findings

Once you've identified issues during review, SolAudit helps you validate them and write them up.

**Step 3.1 — Generate a Proof of Concept**

Point Claude at the issue:

```bash
claude
> /generate-poc for the issue at src/Vault.sol line 156 about the rounding error
```

Claude will:

1. **Read all context** — all prior analysis outputs (access control, state variables, external calls, invariants, spec conformance, existing findings) plus the targeted source code. This gives it the full picture to reason about exploitability.
2. **Reason first** — trace the execution path, check preconditions, evaluate existing protections. This reasoning is preserved in a validation memo at `.solaudit/validations/A001_memo.md`, regardless of whether the issue is valid.
3. **Inspect the project's test setup** — read existing test files, base contracts, fixtures, and configuration. It reuses your project's test infrastructure rather than building from scratch.
4. **Write the PoC** — a test file matching the project's framework (Foundry, Hardhat, etc.) and coding conventions, inheriting from existing base test contracts.
5. **Run and iterate** — execute the test, debug if it fails, iterate until it passes.

If Claude concludes the issue is not valid, it explains why in the validation memo and stops. The reasoning is always preserved so nothing is lost.

*Recommended model: Opus*

**Step 3.2 — Write the Finding**

After a PoC passes:

```bash
claude
> /write-finding for the rounding error issue in src/Vault.sol
```

Claude reads the issue description, the validation memo, the PoC, and the relevant code, then writes a structured finding entry to `.solaudit/findings.json` with:

- Severity (Critical/High/Medium/Low/Info, directly assessed)
- Description (self-contained: covers what the issue is, why it exists, and what the impact is)
- Code locations with relevant snippets
- PoC reference
- Concrete recommendation

Findings data is stored in `findings.json`, the canonical source of truth (used for deduplication, severity stats, and the dashboard report view).

*Recommended model: Sonnet*

**Code block rules in findings**

When the AI includes code snippets in a finding, it follows strict rules:

- Never modifies original code in snippets (only `@audit` comments and `// ...` for omitted lines are allowed)
- Comments go on a separate line above the affected code, never inline
- All inserted comments are full sentences with proper capitalization and punctuation
- No added explanatory text that wasn't in the original source

---

### Phase 4 — Re-audit with AI

After your manual review is complete, run external AI audit agents as a second pass to catch anything you might have missed.

**Step 4.1 — Run AI analysis**

```bash
claude
> /run-ai-analysis
```

This orchestrator skill:
1. Presents a checkbox-style tool selection prompt (pick which AI tools to run — solidity-auditor, sc-auditor, plamen)
2. Runs a preflight check for each tool — verifies env vars, skill installation, and system dependencies, then presents a summary table of any missing items. For plamen, offers auto-install if not found.
3. Runs non-plamen skills (solidity-auditor, sc-auditor) **sequentially** in the orchestrator context with type-aware instructions (skill-file tools follow their SKILL.md methodology; MCP-server tools discover and use their MCP tools)
4. Runs plamen after non-plamen tools complete
5. Normalizes all findings and batch-writes them to `tracking.json` with `status: "unverified"`
6. Runs `/compare-findings` automatically and prints a coverage gap summary

**Step 4.2 — Compare findings**

```bash
claude
> /compare-findings
```

Claude semantically compares each AI finding against your own findings. It matches on affected contract, function, root cause, and attack vector — not string matching. The output is:

- **Duplicates** — AI findings that match your existing findings, with confidence level
- **Novel** — Genuinely new findings you didn't catch, ranked by likely severity
- **Rejected** — Out of scope or clearly invalid, with explanation

Results are saved to `.solaudit/comparison.json` and the master tracking table is updated.

*Recommended model: Sonnet*

**Step 4.3 — Validate new findings**

For each novel finding the AI agents surfaced:

```bash
claude
> /validate-ai-finding for AI-N001
```

Claude independently traces the described attack path in the code and determines if it's valid. If valid, it generates a PoC and writes a finding. If invalid, it explains why. If uncertain, it flags specific questions for you to investigate.

*Recommended model: Opus*

**Step 4.4 — All Findings**

View the complete picture at `/all-findings` on the dashboard:

- Every finding (yours and from AI agents) in one filterable table
- Status: verified, pending validation, rejected
- PoC status: passing, failing, not started
- Duplicate mapping: which AI findings correspond to which of yours
- Summary stats: total findings by status
- Expandable rows with full finding detail

---

## CLI Reference

All commands are run from within the project directory (or with `--project /path/to/project`).

| Command | What it does |
|---------|-------------|
| `solaudit init` | Initialize audit config — scope, commit, chain, docs URL |
| `solaudit analyze` | Run all analysis commands in parallel (stats, deps, access, state, calls, patterns, constraints), then surface |
| `solaudit stats` | Generate codebase statistics and test coverage |
| `solaudit deps` | Build contract dependency graph |
| `solaudit access` | Extract access control mapping (roles → functions, including inherited) |
| `solaudit state` | Generate state variable inventory |
| `solaudit calls` | Map external call surface (AST-based, Slither optional) |
| `solaudit patterns` | Detect security-relevant patterns (ORACLE, FLASH_LOAN, TEMPORAL, etc.) |
| `solaudit constraints` | Extract setter validation status and missing event emission |
| `solaudit surface` | Build attack surface summary cross-referencing all analysis |
| `solaudit context` | Assemble optimized AI context from codebase |
| `solaudit context --target Vault` | Context for a specific contract and its dependencies |
| `solaudit context --estimate` | Show token count without generating context |
| `solaudit dashboard` | Start local dashboard and open in browser |
| `solaudit dashboard --port 8080` | Start dashboard on a custom port |
| `solaudit claude` | Copy skills to `.claude/skills/` for Claude Code discovery |
| `solaudit update-skills` | Re-copy skill files from package (overwrites by default) |
| `solaudit update-skills --keep-custom` | Skip existing skill files instead of overwriting |

---

## Claude Code Skills Reference

Skills are invoked through Claude Code. Each skill has a recommended model — switch your Claude Code model before invoking skills that recommend Opus.

| Skill | Phase | Recommended Model | What it does |
|-------|-------|-------------------|-------------|
| `init-audit` | Setup | Sonnet | Runs init + analysis tools (parallel where possible) |
| `generate-overview` | 1.1 | Sonnet | Writes 2-3 paragraph protocol overview |
| `generate-diagram` | 1.3 | Sonnet | Creates Mermaid system architecture diagram |
| `generate-flows` | 1.4 | Opus | Creates Mermaid flow charts by user type and value paths |
| `identify-invariants` | 1.5 | Opus | Three-pass invariant identification (docs → code → compare) |
| `check-spec-conformance` | 1.6 | Opus | Verifies code matches docs, NatSpec, interfaces, ERC/EIPs |
| `generate-poc` | 3.1 | Opus | Validates issue reasoning, then writes and runs PoC test |
| `write-finding` | 3.2 | Sonnet | Writes structured finding to JSON + rendered markdown |
| `conformance-to-findings` | 3.3 | Sonnet | Batch-converts spec conformance deviations into validated findings |
| `run-ai-analysis` | 4.1 | Opus | Orchestrates all configured AI audit tools with preflight checks |
| `compare-findings` | 4.2 | Sonnet | Semantic dedup of your findings vs AI agent findings |
| `validate-ai-finding` | 4.3 | Opus | Interactively verifies a novel AI finding (PoC vs rational, severity adjustment) |

### Where Skills Live

Skills use Claude Code's native skill format, stored in `.claude/skills/<name>/SKILL.md`. They're copied there when you run `solaudit claude` or `solaudit init`.

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

**Customizing skills for a project:** You can edit any `SKILL.md` file in place. For example, you might add project-specific hints to the invariant identification skill, or adjust the PoC conventions to match an unusual test setup.

**Updating skills after upgrading SolAudit:**

```bash
solaudit update-skills              # re-copy and overwrite all skill files from the new package version
solaudit update-skills --keep-custom  # skip existing skill files to preserve your modifications
```

By default, `update-skills` overwrites existing skills with the latest version. Use `--keep-custom` to preserve any per-project modifications you've made.

### What Skills See

Every AI skill that reasons about code automatically reads all available analysis outputs from `.solaudit/` — not just the raw source code. This means by the time you invoke `identify-invariants`, the AI already has:

- The codebase statistics (nSLOC, ERCs, dependencies)
- The dependency graph (which contracts interact)
- The access control map (who can call what, with confidence levels)
- The state variable inventory (what's mutable, what's unused, who reads/writes)
- The external call surface (trust levels, return checking, reentrancy guards)
- Any previously generated outputs (overview, earlier invariants, spec conformance results)

Each skill layer builds on all previous layers. The later you invoke a skill in the workflow, the richer its context.

---

## Dashboard Pages

The dashboard runs locally at `http://localhost:3000` and auto-refreshes when output files change.

| Page | URL | What you see |
|------|-----|-------------|
| Home | `/` | Project info, AI overview, key stats |
| Progress | `/progress` | Weighted progress bar, contract review checklist, audit step indicators |
| Statistics | `/stats` | Per-contract metrics, test coverage, dependencies, ERCs |
| System Diagram | `/diagram` | Mermaid architecture diagram with zoom/pan |
| Flows | `/flows` | Mermaid flow charts with zoom/pan |
| Access Control | `/access` | Role → function matrix with "Show unprotected only" toggle |
| State Variables | `/state` | Variable inventory with reader/writer tracking |
| External Calls | `/calls` | Call surface with filterable Trust column |
| Functions | `/functions` | Aggregated function view with state/call cross-references |
| Invariants | `/invariants` | Identified invariants and doc/code discrepancies |
| Spec Conformance | `/conformance` | Code vs spec check results, deviations first |
| AI Reports | `/ai-reports` | Per-tool AI audit results with consensus badges |
| Report | `/report` | Verified findings with copy-to-clipboard (HackMD markdown format) |
| All Findings | `/all-findings` | Merged table of all findings + tracking data with filters |

---

## Understanding Confidence Levels

Every analysis output includes confidence metadata so you know how much to trust it.

**High confidence** — Derived from compiler artifacts or established static analysis tools (solc AST, Slither detectors, compiler storage layout). Treat as ground truth.

**Medium confidence** — Derived from AST pattern matching or known library detection (e.g., recognizing OpenZeppelin Ownable). Reliable for standard patterns, but may miss custom implementations.

**Low confidence** — Derived from naming heuristics (e.g., inferring a "keeper" role from a modifier named `onlyKeeper`). Use as a starting point, then verify manually.

On the dashboard, confidence is shown as colored badges. You can filter any analysis page by confidence level to quickly find entries that need your attention.

---

## Output Directory Structure

All SolAudit outputs live in a single directory inside the project (default: `.solaudit/`, configurable in `config.json`).

```
.solaudit/
├── config.json              # Audit scope, settings
├── overview.md              # AI-generated protocol overview
├── stats.json               # Codebase statistics and test coverage
├── deps.json                # Contract dependency graph
├── access-control.json      # Role → function mapping
├── state-vars.json          # State variable inventory
├── external-calls.json      # External call surface
├── patterns.json            # Security pattern flags (ORACLE, TEMPORAL, etc.)
├── constraints.json         # Setter validation and event analysis
├── attack-surface.json      # Attack surface summary
├── invariants.md            # Identified invariants
├── spec-conformance.json    # Spec vs code conformance checks
├── spec-conformance.md      # Rendered conformance report
├── diagrams/                # All Mermaid diagram files
│   ├── diagram.mmd          # System architecture diagram
│   └── flow-*.mmd           # Flow charts (one per flow)
├── progress.json            # Audit progress tracking (contract review state)
├── findings.json            # Canonical finding data (source of truth)
├── validations/             # Issue validation memos
│   ├── A001_memo.md
│   └── A003_memo.md
├── ai-results/              # AI audit tool outputs (per-tool subdirectories)
│   ├── solidity-auditor/
│   │   ├── raw-output.md    # Original tool output
│   │   ├── findings.json    # Normalized findings
│   │   └── metadata.json    # Run metadata
│   ├── sc-auditor/
│   │   ├── raw-output.md
│   │   ├── findings.json
│   │   └── metadata.json
│   ├── plamen/
│   │   ├── raw-output.md
│   │   ├── findings.json
│   │   ├── metadata.json
│   │   └── _scope.txt       # Generated scope file for plamen
│   └── <other-tool>/      # Additional tools write here
│       ├── raw-output.md
│       ├── findings.json
│       └── metadata.json
├── ai-status.json           # AI tool run status tracker
├── comparison.json          # Finding dedup results
└── tracking.json            # Master tracking table
```

You can change the output directory by setting `settings.output_dir` in `config.json` before running init.

---

## Scope vs. Full Project Access

When you initialize an audit, you specify which files are in scope. This is the set of contracts you're responsible for auditing — all analysis tools focus on these files.

But the entire project remains accessible. Claude Code can read out-of-scope contracts, run the existing test suite, compile everything, and leverage the project's test infrastructure when writing PoCs. The scope simply tells the tools where to focus their output.

```bash
# In-scope: these are what you're auditing
solaudit init --scope "src/core/Vault.sol,src/core/Strategy.sol,src/libraries/Math.sol"

# Still accessible: tests, mocks, deploy scripts, dependencies, interfaces
# Claude Code can read them all, forge can compile and run tests against them
```
