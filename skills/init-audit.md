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
Execute commands in sequence:
```bash
npx solaudit stats
npx solaudit deps
npx solaudit access
npx solaudit state
npx solaudit calls
```

If any command fails:
- **stats/deps**: These should always succeed (no external tool dependency). Investigate the error.
- **access**: Will work without Slither but with limited Tier 2 data. Note the limitation.
- **state**: Will work without Slither/solc but with limited read/write and no storage layout data.
- **calls**: Requires Slither. If Slither is not installed, skip and note for the auditor.

### 5. Report Results
After all commands complete, summarize:
- Number of files and contracts in scope
- Total nSLOC
- Number of external/public functions
- Number of state variables
- Any warnings or limitations (missing tools, failed coverage, etc.)

Then ask: "Ready to generate the overview and diagrams? (These require AI analysis)"

## Output
The following files should now exist in the output directory:
- `config.json` — project configuration
- `stats.json` — codebase statistics
- `deps.json` — dependency graph
- `access-control.json` — access control mapping
- `state-vars.json` — state variable inventory
- `external-calls.json` — external call surface (if Slither available)
- `skills/` — copied skill files
