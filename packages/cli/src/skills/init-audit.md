---
description: "Initialize a Solidity audit project and run the full analysis pipeline"
---

# Skill: Initialize Audit

**Recommended model:** Sonnet

You are helping set up a new Solidity audit project using Hex.

## Prerequisites
- The auditor has cloned or received the client project
- Node.js and npm are installed
- Hex CLI is installed (`npm install -g hex`)

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
npx hex init --project "<path>" --scope "<scope>" --commit <hash> --chain <chain> --docs "<url>"
```

### 3. Audit Dependencies

**This step MUST happen before compilation** — build scripts and npm install hooks are a primary supply-chain attack vector. Audit projects come from external clients and could contain malicious dependencies that target the auditor's machine during compilation or introduce vulnerabilities into the audited code.

#### A. Scan for build-time threats (auditor machine safety)

Perform these checks **before** running `forge build`, `npm install`, or any compilation command:

1. **Check `package.json` scripts** — look for `preinstall`, `postinstall`, `prepare`, or `prebuild` scripts that run arbitrary commands. Flag anything that shells out, downloads from URLs, or touches files outside the project.
2. **Check Foundry `lib/` submodules** — inspect each `lib/*/foundry.toml` for custom build profiles, `fs_permissions`, `ffi = true`, or `script` entries. These can execute arbitrary code during `forge build` or `forge test`.
3. **Check Hardhat config** — look for unknown plugins, tasks that shell out, or custom compiler configurations that download binaries from non-standard sources.
4. **Check for suspicious files** — scripts in root (`*.sh`, `*.py`, `Makefile` targets), `.github/` workflow files that might run during local dev, or `remappings.txt` pointing to unexpected paths.

**If any build-time threats are found: STOP and warn the auditor before compilation.** Do not proceed with `forge build` or `npm install` until the auditor has reviewed and approved.

#### B. Audit Solidity dependencies (code-level safety)

After confirming build safety (or after the auditor approves):

1. **Read `stats.json`** `dependencies` array (package, version, imports) and scan `lib/` or `node_modules/` on disk.
2. **For each dependency**, evaluate:
   - **Is it well-known?** (OpenZeppelin, Solmate, Solady, PRBMath, etc. are trusted. Unknown packages need scrutiny.)
   - **Is it a typosquat or unofficial fork?** (e.g., `@openzepplin/contracts` vs `@openzeppelin/contracts`)
   - **Is the version outdated?** Flag if a significantly newer version exists with security fixes.
   - **Are there known vulnerabilities?** (e.g., OpenZeppelin < 4.9.3 Governor vulnerability, Solmate ERC-4626 rounding issues in early versions)
   - **Version pinning** — `lib/` (Foundry git submodule) is pinned by commit, which is good. `node_modules/` with `^` ranges could resolve to different versions.
3. **Check for unused dependencies** — packages in `lib/` or `node_modules/` that are NOT imported by any scope file. These shouldn't be there and could contain malicious code that runs during compilation.
4. **Spot-check unknown packages** — for any dependency that isn't a recognized library, read a few of its source files and look for suspicious patterns: inline assembly with `selfdestruct`, `delegatecall` to hardcoded addresses, obfuscated code, or functions that send ETH/tokens to hardcoded addresses.

#### C. Output a dependency safety summary

Classify each dependency into one of three tiers:

- **Safe** — well-known, up-to-date, widely used
- **Review recommended** — unknown package, outdated version, unusual source, or unpinned version
- **Warning** — known vulnerability, typosquat candidate, suspicious build scripts, or FFI enabled

**If any warnings are found, clearly flag them and ask the auditor to confirm before proceeding to compilation and analysis.**

### 4. Verify Compilation
Check the output of init. If compilation verification failed, investigate:
- Run `forge build` or `npx hardhat compile` directly
- Check for missing dependencies (`forge install` or `npm install`)
- Verify the Solidity version matches the project config

### 5. Run Analysis Pipeline
Run the full analysis in a single command:
```bash
npx hex analyze
```

This runs stats → deps → access → state → calls in sequence, continuing on failure and reporting a summary at the end.

Notes on individual commands:
- **stats/deps**: These should always succeed (no external tool dependency).
- **access**: Will work without Slither but with limited Tier 2 data. Note the limitation.
- **state**: Will work without Slither/solc but with limited read/write and no storage layout data.
- **calls**: Requires Slither. If Slither is not installed, it will be skipped automatically.

### 6. Report Results
After all commands complete, summarize:
- Number of files and contracts in scope
- Total nSLOC
- Number of external/public functions
- Number of state variables
- Any warnings or limitations (missing tools, failed coverage, etc.)

### 7. Start the Dashboard
Offer to start the dashboard so the auditor can visualize the analysis:
```bash
npx hex dashboard
```
This opens the dashboard in the browser at `http://localhost:3000`, showing all generated data with live refresh.

Then ask: "Ready to generate the overview and diagrams? (These require AI analysis) You can also start the dashboard now with `hex dashboard` to visualize your analysis data."

## Output
The following files should now exist in the output directory:
- `config.json` — project configuration
- `stats.json` — codebase statistics
- `deps.json` — dependency graph
- `access-control.json` — access control mapping
- `state-vars.json` — state variable inventory
- `external-calls.json` — external call surface (if Slither available)
- `.claude/skills/` — Claude Code skill files
