# SolAudit Demo Guide

Step-by-step demo of all SolAudit functionality using Claude Code.

## Setup

1. Pick any Foundry project with Solidity contracts. If you don't have one handy:
   ```bash
   git clone https://github.com/transmissions11/solmate.git
   cd solmate
   ```

2. Install skills (works before init — no config required):
   ```bash
   solaudit claude
   ```

3. Open Claude Code:
   ```bash
   claude
   ```

## Demo Flow (all inside Claude Code)

### Phase 1 — Initialize & Analyze

```
/init-audit
```

It will ask you for scope, commit, chain, etc. For solmate something like `--scope "src/**/*.sol"` works. This runs init + a single `solaudit analyze` command that executes all eight analysis commands (stats, deps, access, state, calls, patterns, constraints, surface) in sequence, continuing on failure and reporting results.

### Open the Dashboard

Once init and analysis complete, open a separate terminal and start the dashboard:
```bash
solaudit dashboard
```
Opens `http://localhost:3000` with live visualization of all outputs. Keep it open — every page fills in automatically as you progress through the audit.

Key pages:
- `/progress` — Weighted progress bar, contract review checklist with nSLOC weighting, audit step indicators, findings KPI
- `/stats` — Segmented control: Summary (KPI cards + ERC badges), Per-Contract, Coverage, Dependencies
- `/access` — Segmented control: All / State-Changing / Read-Only / Unprotected, with role cards below
- `/calls` — External call surface with filter pills for Trust and Call Type
- `/functions` — Aggregated function view with filter pills and compact 36px rows
- `/diagram` + `/flows` — Full-bleed canvas with auto-fit zoom, floating controls, loading spinner, and legend overlay
- `/invariants` — Tabbed layout (From Docs | From Code | Discrepancies | Assumptions) with segmented control
- `/conformance` — Status filter pills for quick filtering (DEVIATES, PARTIAL, etc.)
- `/ai-reports` — Per-tool AI audit results with tabs, severity summary, expandable findings, consensus badges, and run status indicators
- `/report` — Card-per-finding layout with severity accent borders, horizontal severity bar chart, and copy-to-clipboard button (HackMD markdown format)
- `/all-findings` — Merged table with filter pills (severity, status, including unverified) and expandable details

The dashboard has a fixed sidebar with always-visible theme toggle (Light / Dark / System). Apple-inspired design with consistent spacing, typography scale, and semantic color system. Code reference modals support Escape key to close.

### Phase 2 — Understand the Protocol

```
/generate-overview
```
Writes a protocol overview to `.solaudit/overview.md`.

```
/generate-diagram
```
Generates a color-coded Mermaid architecture diagram with semantic symbols, zone groupings, interaction-typed edge labels (delegatecall, external call, access-controlled), overview header, and a visual legend. Max ~15 nodes per diagram — large protocols are split automatically.

```
/generate-flows
```
Generates Mermaid flow charts with distinct node shapes (stadium for start/end, cylinder for state changes, rhombus for decisions), swim-lane subgraphs, and plain-English labels. Every decision shows both success and revert paths. Only covers in-scope contracts. Includes overview header and visual legend. Max ~15 nodes per flow.

```
/identify-invariants
```
Three-pass analysis: docs, code, comparison. Outputs to `.solaudit/invariants.md`.

```
/check-spec-conformance
```
Cross-references code against docs, NatSpec, interfaces, and ERCs.

### Phase 3 — Findings

Point Claude at a potential issue in the code:
```
/generate-poc for the possible rounding error in share calculation in <file>
```
Validates the issue and writes a runnable test.

```
/write-finding for the rounding error issue
```
Writes a structured finding with severity, description, and recommendation.

After running `/check-spec-conformance`, you can batch-convert deviations:
```
/conformance-to-findings
```
Processes all DEVIATES and PARTIAL conformance items, validates each, and writes findings or rejection memos.

### Phase 4 — AI Cross-check

Run all configured AI audit tools with a single command:
```
/run-ai-analysis
```
Starts with a checkbox-style tool selection prompt — pick which AI tools to run (solidity-auditor, sc-auditor, plamen). Then runs preflight checks with type-aware auto-install: skill-file tools (solidity-auditor) clone and copy SKILL.md, MCP server tools (sc-auditor) clone/build/register in `.mcp.json`, plamen offers auto-install if not found (clones repo + copies files to `~/.claude/`). Non-plamen skill tools (solidity-auditor, sc-auditor) launch **in parallel** as separate subagents, isolating their large outputs from the orchestrator. Plamen runs after the parallel tools complete (it needs the orchestrator context for slash commands). The dashboard shows live "running" status with a pulsing indicator while tools execute, and progressive results appear as each tool finishes. After all tools complete, the orchestrator normalizes findings into `.solaudit/ai-results/<tool>/findings.json` and batch-writes them to tracking as `unverified`. Then `/compare-findings` runs automatically to deduplicate and assess novelty.

To re-run deduplication manually after changes:
```
/compare-findings
```

For any novel finding it surfaces, validate interactively (asks whether you want a PoC or rational verification, and offers severity adjustment after writing):
```
/validate-ai-finding for <finding-id>
```

## Key Points

- `/init-audit` works as the very first thing in Claude Code (no chicken-and-egg problem)
- Open the dashboard right after init — it updates live as you progress
- Every skill builds on all previous analysis outputs — later skills have richer context
- Skills are native slash commands, no need to "read the skill file and follow it"
- `/run-ai-analysis` runs each AI tool in its own subagent to keep context clean
- `solaudit update-skills` updates skills after a package upgrade (overwrites by default, use `--keep-custom` to preserve modifications)
