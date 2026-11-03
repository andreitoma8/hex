# Hex Demo Guide

A walk through one engagement, start to finish, inside Claude Code with the dashboard open beside it.

## Setup

```bash
git clone https://github.com/transmissions11/solmate.git && cd solmate   # or any Foundry project
npm install -g hex-audit
hex claude     # skills + the Hex MCP server in .mcp.json
claude         # approve the "hex" MCP server when asked
```

## 1. Pre-review: `/init-audit`

```
/init-audit
```

It asks for the scope (`src/**/*.sol` works for solmate), the commit, the chain and the docs. Then:

1. **Safety gate.** Install hooks, `ffi`, remappings and secrets are checked before anything compiles.
2. **Exact facts.** `hex analyze` compiles into `.hex/.cache` and writes `facts.json` from the compiler AST. Try it yourself:
   ```bash
   npx --no-install hex facts query callers ERC20.transferFrom
   npx --no-install hex facts query layout ERC4626
   ```
3. **Agents in waves.** Readers model each cluster in parallel without seeing each other, and a docs reader extracts the promises without seeing the code. A synthesizer writes the protocol model and proposed invariants, then skeptics verify every claim against the code. Watch the claims turn **verified** or **contested** on the Model page.
4. **Diagrams.** Custody, privilege, accounting, state-machine and sequence views, each with a takeaway, rendered in Excalidraw.
5. **Conformance.** Documentation, NatSpec and ERC deviations become Potential cards.

The dashboard opens at `http://localhost:3000` on **Today**: progress, the riskiest unread functions, and cards to triage.

**Differential variant.** Answer *Differential* and give a base commit (and optionally the previous audit's `.hex/` folder or report). To demo it on any repo: `hex init --mode diff --base HEAD~5 --scope "src/**/*.sol"`. The Changes page shows the compiler storage-layout diff slot by slot and every impacted flow.

## 2. Model: accept invariants

On **Model**, read the diagrams (edit them if you like; edits are kept across rebuilds) and accept the invariants that really hold. You can also do it from the CLI with `npx --no-install hex invariant accept INV-001 INV-003`. Click "Use in report" on the diagrams worth showing the client.

## 3. Review

Open **Review**. Pick a function from *Blind spots*: the code sits in the middle, with facts, notes and cards in the inspector. Mark it with `r` / `q` / `c`. Back in the terminal, ask:

```
why is this safe?
```

Claude calls `hex_focus` and knows which function you have selected.

**Diane.** Hit Record on the Review page, narrate a function ("deposit looks fine, done with it; not sure about the rounding in previewWithdraw"), stop, then run `/diane`. Diane checks your claims against the code, notes corrections, ticks `deposit` cleared and `previewWithdraw` questioned, and tells you exactly what she ticked.

## 4. Find

```
/write-finding for the rounding issue in previewWithdraw
/ai-audit
/fuzz
```

- `/ai-audit` asks for the model and the number of passes, then 12 agents hunt with your accepted invariants and triage rules in their brief. Findings land on the **Board**, deduped; leads land in the notes. `/prevalidate` then runs automatically: watch cards move to Verified (PoC passed) or Rejected (two refuters agreed) with an *auto* chip you can revert.
- `/fuzz` turns accepted invariants into an Echidna/Medusa/Foundry suite; a broken invariant becomes a card with its repro test.

## 5. Validate and sync

```
/validate-finding H-004
/validate-all-findings
/sync-issues
```

Validation writes a PoC by default and records it on the card. Rejecting something as by design offers to add a triage rule, so the next AI run stops raising it. `/sync-issues` pushes verified cards to GitHub; from then on GitHub is the source of truth.

## 6. Fix review and report

When the client sends fixes:

```
/fix-review
/generate-report
```

`/fix-review` re-runs every PoC at the fix commit. A PoC that used to pass and now fails proves the fix. Agents judge the rest, and fix-commit code that no finding explains gets flagged for review. After one confirmation it updates the Status and Update-from-the-client fields on GitHub. `/generate-report` writes the LaTeX sections, with the chosen diagrams as figures in the System Overview.
