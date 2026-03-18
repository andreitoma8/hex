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

It will ask you for scope, commit, chain, etc. For solmate something like `--scope "src/**/*.sol"` works. This runs init + a single `solaudit analyze` command that executes all five analysis commands (stats, deps, access, state, calls) in sequence, continuing on failure and reporting results.

### Phase 2 — Understand the Protocol

```
/generate-overview
```
Writes a protocol overview to `.solaudit/overview.md`.

```
/generate-diagram
```
Generates a color-coded Mermaid architecture diagram with semantic symbols (🏦 Vault, 💰 Token, 🔮 Oracle, etc.), zone groupings, interaction-typed edge labels (delegatecall, external call, access-controlled), overview header, and a visual legend. Max ~15 nodes per diagram — large protocols are split automatically.

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

Drop any AI audit report into `.solaudit/ai-results/` (even a dummy JSON), then:

```
/compare-findings
```
Semantically deduplicates your findings against the AI results.

For any novel finding it surfaces:
```
/validate-ai-finding for <finding-id>
```

### Dashboard

At any point, run in a separate terminal:
```bash
solaudit dashboard
```
Opens `http://localhost:3000` with live visualization of all outputs.

Key pages:
- `/progress` — Weighted progress bar, contract review checklist with nSLOC weighting, audit step indicators, findings KPI
- `/report` — Card-per-finding layout with severity accent borders, horizontal severity bar chart, and copy-to-clipboard button (HackMD markdown format)
- `/all-findings` — Merged table with filter pills (severity, status) and expandable details
- `/stats` — Segmented control: Summary (KPI cards + ERC badges), Per-Contract, Coverage, Dependencies
- `/access` — Segmented control: All / State-Changing / Read-Only / Unprotected, with role cards below
- `/calls` — External call surface with filter pills for Trust and Call Type
- `/functions` — Aggregated function view with filter pills and compact 36px rows
- `/invariants` — Tabbed layout (From Docs | From Code | Discrepancies | Assumptions) with segmented control
- `/conformance` — Status filter pills for quick filtering (DEVIATES, PARTIAL, etc.)
- `/diagram` + `/flows` — Full-bleed canvas with auto-fit zoom, floating controls, loading spinner, and legend overlay

The dashboard has a fixed sidebar with always-visible theme toggle (Light / Dark / System). Apple-inspired design with consistent spacing, typography scale, and semantic color system. Code reference modals support Escape key to close.

## Key Points

- `/init-audit` works as the very first thing in Claude Code (no chicken-and-egg problem)
- Every skill builds on all previous analysis outputs — later skills have richer context
- Skills are native slash commands, no need to "read the skill file and follow it"
- `solaudit update-skills` updates skills after a package upgrade (overwrites by default, use `--keep-custom` to preserve modifications)
