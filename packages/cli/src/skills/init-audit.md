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

1. **Check `package.json` scripts** — look for `preinstall`, `postinstall`, `prepare`, `prebuild`, or `pretest` scripts that run arbitrary commands. Flag anything that shells out, downloads from URLs, or touches files outside the project. For any dependency with install hooks, cross-reference against npmjs.com advisories, Socket.dev, and Snyk vulnerability databases to check for known supply-chain compromises.
2. **Check Foundry `lib/` submodules** — inspect each `lib/*/foundry.toml` for custom build profiles, `fs_permissions`, `ffi = true`, or `script` entries. These can execute arbitrary code during `forge build` or `forge test`.
3. **Parse the root `foundry.toml`** in detail:
   - **`ffi = true`** in any profile: flag as **HIGH RISK** — FFI allows Forge to execute arbitrary system commands during build and test. This is the single most dangerous Foundry setting.
   - **`fs_permissions`**: flag overly broad access such as `[{access = "read-write", path = "./"}]` or permissions targeting parent directories (`../`). Read-only on `./src` or `./out` is normal; read-write on root or parent is suspicious.
   - **Profile overrides**: check `[profile.ci]`, `[profile.default]`, and any custom profiles for settings that differ from the main profile (different `evm_version`, `optimizer_runs`, `solc_version`). Flag `evm_version` mismatches against the target chain in `config.json`.
   - **`script` entries or `[rpc_endpoints]`**: flag hardcoded RPC URLs or script configurations that could execute during testing.
4. **Validate `remappings.txt`** against actual `lib/` contents:
   - For each remapping entry (e.g., `@openzeppelin/=lib/openzeppelin-contracts/`), verify the target directory actually exists in `lib/`.
   - Flag **shadowed paths**: two remappings that resolve to the same directory (potential import confusion).
   - Flag **mismatched paths**: remappings pointing to directories that don't exist, or pointing to unexpected locations different from the package they claim to represent.
   - Flag **hijack vectors**: a remapping that shadows a well-known package name but points to a different library (e.g., `@openzeppelin/=lib/malicious-oz/`). Reference: Foundry issues #1855, #7080 document remapping hijack vectors.
5. **Check Hardhat config** — look for unknown plugins, tasks that shell out, or custom compiler configurations that download binaries from non-standard sources.
6. **Check for suspicious files** — scripts in root (`*.sh`, `*.py`, `Makefile` targets), `.github/` workflow files that might run during local dev.

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
3. **Auto-detect library versions and cross-reference advisories**:
   - For each well-known library in `lib/`, read the submodule commit: `git -C lib/<pkg> rev-parse HEAD` or check `lib/<pkg>/package.json` for version.
   - **OpenZeppelin**: Identify version. Check against GitHub Security Advisories for openzeppelin-contracts. Known issues: < 4.9.3 (Governor vulnerability), < 4.7.0 (ERC-1967 vulnerability).
   - **Solmate**: Flag with **deprecation warning** — Solmate is no longer actively maintained. Recommend migration to Solady. Specifically flag `SafeTransferLib` for missing recipient code-size check (transfers to non-existent contracts silently succeed).
   - **Solady**: Identify version. Flag versions before the `SafeTransferLib` code-size check fix if the project relies on transfer safety.
   - **PRBMath**: Check for versions with known overflow edge cases.
   - For any library with a known advisory, include the advisory URL and affected version range in the report.
4. **Check for unused dependencies** — packages in `lib/` or `node_modules/` that are NOT imported by any scope file. These shouldn't be there and could contain malicious code that runs during compilation.
5. **Spot-check unknown packages** — for any dependency that isn't a recognized library, read a few of its source files and look for suspicious patterns: inline assembly with `selfdestruct`, `delegatecall` to hardcoded addresses, obfuscated code, or functions that send ETH/tokens to hardcoded addresses.

#### C. Output a dependency safety summary

Classify each dependency into one of three tiers:

- **Safe** — well-known, up-to-date, widely used
- **Review recommended** — unknown package, outdated version, unusual source, or unpinned version
- **Warning** — known vulnerability, typosquat candidate, suspicious build scripts, or FFI enabled

**If any warnings are found, clearly flag them and ask the auditor to confirm before proceeding to compilation and analysis.**

#### D. Scan for secrets and editor safety

1. **Scan for plaintext secrets** — check `.env`, `.env.local`, `.env.production`, `.env.development`, and any `*.env` files for:
   - Private key patterns: hex strings matching `0x[a-fA-F0-9]{64}` or unquoted 64-character hex
   - Mnemonic phrases: sequences of 12 or more dictionary words (BIP-39 wordlist)
   - API keys: patterns like `ETHERSCAN_API_KEY=`, `ALCHEMY_KEY=`, `INFURA_KEY=` with non-placeholder values
   - If found: warn the auditor that the project contains plaintext secrets. Do NOT log the actual secret values.
2. **Scan `.vscode/extensions.json`** (if it exists) for untrusted extension recommendations:
   - Safe publishers: `JuanBlanco` (solidity), `NomicFoundation` (hardhat-solidity), `tintinweb` (solidity-visual-auditor), `esbenp` (prettier)
   - Flag any extension recommendation from an unknown publisher — malicious VS Code extensions can exfiltrate code, inject backdoors, or steal credentials.

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
