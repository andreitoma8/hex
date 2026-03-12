---
description: "Initialize a Solidity audit project and run the full analysis pipeline"
---

# Skill: Initialize Audit

**Recommended model:** Sonnet

You are helping set up a new Solidity audit project using SolAudit.

## Prerequisites
- The auditor has cloned or received the client project
- Node.js and npm are installed
- SolAudit CLI is installed (`npm install -g solaudit`)

## Steps

### 1. Gather Information
Ask the auditor for:
- **Project directory path** — where they cloned/received the client project (default: current directory)
- **Scope** — which files are in audit scope (glob pattern or explicit list, e.g., `"src/core/**/*.sol,src/Vault.sol"`)
- **Commit hash** — the specific commit being audited (default: HEAD)
- **Chain** — target chain (default: ethereum)
- **Documentation URL** — if available

### 2. Initialize
Run:
```bash
npx solaudit init --project "<path>" --scope "<scope>" --commit <hash> --chain <chain> --docs "<url>"
```

### 3. Verify Compilation
Check the output of init. If compilation verification failed, investigate:
- Run `forge build` or `npx hardhat compile` directly
- Check for missing dependencies (`forge install` or `npm install`)
- Verify the Solidity version matches the project config

### 4. Run Analysis Pipeline
Run the full analysis in a single command:
```bash
npx solaudit analyze
```

This runs stats → deps → access → state → calls in sequence, continuing on failure and reporting a summary at the end.

Notes on individual commands:
- **stats/deps**: These should always succeed (no external tool dependency).
- **access**: Will work without Slither but with limited Tier 2 data. Note the limitation.
- **state**: Will work without Slither/solc but with limited read/write and no storage layout data.
- **calls**: Requires Slither. If Slither is not installed, it will be skipped automatically.

### 5. Report Results
After all commands complete, summarize:
- Number of files and contracts in scope
- Total nSLOC
- Number of external/public functions
- Number of state variables
- Any warnings or limitations (missing tools, failed coverage, etc.)

### 6. Start the Dashboard
Offer to start the dashboard so the auditor can visualize the analysis:
```bash
npx solaudit dashboard
```
This opens the dashboard in the browser at `http://localhost:3000`, showing all generated data with live refresh.

Then ask: "Ready to generate the overview and diagrams? (These require AI analysis) You can also start the dashboard now with `solaudit dashboard` to visualize your analysis data."

## Output
The following files should now exist in the output directory:
- `config.json` — project configuration
- `stats.json` — codebase statistics
- `deps.json` — dependency graph
- `access-control.json` — access control mapping
- `state-vars.json` — state variable inventory
- `external-calls.json` — external call surface (if Slither available)
- `.claude/skills/` — Claude Code skill files
