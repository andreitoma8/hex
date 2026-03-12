# SolAudit — Technical Specification

## 1. Executive Summary

SolAudit is a toolkit for Solidity smart contract auditors conducting private audits. It combines deterministic CLI tools, Claude Code skills, and a local web dashboard to support a four-phase audit workflow: Understand → Review → Findings → Re-audit.

**Design philosophy:** Deterministic processes get dedicated tools; AI-assisted processes get Claude Code skills that know how to use those tools. The dashboard is a read-only visualization layer. Claude Code is the orchestration layer.

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                      AUDITOR WORKFLOW                        │
│                                                             │
│  ┌──────────────┐   ┌──────────────┐   ┌────────────────┐  │
│  │  Claude Code  │   │   VS Code    │   │   Dashboard    │  │
│  │  (orchestrator│   │  (manual     │   │   (localhost)   │  │
│  │   + skills)   │   │   review)    │   │   read-only    │  │
│  └──────┬───────┘   └──────┬───────┘   └───────┬────────┘  │
│         │                  │                    │            │
│         ▼                  ▼                    ▼            │
│  ┌─────────────────────────────────────────────────────┐    │
│  │         Full Client Project Directory (local)        │    │
│  │  The auditor clones or receives the full project.    │    │
│  │  Claude Code has access to EVERYTHING (src, test,    │    │
│  │  scripts, lib, config). Scope defines which files    │    │
│  │  are the audit target, but all files are available   │    │
│  │  as context, for building, and for running tests.    │    │
│  │                                                     │    │
│  │  project-root/                                      │    │
│  │  ├── src/               ← full source (not just scope)│  │
│  │  ├── test/              ← existing test suite        │    │
│  │  ├── lib/               ← dependencies              │    │
│  │  ├── script/            ← deploy scripts            │    │
│  │  ├── foundry.toml       ← project config            │    │
│  │  ├── ...                ← any other project files    │    │
│  │  │                                                  │    │
│  │  └── <config_dir>/      ← configurable output dir   │    │
│  │      ├── config.json    ← scope, settings           │    │
│  │      ├── overview.md    ← AI-generated overview      │    │
│  │      ├── stats.json     ← codebase statistics        │    │
│  │      ├── diagram.excalidraw ← system diagram         │    │
│  │      ├── flows.excalidraw   ← flow charts            │    │
│  │      ├── access-control.json← role→function mapping  │    │
│  │      ├── state-vars.json    ← state variable inventory│   │
│  │      ├── external-calls.json← external call surface  │    │
│  │      ├── invariants.md      ← identified invariants  │    │
│  │      ├── spec-conformance.json ← spec vs code checks │    │
│  │      ├── spec-conformance.md   ← rendered conformance│    │
│  │      ├── annotations.json   ← extracted @audit tags  │    │
│  │      ├── findings.json      ← canonical finding data  │    │
│  │      ├── findings.md        ← rendered findings       │    │
│  │      ├── validations/       ← issue validation memos  │    │
│  │      ├── ai-results/        ← external AI agent outputs│  │
│  │      │   ├── nethermind.json                         │    │
│  │      │   └── zellic.json                             │    │
│  │      ├── comparison.json    ← finding dedup/comparison│   │
│  │      └── tracking.json      ← master tracking table  │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

### 2.1 Component Responsibilities

| Component | Role | Reads | Writes |
|-----------|------|-------|--------|
| **CLI Tools** | Deterministic analysis (parsing, stats, extraction) | Full project (scope files for analysis, all files for dependency resolution) | JSON/Excalidraw outputs to `<config_dir>/` |
| **Claude Code Skills** | AI reasoning, orchestration, calling CLI tools | Full project (source, tests, config, dependencies) + tool outputs | Markdown, JSON, PoC test files |
| **VS Code** | Manual code review with annotations | Source files | `@audit` comments inline in source |
| **Dashboard** | Visualization, read-only browsing | All files in `<config_dir>/` | Nothing |

### 2.2 Tech Stack

| Layer | Technology |
|-------|------------|
| CLI Tools | TypeScript (compiled to Node.js) as orchestration/normalization layer. Wraps `solc`, `slither`, `forge` for analysis — does NOT reimplement their semantics. |
| Claude Code Skills | Markdown skill files with structured prompts |
| Dashboard | Next.js (TypeScript), running locally via `npm run dev` |
| Diagrams | Excalidraw JSON format (rendered in dashboard and openable in Excalidraw) |
| Package manager | npm monorepo (tools + dashboard in one repo) |
| Required external tools | `solc` (Solidity compiler), `slither` (static analysis), `forge` (Foundry test runner) — must be installed separately |

### 2.3 Design Principle: Confidence + Provenance on All Analysis Outputs

Every analysis output should carry metadata about how confident the tool is and where the data came from. Nothing should read like ground truth unless it actually is. This makes the system trustworthy in practice — the auditor always knows when to trust an output and when to double-check.

**Standard metadata fields on analysis entries:**

| Field | Type | Purpose |
|-------|------|---------|
| `confidence` | `"high"` / `"medium"` / `"low"` | How reliable is this data point? |
| `derived_from` | `"solc-ast"` / `"slither"` / `"forge"` / `"regex"` / `"heuristic"` / `"compiler-layout"` / `"manual"` | What tool or method produced this? |
| `evidence` | `{ file, line_start, line_end, snippet }` | Where in the source code does this come from? |
| `warnings` | `string[]` | Caveats, edge cases, or reasons to doubt this entry |

**Confidence definitions:**
- **High:** Derived from compiler artifacts or well-tested static analysis (solc AST, Slither detectors, compiler storage layout). Effectively ground truth.
- **Medium:** Derived from AST pattern matching or known library detection (e.g., recognizing OpenZeppelin `Ownable` inheritance). Reliable for common patterns, may miss custom implementations.
- **Low:** Derived from naming heuristics or structural inference (e.g., guessing a modifier named `onlyKeeper` implies a "keeper" role). Useful as a starting point but requires manual verification.

This applies to `access-control.json`, `state-vars.json`, `external-calls.json`, and any other tool output that makes claims about code semantics. Stats (`stats.json`) are purely counting-based and do not need confidence metadata.

### 2.4 Design Principle: Wrap Battle-Tested Tools, Don't Reinvent

TypeScript is the orchestration and normalization layer. For semantic analysis of Solidity code, the toolkit should lean heavily on existing tools that have years of hardening:

| Need | Preferred Source | Avoid |
|------|-----------------|-------|
| AST parsing | `solc --ast-json`, `@solidity-parser/parser` | Custom regex-based parsing |
| Function visibility, modifiers | Slither `--print function-summary` | Manual AST traversal for complex inheritance |
| External call detection | Slither `--print call-graph`, `--detect reentrancy-*` | Custom call-site detection |
| Storage layout | `solc --storage-layout` (compiler artifact) | Manual slot calculation |
| Read/write analysis | Slither `--print data-dependency` | Custom SLOAD/SSTORE pattern matching |
| Test coverage | `forge coverage --report lcov` | Custom instrumentation |

**The role of custom TypeScript code is:**
- Parsing and normalizing output from these tools into the SolAudit JSON schemas
- Adding confidence and provenance metadata
- Filling gaps where no existing tool covers the need (e.g., annotation extraction, context assembly)
- Orchestrating multiple tool runs and merging their outputs

**The role of custom TypeScript code is NOT:**
- Re-implementing static analysis that Slither already does well
- Computing storage layouts from scratch
- Building a full Solidity type system

---

## 3. Data Model

### 3.1 Configuration — `config.json`

```jsonc
{
  "version": "1.0",
  "project": {
    "name": "Protocol Name",
    "project_dir": "/path/to/project-root",  // full project directory (cloned or received from client)
    "commit": "abc123...",
    "chain": "ethereum",
    "solidity_version": "0.8.20",
    "docs_url": "https://docs.protocol.xyz",
    "scope": [
      // Explicit list of files that are the audit target.
      // These are the files you're responsible for auditing.
      // All OTHER files in the project are still available as
      // context, for compilation, and for running tests.
      "src/Core.sol",
      "src/Vault.sol",
      "src/libraries/Math.sol"
    ],
    "exclude": [
      "src/mocks/",
      "src/test/"
    ]
  },
  "settings": {
    "output_dir": ".solaudit",  // configurable, relative to project_dir
    "ai_model": "claude-sonnet-4-20250514",
    "finding_template": "default"
  }
}
```

**Key distinction: scope vs. full project access.**
- `scope` defines which files are the audit target — stats, access control, state variables, and findings are generated for these files.
- The full `project_dir` is available to Claude Code for everything else: reading out-of-scope contracts that in-scope contracts depend on, running the existing test suite, compiling with `forge build`, and leveraging the project's existing test infrastructure for PoCs.
- Tools like `solaudit stats` and `solaudit access` analyze scope files but resolve imports and inheritance across the full project.
- `solaudit context` includes scope files in full and may include summaries of out-of-scope dependencies.

### 3.2 Stats — `stats.json`

```jsonc
{
  "generated_at": "2025-03-09T12:00:00Z",
  "totals": {
    "files": 12,
    "contracts": 8,
    "interfaces": 3,
    "libraries": 2,
    "abstract_contracts": 1,
    "total_lines": 2847,
    "nsloc": 1923,
    "comment_lines": 412,
    "blank_lines": 512,
    "assembly_lines": 34
  },
  "solidity_version": "0.8.20",
  "erc_eip_usage": ["ERC20", "ERC4626", "EIP-2612"],
  "dependencies": [
    { "package": "@openzeppelin/contracts", "version": "5.0.0", "imports": 6 },
    { "package": "solmate", "version": "6.2.0", "imports": 2 }
  ],
  "test_coverage": {
    // OPTIONAL — only populated if `forge coverage` (or equivalent) succeeds.
    // Many private audit projects arrive with broken or incomplete tests.
    // If coverage cannot be produced, this field is null and stats generation
    // still succeeds cleanly.
    "status": "available",  // "available" | "failed" | "skipped"
    "failure_reason": null, // e.g., "forge coverage exited with code 1: compilation error in test/Broken.t.sol"
    "overall_line_pct": 78.4,
    "overall_branch_pct": 62.1,
    "per_contract": [
      {
        "contract": "Vault",
        "file": "src/Vault.sol",
        "line_pct": 85.2,
        "branch_pct": 70.0,
        "uncovered_lines": [156, 157, 203, 204, 205]
      },
      {
        "contract": "Strategy",
        "file": "src/Strategy.sol",
        "line_pct": 62.0,
        "branch_pct": 45.5,
        "uncovered_lines": [34, 67, 68, 89, 90, 91, 112]
      }
    ]
  },
  "per_contract": [
    {
      "file": "src/Vault.sol",
      "contract": "Vault",
      "type": "contract",
      "nsloc": 342,
      "functions": 18,
      "external_functions": 12,
      "public_functions": 3,
      "internal_functions": 3,
      "modifiers": 2,
      "events": 5,
      "errors": 3,
      "assembly_lines": 12,
      "inherits": ["ERC4626", "Ownable", "ReentrancyGuard"]
    }
  ]
}
```

### 3.3 Access Control — `access-control.json`

The access control map uses a two-tier approach: first surface raw facts (functions, modifiers, visibility), then layer on role interpretations with explicit confidence.

```jsonc
{
  "functions": [
    // Tier 1: Raw facts — always high confidence
    {
      "contract": "Vault",
      "function": "setFee",
      "visibility": "external",
      "modifiers": ["onlyOwner"],
      "evidence": { "file": "src/Vault.sol", "line_start": 45, "line_end": 48 }
    },
    {
      "contract": "Vault",
      "function": "harvest",
      "visibility": "external",
      "modifiers": ["onlyKeeper"],
      "evidence": { "file": "src/Vault.sol", "line_start": 102, "line_end": 115 }
    },
    {
      "contract": "Vault",
      "function": "deposit",
      "visibility": "external",
      "modifiers": ["nonReentrant"],
      "evidence": { "file": "src/Vault.sol", "line_start": 130, "line_end": 155 }
    }
  ],
  "roles": [
    // Tier 2: Role interpretations — confidence varies
    {
      "role": "owner",
      "description": "Contract deployer / admin",
      "confidence": "high",
      "derived_from": "slither",
      "reasoning": "Contract inherits OpenZeppelin Ownable; onlyOwner modifier resolves to Ownable.sol owner() check",
      "modifier": "onlyOwner",
      "functions": [
        { "contract": "Vault", "function": "setFee" },
        { "contract": "Vault", "function": "pause" }
      ],
      "warnings": []
    },
    {
      "role": "keeper",
      "description": "Automated bot role (inferred from modifier name)",
      "confidence": "low",
      "derived_from": "heuristic",
      "reasoning": "Modifier 'onlyKeeper' uses naming convention but is a custom modifier — actual auth logic needs manual review",
      "modifier": "onlyKeeper",
      "functions": [
        { "contract": "Vault", "function": "harvest" }
      ],
      "warnings": [
        "Custom modifier — role semantics inferred from name only",
        "Verify modifier body to confirm actual access check"
      ]
    },
    {
      "role": "anyone",
      "description": "No access restriction",
      "confidence": "high",
      "derived_from": "solc-ast",
      "reasoning": "External/public functions with no access-control modifiers",
      "modifier": null,
      "functions": [
        { "contract": "Vault", "function": "deposit" },
        { "contract": "Vault", "function": "withdraw" }
      ],
      "warnings": []
    }
  ]
}
```

### 3.4 State Variable Inventory — `state-vars.json`

```jsonc
{
  "variables": [
    {
      "contract": "Vault",
      "name": "totalAssets",
      "type": "uint256",
      "visibility": "public",
      "mutability": "mutable",
      "evidence": { "file": "src/Vault.sol", "line_start": 23, "line_end": 23 },
      "written_by": {
        "functions": ["deposit", "withdraw", "harvest"],
        "confidence": "medium",
        "derived_from": "slither",
        "warnings": ["Write detection based on data dependency analysis; indirect writes via assembly not tracked"]
      },
      "read_by": {
        "functions": ["convertToShares", "convertToAssets", "deposit", "withdraw"],
        "confidence": "medium",
        "derived_from": "slither"
      },
      "has_setter": true,
      "is_bounded": false,
      "bound_description": null,
      "storage_slot": null  // only populated when sourced from compiler layout
    },
    {
      "contract": "Vault",
      "name": "MAX_FEE",
      "type": "uint256",
      "visibility": "public",
      "mutability": "constant",
      "value": "1000",
      "evidence": { "file": "src/Vault.sol", "line_start": 15, "line_end": 15 },
      "written_by": { "functions": [], "confidence": "high", "derived_from": "solc-ast" },
      "read_by": { "functions": ["setFee"], "confidence": "medium", "derived_from": "slither" },
      "has_setter": false,
      "is_bounded": true,
      "bound_description": "Constant: 1000 (10%)",
      "storage_slot": null  // constants have no storage slot
    },
    {
      "contract": "Vault",
      "name": "_unusedSlot",
      "type": "uint256",
      "visibility": "private",
      "mutability": "mutable",
      "evidence": { "file": "src/Vault.sol", "line_start": 30, "line_end": 30 },
      "written_by": { "functions": [], "confidence": "medium", "derived_from": "slither" },
      "read_by": { "functions": [], "confidence": "medium", "derived_from": "slither" },
      "has_setter": false,
      "is_bounded": false,
      "is_unused": true,
      "storage_slot": null
    }
  ],
  "storage_layout_source": null  // "compiler-artifact" when available, null otherwise
}
```

**Storage slot policy:** The `storage_slot` field is `null` by default. It is **only** populated when sourced directly from compiler-generated storage layout artifacts (`solc --storage-layout` or equivalent). With inheritance, packing, upgradeable proxies, structs, mappings, and compiler version differences, computing slots from AST analysis alone is too fragile to be trustworthy. When the compiler layout is available, `storage_layout_source` is set to `"compiler-artifact"` and all slots are populated from that source.

### 3.5 External Call Surface — `external-calls.json`

```jsonc
{
  "calls": [
    {
      "contract": "Vault",
      "function": "deposit",
      "evidence": { "file": "src/Vault.sol", "line_start": 142, "line_end": 142, "snippet": "IERC20(asset).transferFrom(msg.sender, address(this), assets);" },
      "target": "IERC20(asset)",
      "method": "transferFrom",
      "return_checked": {
        "value": true,
        "confidence": "high",
        "derived_from": "slither"
      },
      "inside_reentrancy_guard": {
        "value": true,
        "confidence": "high",
        "derived_from": "slither",
        "guard_type": "ReentrancyGuard.nonReentrant"
      },
      "call_type": "token_transfer",
      "trust_level": {
        "value": "semi-trusted",
        "confidence": "medium",
        "derived_from": "heuristic",
        "reasoning": "Asset token set at construction, immutable — but token implementation itself is external",
        "warnings": ["Token could be upgradeable proxy", "Token could have transfer hooks (ERC-777, ERC-1363)"]
      }
    },
    {
      "contract": "Strategy",
      "function": "harvest",
      "evidence": { "file": "src/Strategy.sol", "line_start": 89, "line_end": 89, "snippet": "uint256 price = IOracle(oracle).getPrice(asset);" },
      "target": "IOracle(oracle)",
      "method": "getPrice",
      "return_checked": {
        "value": true,
        "confidence": "high",
        "derived_from": "slither"
      },
      "inside_reentrancy_guard": {
        "value": false,
        "confidence": "high",
        "derived_from": "slither"
      },
      "call_type": "oracle_read",
      "trust_level": {
        "value": "external",
        "confidence": "high",
        "derived_from": "solc-ast",
        "reasoning": "Oracle address stored in mutable state variable, settable by owner",
        "warnings": []
      }
    }
  ]
}
```

### 3.6 Annotations — `annotations.json`

Extracted from `@audit` tags in source files.

```jsonc
{
  "extracted_at": "2025-03-09T14:30:00Z",
  "annotations": [
    {
      "id": "A001",
      "type": "issue",
      "status": "unverified",
      "file": "src/Vault.sol",
      "line": 156,
      "text": "Possible rounding error in share calculation when totalSupply is very low",
      "context_snippet": "uint256 shares = assets.mulDiv(totalSupply, totalAssets, Math.Rounding.Down);"
    },
    {
      "id": "A002",
      "type": "issue-verified",
      "status": "verified",
      "file": "src/Vault.sol",
      "line": 203,
      "text": "First depositor can inflate share price",
      "finding_ref": "F001"
    },
    {
      "id": "A003",
      "type": "question",
      "status": "open",
      "file": "src/Strategy.sol",
      "line": 89,
      "text": "What happens if oracle returns 0? Is there a fallback?"
    }
  ]
}
```

### 3.7 Findings — `findings.json` + `findings.md`

Findings are stored in two formats: `findings.json` is the canonical source of truth (structured data used by tools for deduplication, severity summaries, tracking, and future report generation), and `findings.md` is a rendered human-readable version regenerated from the JSON.

#### 3.7.1 `findings.json` — Source of Truth

```jsonc
{
  "findings": [
    {
      "id": "F001",
      "title": "First Depositor Share Inflation",
      "severity": "High",
      "likelihood": "Medium",
      "impact": "High",
      "category": "Math / Rounding",
      "description": "A first depositor can manipulate the share price by...",
      "impact_detail": "Subsequent depositors receive fewer shares than expected, resulting in...",
      "root_cause": {
        "summary": "The share calculation uses mulDiv with totalSupply which is 0 for the first deposit...",
        "locations": [
          { "file": "src/Vault.sol", "line_start": 156, "line_end": 158, "snippet": "uint256 shares = assets.mulDiv(totalSupply, totalAssets, Math.Rounding.Down);" }
        ]
      },
      "poc": {
        "status": "passing",
        "file": "test/poc/F001_ShareInflation.t.sol",
        "validation_memo": ".solaudit/validations/A002_memo.md"
      },
      "recommendation": "Add a minimum initial deposit requirement or use virtual shares (OpenZeppelin's approach in ERC4626).",
      "references": {
        "annotation_id": "A002",
        "annotation_location": "src/Vault.sol:203",
        "external_links": []
      },
      "created_at": "2025-03-09T15:30:00Z"
    }
  ]
}
```

#### 3.7.2 `findings.md` — Rendered Output

Auto-generated from `findings.json`. This is what the auditor reads and what the dashboard renders. Regenerated by running `solaudit render-findings`.

```markdown
## [F001] First Depositor Share Inflation

**Severity:** High
**Likelihood:** Medium
**Impact:** High
**Category:** Math / Rounding

### Description

A first depositor can manipulate the share price by...

### Impact

Subsequent depositors receive fewer shares than expected, resulting in...

### Root Cause

The share calculation uses mulDiv with totalSupply which is 0 for the first deposit...

`src/Vault.sol:156-158`
```solidity
// ...
// @audit-issue The share calculation is vulnerable when totalSupply is zero.
uint256 shares = assets.mulDiv(totalSupply, totalAssets, Math.Rounding.Down);
```

### Proof of Concept

PoC: `test/poc/F001_ShareInflation.t.sol` (passing)

### Recommendation

Add a minimum initial deposit requirement or use virtual shares (OpenZeppelin's approach in ERC4626).

### References

- Annotation: A002 (src/Vault.sol:203)

---
\```

**Why the split matters:**
- `findings.json` enables programmatic dedup in Phase 4 (compare by `root_cause.locations`, `category`, etc.)
- Severity summaries and stats can be computed directly from JSON without parsing markdown
- Future report generation (PDF, DOCX) reads from JSON, not markdown
- The markdown is a convenience view, not the data layer

### 3.8 Tracking Table — `tracking.json`

Master table for Phase 4 comparison and overall audit status.

```jsonc
{
  "findings": [
    {
      "id": "F001",
      "title": "First depositor share inflation",
      "severity": "High",
      "source": "manual",
      "status": "verified",
      "poc_status": "passing",
      "poc_file": "test/poc/F001_ShareInflation.t.sol",
      "duplicates": ["nethermind-003", "zellic-007"],
      "notes": ""
    },
    {
      "id": "AI-N001",
      "title": "Unchecked return value in Strategy.withdraw",
      "severity": "Medium",
      "source": "nethermind",
      "status": "pending_validation",
      "poc_status": "not_started",
      "poc_file": null,
      "duplicates": [],
      "notes": "Need to verify if SafeERC20 already handles this"
    }
  ]
}
```

---

## 4. CLI Tools

All tools are TypeScript, published as a single npm package `solaudit` with subcommands. Installed globally or as a dev dependency.

```bash
npx solaudit <command> [options]
```

Every tool reads `config.json` for scope and settings. Output directory is configurable via `config.json` → `settings.output_dir`.

### 4.1 `solaudit init`

**Purpose:** Initialize a new audit project. Creates `config.json` with interactive prompts or flags.

**Input:** Path to the full client project directory (already cloned or received), specific files in scope, commit hash, chain, docs URL.

**Output:** `<config_dir>/config.json`

**Behavior:**
- Takes the project directory path (the auditor has already cloned/received the project)
- Detects Foundry/Hardhat project structure automatically
- Resolves scope globs to an explicit file list, validated against files that actually exist in the project
- Detects Solidity version from `foundry.toml` or pragma statements
- Creates the output directory inside the project root
- Verifies the project compiles (`forge build` or equivalent)

```bash
# Initialize pointing at an existing project, specifying which files are in scope
solaudit init --project /path/to/project --scope "src/core/**/*.sol,src/Vault.sol" --commit abc123

# Or run from inside the project directory
cd /path/to/project
solaudit init --scope "src/core/**/*.sol,src/Vault.sol" --commit abc123
```

---

### 4.2 `solaudit stats`

**Purpose:** Generate codebase statistics.

**Input:** In-scope Solidity files (from `config.json`).

**Output:** `<config_dir>/stats.json`

**Implementation strategy:**
- Use `solc --ast-json` or `@solidity-parser/parser` (npm package) for AST parsing
- Count nSLOC by stripping comments and blank lines
- Detect ERCs/EIPs by analyzing interface implementations and function signatures
- Extract dependencies from import paths and `package.json` / remappings
- Count assembly blocks via AST node type `InlineAssembly`
- Run test coverage: execute `forge coverage --report lcov` (or equivalent), parse the lcov output to extract per-contract line and branch coverage percentages, and identify uncovered lines. **Coverage is optional** — if the command fails (broken tests, missing dependencies, compilation errors), the tool logs the failure reason in `test_coverage.failure_reason`, sets `status: "failed"`, and proceeds. Stats generation never fails because of coverage.

**Wraps existing tools:** `solc` for compilation/AST, `@solidity-parser/parser` for lightweight parsing when full compilation isn't needed, `forge coverage` for test coverage data.

---

### 4.3 `solaudit access`

**Purpose:** Extract access control mapping with two tiers: raw facts and role interpretations.

**Input:** In-scope Solidity files + full project for dependency resolution.

**Output:** `<config_dir>/access-control.json`

**Implementation strategy — two-tier approach:**

**Tier 1: Surface raw facts (always do this first, always high confidence)**
- Parse all external/public function definitions, extract visibility and modifier names (from AST)
- List every function with its modifiers — no interpretation, just facts
- This is always reliable because it's purely syntactic

**Tier 2: Interpret roles (layered by confidence)**
- **High confidence — known library patterns:** Detect OpenZeppelin `Ownable`, `Ownable2Step`, `AccessControl`, `AccessControlEnumerable` via import/inheritance analysis. These have well-defined semantics. Use Slither's `--print human-summary` to cross-validate.
- **Medium confidence — explicit role constants:** Parse `bytes32 public constant KEEPER_ROLE = keccak256("KEEPER_ROLE")` patterns and `_grantRole` calls. The role exists, but its semantics are project-specific.
- **Low confidence — naming heuristics:** Infer role names from custom modifier names (e.g., `onlyKeeper` → "keeper"). Always flagged with warnings.
- **"anyone" role:** External/public functions with no access-control modifiers. High confidence, but warn if the function has internal `require` or `if` checks that might gate access programmatically.

**Do NOT attempt to:**
- Resolve complex auth graphs through multiple indirection layers
- Infer semantics of custom modifiers beyond naming (flag for manual review instead)
- Flatten role hierarchies (e.g., admin → can grant keeper → can call harvest)

**Wraps existing tools:** Slither `--print function-summary` for function visibility/modifier data, Slither `--print human-summary` for OZ role detection. Custom AST parsing only for gap-filling (role constant extraction, naming heuristics).

---

### 4.4 `solaudit state`

**Purpose:** Generate state variable inventory with confidence metadata.

**Input:** In-scope Solidity files + full project for compilation.

**Output:** `<config_dir>/state-vars.json`

**Implementation strategy:**
- Parse all state variable declarations from AST (high confidence — purely syntactic)
- Classify mutability: `constant`, `immutable`, `mutable` (high confidence — from AST keywords)
- Track read/write references using Slither's data dependency analysis (`--print data-dependency`). Tag confidence as "medium" because Slither may miss indirect access via assembly or delegatecall.
- Detect unused variables: variables with no readers and no writers from Slither output. Tag confidence as "medium" (Slither may miss reads via inline assembly or external delegate calls).
- Detect if a variable has a dedicated setter function (heuristic: external/public function that writes only this variable)
- **Storage slots:** Only populate `storage_slot` if compiler layout artifacts are available. Run `solc --storage-layout` on the contract. If this succeeds, populate all slot values from the compiler output and set `storage_layout_source: "compiler-artifact"`. If compilation fails or layout is unavailable (e.g., abstract contracts), leave slots as `null`. **Never compute slots manually from AST.**

**Wraps existing tools:** Slither `--print data-dependency` for read/write tracking, `solc --storage-layout` for storage slots, `@solidity-parser/parser` for declaration extraction.

---

### 4.5 `solaudit calls`

**Purpose:** Map external call surface with confidence metadata.

**Input:** In-scope Solidity files + full project for compilation.

**Output:** `<config_dir>/external-calls.json`

**Implementation strategy:**
- **Primary source:** Run Slither external call detection (`--print call-graph`, `--detect reentrancy-*`). Slither reliably identifies `.call`, `.delegatecall`, `.staticcall`, interface method calls, `.transfer`, `.send`. Tag as high confidence / derived from "slither".
- **Return value checking:** Use Slither's `--detect unchecked-transfer` and `--detect unchecked-lowlevel` detectors. High confidence.
- **Reentrancy guard detection:** Use Slither's reentrancy detectors to determine if a call is inside a `nonReentrant` modifier or equivalent. High confidence for standard patterns (OZ ReentrancyGuard), medium for custom guards.
- **Trust level classification:** This is the one area requiring custom logic. Classify based on:
  - Is the target address immutable? (from `state-vars.json` mutability data)
  - Is it an in-scope contract? (from `config.json` scope)
  - Is the address settable by a privileged role? (from `access-control.json`)
  - Tag trust level confidence as "medium" for immutable/scope checks, "low" for inferences about what the target contract does
- **Call type classification:** Heuristic based on method signature (`transfer`, `approve` → token_transfer, `getPrice`, `latestRoundData` → oracle_read, etc.). Tag as "heuristic" derived_from.

**Wraps existing tools:** Slither is the primary engine. Custom TypeScript normalizes Slither output into the SolAudit schema and adds trust-level classification on top.

---

### 4.6 `solaudit annotations`

**Purpose:** Extract `@audit` tags from source code into structured JSON.

**Input:** In-scope Solidity files (scans comments).

**Output:** `<config_dir>/annotations.json`

**Implementation strategy:**
- Regex scan for `// @audit-issue`, `// @audit-issue-verified`, `// @audit-question`, `// @audit-note` patterns in all `.sol` files
- Extract the text after the tag
- Record file, line number, surrounding code context (±3 lines)
- Assign sequential IDs (A001, A002, ...)
- For `@audit-issue-verified`, attempt to link to finding ID if referenced in the comment text

**Note:** This is re-run on demand (not a watcher). The auditor runs it when they want to sync annotations to the dashboard.

```bash
solaudit annotations        # extract all @audit tags
solaudit annotations --diff # show only new/changed since last run
```

---

### 4.7 `solaudit deps`

**Purpose:** Build the contract dependency graph. Used internally by other tools and by the AI context assembly strategy.

**Input:** In-scope Solidity files.

**Output:** `<config_dir>/deps.json`

**Implementation strategy:**
- Parse all `import` statements
- Build directed graph: contract → contracts it imports/inherits/calls
- Identify clusters (groups of tightly coupled contracts)
- Compute topological ordering
- Output includes: adjacency list, clusters, inheritance trees

```jsonc
{
  "graph": {
    "Vault": {
      "inherits": ["ERC4626", "Ownable", "ReentrancyGuard"],
      "imports": ["IStrategy", "Math"],
      "calls": ["Strategy", "IERC20"]
    }
  },
  "clusters": [
    { "id": "core", "contracts": ["Vault", "Strategy", "Math"], "total_nsloc": 890 }
  ],
  "inheritance_trees": [
    ["ReentrancyGuard", "Ownable", "ERC4626", "Vault"]
  ]
}
```

---

### 4.8 `solaudit context`

**Purpose:** Assemble optimized context for AI prompts. Used by Claude Code skills to prepare codebase input.

**Input:** Scope from `config.json`, optional target contract/function filter, dependency graph from `deps.json`.

**Output:** Stdout (piped to Claude Code) or `<config_dir>/context.md`

**Behavior (layered strategy):**

| Scenario | Strategy |
|----------|----------|
| Total in-scope < 150k tokens | Concatenate all files with file path headers |
| Total in-scope ≥ 150k tokens | Use `deps.json` clusters; bundle by cluster; include cross-cluster summary |
| Targeted query (specific contract/function) | Include target contract + all contracts it interacts with (from dependency graph) + state variable inventory + access control map as compressed context |

**Format:**
```markdown
# Context: [Project Name] @ [commit]

## File: src/Vault.sol (342 nSLOC)
```solidity
// full file contents
\```

## File: src/Strategy.sol (210 nSLOC)
```solidity
// full file contents
\```
```

---

### 4.9 `solaudit render-findings`

**Purpose:** Regenerate `findings.md` from `findings.json`. This ensures the markdown is always in sync with the canonical JSON data.

**Input:** `<config_dir>/findings.json`

**Output:** `<config_dir>/findings.md`

**Implementation strategy:**
- Read all findings from JSON
- Render each finding using the markdown template (Section 3.7.2)
- Sort by severity (Critical → High → Medium → Low → Info)
- Prepend a summary table (count by severity)
- Write the complete markdown file

```bash
solaudit render-findings  # regenerate findings.md from findings.json
```

---

## 5. Claude Code Skills

Skills are markdown files that instruct Claude Code on how to perform each step. They live in the project or in a shared skills repository.

### 5.1 Skill: `init-audit`

**Trigger:** Starting a new audit.

**Recommended model:** Sonnet

**What it does:**
1. Runs `solaudit init` interactively
2. Runs `solaudit stats`, `solaudit deps`, `solaudit access`, `solaudit state`, `solaudit calls` in sequence
3. Summarizes what was generated

**Skill file content (conceptual):**
```markdown
# Skill: Initialize Audit

You are helping set up a new Solidity audit project.

## Steps
1. Ask the auditor for:
   - Project directory path (where they cloned/received the client project)
   - Which files are in scope for audit (glob pattern or explicit list)
   - Commit hash, chain, docs URL
2. Run: `npx solaudit init --project "<path>" --scope "<scope>" --commit <hash> --chain <chain> --docs "<url>"`
3. Verify the project compiles: run `forge build` or `npx hardhat compile` (auto-detected)
4. Run in sequence:
   - `npx solaudit stats`
   - `npx solaudit deps`
   - `npx solaudit access`
   - `npx solaudit state`
   - `npx solaudit calls`
5. Report: "Audit initialized. Generated: stats, dependency graph, access control map, state variables, external calls."
6. Ask: "Ready to generate the overview and diagrams? (These require AI analysis)"
```

---

### 5.2 Skill: `generate-overview`

**Trigger:** Phase 1.1 — AI-generated intro/overview.

**Recommended model:** Sonnet

**What it does:**
1. Runs `solaudit context` to assemble full codebase
2. Reads docs URL if provided (fetches and includes)
3. Generates a 2-3 paragraph overview of the protocol
4. Writes to `<config_dir>/overview.md`

**Prompt strategy:**
```markdown
# Skill: Generate Protocol Overview

## Context Assembly
Run: `npx solaudit context > /tmp/context.md`
Read the output.
Also read: `<config_dir>/stats.json` for high-level numbers.
If config.json has a docs_url, fetch and read it.

## Task
Write a 2-3 paragraph overview of this protocol. Cover:
- What the protocol does (purpose, target users)
- Core mechanism (how it works at a high level)
- Key contracts and their roles
- Notable design patterns or architectural decisions

Write for an experienced Solidity auditor who needs to quickly understand what they're looking at.
Do NOT list findings or security concerns — this is purely descriptive.

## Output
Write the overview to `<config_dir>/overview.md`.
```

---

### 5.3 Skill: `generate-diagram`

**Trigger:** Phase 1.3 — System diagram.

**Recommended model:** Sonnet

**What it does:**
1. Reads `deps.json`, `access-control.json`, `stats.json`
2. Generates an Excalidraw JSON file representing the system architecture
3. Writes to `<config_dir>/diagram.excalidraw`

**Prompt strategy:**
```markdown
# Skill: Generate System Diagram

## Context
Read these files:
- `<config_dir>/deps.json` (contract relationships)
- `<config_dir>/access-control.json` (roles)
- `<config_dir>/stats.json` (contract types, inheritance)

## Task
Generate an Excalidraw JSON file that visualizes:
- Each contract as a box (color-coded: blue for core, green for libraries, gray for interfaces)
- Inheritance as solid arrows (child → parent)
- External calls as dashed arrows (caller → callee)
- Roles as small labeled boxes connected to the functions they can access
- Group related contracts visually (use the cluster data from deps.json)

## Excalidraw Format
[Include Excalidraw JSON element specification here — rectangles, arrows, text elements with x/y coordinates, width/height, colors]

## Output
Write valid Excalidraw JSON to `<config_dir>/diagram.excalidraw`.
```

---

### 5.4 Skill: `generate-flows`

**Trigger:** Phase 1.4 — Flow charts.

**Recommended model:** Opus

**What it does:**
1. Runs `solaudit context` for full codebase
2. Reads `access-control.json` and `external-calls.json`
3. Generates flow charts grouped by user type and value transfer paths
4. Writes to `<config_dir>/flows.excalidraw`

**Prompt strategy:**
```markdown
# Skill: Generate Flow Charts

## Context
Run: `npx solaudit context`
Read: `<config_dir>/access-control.json`, `<config_dir>/external-calls.json`

## Task
Create Excalidraw flow charts for every significant flow in the protocol.

Group flows by:
1. **User type** (from access control: anyone, owner, keeper, etc.)
2. **Value flows** (any path where tokens/ETH move — deposits, withdrawals, fee collection, liquidations)
3. **Admin flows** (configuration, pausing, upgrades)

For each flow:
- Start with the entry point (external function)
- Trace through all internal calls, state changes, and external calls
- End at the exit point (return, transfer, or revert)
- Mark where value (tokens/ETH) enters or leaves the system
- Mark where important state variables are modified

Use swim lanes to separate contracts.

## Output
Write to `<config_dir>/flows.excalidraw`.
```

---

### 5.5 Skill: `identify-invariants`

**Trigger:** Phase 1.5 — Invariant identification.

**Recommended model:** Opus

**What it does:**
1. Reads docs (if available) to understand intended behavior
2. Reads full codebase via `solaudit context`
3. Reads `state-vars.json` for key state variables
4. Produces a structured list of invariants
5. Writes to `<config_dir>/invariants.md`

**Prompt strategy:**
```markdown
# Skill: Identify Invariants

## Context
Read the docs URL from config.json (if available).
Run: `npx solaudit context`
Read: `<config_dir>/state-vars.json`

## Task — Two-Pass Analysis

### Pass 1: From documentation
Read the docs and extract every stated invariant, guarantee, or assumption.
Examples: "total shares always equals sum of individual balances", "fee never exceeds 10%", "only the owner can pause".

### Pass 2: From code
Read the contracts and identify:
- Arithmetic invariants (e.g., totalAssets >= sum of deposits - withdrawals)
- Access control invariants (e.g., only owner can call X)
- State machine invariants (e.g., contract cannot be unpaused once deprecated)
- Token accounting invariants (e.g., contract balance >= tracked internal balance)
- Ordering invariants (e.g., initialize must be called before deposit)

### Pass 3: Compare and reconcile
- Flag any invariant stated in docs but not enforced in code (potential bug)
- Flag any invariant enforced in code but not documented (implicit assumption)
- Rate confidence: high (clearly enforced), medium (partially enforced), low (assumed but not checked)

## Output Format
Write to `<config_dir>/invariants.md`:

```markdown
# Protocol Invariants

## From Documentation
1. [INV-D01] Total shares equals sum of user balances — **Confidence: High** — Enforced in: Vault.sol:deposit, Vault.sol:withdraw

## From Code Analysis
1. [INV-C01] Fee parameter bounded by MAX_FEE (1000 bps) — **Confidence: High** — Enforced in: Vault.sol:setFee

## Discrepancies
1. [DISC-01] Docs state "withdrawals always succeed" but code has a `whenNotPaused` modifier — owner can block withdrawals
\```
```

---

### 5.6 Skill: `check-spec-conformance`

**Trigger:** Phase 1.6 — After invariants are identified, verify the code matches its specification.

**Recommended model:** Opus

**What it does:**
1. Reads all available specification sources: external documentation (docs URL), NatSpec comments on contracts and functions, interface definitions (what the contract claims to implement), and ERC/EIP standards referenced
2. Reads the full codebase via `solaudit context`
3. Systematically compares each specification claim against the actual implementation
4. Produces a structured conformance report
5. Writes to `<config_dir>/spec-conformance.json` and `<config_dir>/spec-conformance.md`

**Prompt strategy:**
```markdown
# Skill: Check Spec Conformance

**Recommended model: Opus**

## Context
Read:
- Docs URL from config.json (if available) — fetch and read the full documentation
- Run: `npx solaudit context` — full codebase
- Read: `<config_dir>/stats.json` — for ERC/EIP usage list
- Read: `<config_dir>/invariants.md` — for cross-reference with invariant analysis

## Task — Four-Source Analysis

### Source 1: External Documentation
Read the project documentation and extract every behavioral claim:
- "Users can deposit X and receive Y"
- "Fees are capped at 10%"
- "Only the admin can pause the contract"
- "Withdrawals process within one epoch"
For each claim, find the code that implements it. Verify the implementation matches.

### Source 2: NatSpec Comments
For every function with @notice, @dev, @param, or @return NatSpec:
- Does the function actually do what @notice says?
- Are @param descriptions accurate (especially constraints like "must be > 0")?
- Does the function return what @return describes?
- Are there @dev notes about behavior that the code contradicts?

Pay special attention to:
- NatSpec that mentions conditions ("reverts if...", "only when...", "must be called before...")
- NatSpec on inherited/overridden functions — does the override still satisfy the parent's spec?

### Source 3: Interface Conformance
For every interface the contract implements (explicit `is IVault` or implicit via function signatures):
- Does the contract implement ALL functions defined in the interface?
- Do the implementations respect the behavioral semantics of the interface?
  (e.g., ERC-4626 has specific rounding rules, ERC-20 approve has specific expectations)
- Are there functions that SHOULD be part of the interface but aren't?

### Source 4: ERC/EIP Standard Compliance
For each ERC/EIP listed in stats.json:
- Does the implementation conform to the standard's MUST/SHOULD/MAY requirements?
- Are required events emitted in the correct circumstances?
- Are required error conditions handled?
- Are optional features implemented correctly if present?

Known gotchas to check:
- ERC-20: return values on transfer/approve, zero-amount transfers
- ERC-4626: rounding direction (up vs down) per the spec, preview vs actual amounts
- ERC-721: safeTransferFrom callback behavior
- ERC-2612: permit deadline, nonce handling
- ERC-1155: batch operation semantics

## Conformance Classification
For each spec item, classify as:
- **CONFORMS** — Code matches the spec. Include evidence.
- **DEVIATES** — Code behaves differently than the spec states. This is a potential finding.
- **PARTIAL** — Code partially implements the spec but misses edge cases or conditions.
- **UNVERIFIABLE** — Spec is ambiguous or behavior depends on runtime conditions that can't be statically checked.
- **UNDOCUMENTED** — Code behavior that has no corresponding spec (not necessarily wrong, but notable).

## Output
Write to `<config_dir>/spec-conformance.json`:
```jsonc
{
  "checked_at": "2025-03-09T16:00:00Z",
  "sources_checked": {
    "external_docs": true,
    "natspec": true,
    "interfaces": true,
    "erc_eip": ["ERC-20", "ERC-4626", "EIP-2612"]
  },
  "summary": {
    "total_checks": 47,
    "conforms": 38,
    "deviates": 3,
    "partial": 2,
    "unverifiable": 2,
    "undocumented": 2
  },
  "items": [
    {
      "id": "SC-001",
      "source": "natspec",
      "spec_text": "@notice Deposits assets and mints shares to receiver. Reverts if assets is zero.",
      "spec_location": { "file": "src/Vault.sol", "line": 128 },
      "status": "DEVIATES",
      "finding": "Function does NOT revert when assets is zero — it mints zero shares silently.",
      "code_location": { "file": "src/Vault.sol", "line_start": 130, "line_end": 145 },
      "severity_hint": "Low",
      "confidence": "high"
    },
    {
      "id": "SC-002",
      "source": "erc_eip",
      "spec_text": "ERC-4626: previewDeposit MUST return as close to the exact amount of shares as possible, rounding down.",
      "spec_location": { "reference": "EIP-4626", "section": "previewDeposit" },
      "status": "CONFORMS",
      "finding": "previewDeposit uses Math.Rounding.Down consistently.",
      "code_location": { "file": "src/Vault.sol", "line_start": 95, "line_end": 97 },
      "confidence": "high"
    },
    {
      "id": "SC-003",
      "source": "external_docs",
      "spec_text": "Documentation states: 'Users can withdraw at any time without delay'",
      "spec_location": { "reference": "docs.protocol.xyz/withdrawals" },
      "status": "DEVIATES",
      "finding": "Withdraw function has a `whenNotPaused` modifier. Admin can block withdrawals at any time. Also, there is a cooldown period of 1 epoch that the docs do not mention.",
      "code_location": { "file": "src/Vault.sol", "line_start": 160, "line_end": 185 },
      "severity_hint": "Medium",
      "confidence": "high"
    },
    {
      "id": "SC-004",
      "source": "interface",
      "spec_text": "IVault.claimRewards() defined in interface",
      "spec_location": { "file": "src/interfaces/IVault.sol", "line": 24 },
      "status": "PARTIAL",
      "finding": "claimRewards() is implemented but silently returns 0 if no rewards are accrued, while the interface NatSpec says it should revert.",
      "code_location": { "file": "src/Vault.sol", "line_start": 200, "line_end": 215 },
      "severity_hint": "Low",
      "confidence": "medium"
    }
  ]
}
\```

Also render to `<config_dir>/spec-conformance.md` for human reading, grouped by status (DEVIATES first, then PARTIAL, then UNVERIFIABLE, then UNDOCUMENTED, then CONFORMS).
```

---

### 5.7 Skill: `generate-poc`

**Trigger:** Phase 3.1 — When auditor wants to validate an `@audit-issue`.

**Recommended model:** Opus

**What it does:**
1. Reads the specific annotation (by ID or by pointing to the code)
2. Reads relevant contracts via `solaudit context --target <contract>`
3. Inspects the existing test setup in the project to understand the testing infrastructure
4. First reasons about whether the issue is valid
5. If valid, generates a PoC test file that leverages the project's existing test infrastructure
6. Runs the test to verify it passes
7. Writes the PoC file to the project's test directory

**Prompt strategy:**
```markdown
# Skill: Generate Proof of Concept

**Recommended model: Opus**

## Context
The auditor has identified a potential issue. Read:
- The annotation or issue description provided
- Run: `npx solaudit context --target <relevant_contract>`
- Read: `<config_dir>/state-vars.json` for relevant state

## Step 0: Understand the Project's Test Infrastructure
Before writing any test code, inspect the project's existing test setup:
1. Look at the test directory structure (`test/`, `tests/`, etc.)
2. Read 2-3 existing test files to understand:
   - Which test framework is used (Foundry, Hardhat/Mocha, Brownie, etc.)
   - How contracts are deployed in tests (direct deploy, factory, fork, etc.)
   - Existing base test contracts or test helpers (e.g., `BaseTest.sol`, `TestSetup.sol`, `deploy.ts`)
   - How tokens are dealt, accounts are impersonated, etc.
   - Fork configuration (RPC URL, block number) if applicable
3. Read the project config (`foundry.toml`, `hardhat.config.ts`, etc.) for test settings

**CRITICAL:** Reuse existing test infrastructure. If the project has a `BaseTest.sol` that deploys
the full system, inherit from it. If there's a `setUp()` that forks mainnet and configures all
contracts, use it. Do NOT recreate deployment logic that already exists.

## Step 1: Validate by Reasoning
Before writing any code, reason through:
1. Is this actually exploitable? Trace the exact execution path.
2. What are the preconditions needed?
3. What would the impact be?
4. Are there any existing protections that prevent this?

If you conclude the issue is NOT valid, explain why and stop.
**In either case (valid or not), write a validation memo** — see Output section.

## Step 2: Write PoC (only if Step 1 validates)
Generate a test file that follows the project's testing conventions:

**If Foundry project:**
```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {BaseTest} from "../BaseTest.sol";  // or whatever the project uses
// ... relevant imports matching project conventions

contract F001_ShareInflation_PoC is BaseTest {  // inherit from existing base
    function setUp() public override {
        super.setUp();  // leverage existing setup
        // Only add PoC-specific setup here
    }

    function test_poc_description() public {
        // Step-by-step attack with comments explaining each step
        // Assertions proving the vulnerability
    }
}
\```

**If Hardhat/TypeScript project:**
```typescript
import { expect } from "chai";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { deployFixture } from "../helpers/deploy";  // reuse project's fixtures
// ... follow the project's testing patterns
\```

Requirements:
- Match the project's coding style and conventions
- Inherit from / reuse existing test base contracts or fixtures
- Do NOT duplicate deployment logic — import it
- Add descriptive comments for each step
- End with clear assertions that demonstrate the impact

## Step 3: Run and verify
Run the test using the project's test runner (auto-detect from project config):
- Foundry: `forge test --match-test test_poc_description -vvv`
- Hardhat: `npx hardhat test test/poc/F001_ShareInflation.test.ts --grep "poc_description"`
If it fails, debug and fix. Iterate until the PoC passes.

## Output
**Always produce a validation memo** at `<config_dir>/validations/<annotation_id>_memo.md`:
```markdown
# Validation Memo: A001 — Possible rounding error in share calculation

**Verdict:** Valid / Invalid / Uncertain
**Date:** 2025-03-09
**Annotation:** A001 (src/Vault.sol:156)

## Reasoning
[Step-by-step reasoning from Step 1, preserved regardless of outcome]

## Execution Path
[Traced call path if applicable]

## Protections Considered
[Existing guards, checks, or mitigations evaluated]

## Conclusion
[If valid: summary of exploit + pointer to PoC file]
[If invalid: clear explanation of why this is not exploitable]
[If uncertain: specific questions that need manual investigation]
\```

**If valid, also write** the test file to the project's test directory following its conventions, e.g.:
- Foundry: `test/poc/<finding_id>_<short_name>.t.sol`
- Hardhat: `test/poc/<finding_id>_<short_name>.test.ts`
```

---

### 5.8 Skill: `write-finding`

**Trigger:** Phase 3.2 — After PoC is validated, write the formal finding.

**Recommended model:** Sonnet

**What it does:**
1. Reads the annotation, the PoC, the validation memo, and the relevant code
2. Writes a finding entry to `<config_dir>/findings.json` (canonical source of truth)
3. Regenerates `<config_dir>/findings.md` from the JSON
4. Updates the annotation status to `@audit-issue-verified`

**Prompt strategy:**
```markdown
# Skill: Write Finding

## Context
Read:
- The annotation / issue description
- The validation memo (from `<config_dir>/validations/`)
- The PoC file (if exists)
- The relevant source code
- `<config_dir>/findings.json` to determine next finding ID

## Severity Guide
Rate severity using Likelihood × Impact:

| | Low Impact | Medium Impact | High Impact |
|---|---|---|---|
| **High Likelihood** | Medium | High | Critical |
| **Medium Likelihood** | Low | Medium | High |
| **Low Likelihood** | Info | Low | Medium |

**Impact** = What's the worst that can happen? (fund loss, DoS, griefing, incorrect accounting)
**Likelihood** = How easy is it to trigger? (requires specific conditions? attacker motivation? cost?)

## Template
Write the finding following the exact template structure defined in the data model (Section 3.7).

## Requirements
- Description must be understandable by a developer who hasn't seen the code
- Root cause must point to specific lines of code
- Recommendation must be concrete and implementable
- If a PoC exists, reference the file path

## Code Block Formatting Rules (STRICT)
When including code snippets in the finding, follow these rules exactly:

### Never modify original code
Do not add any text to code blocks that was not originally there. The only allowed
modifications are `@audit` / `@audit-issue` comments and `// ....` to indicate
omitted irrelevant lines.

### Comment placement
Always add comments on a SEPARATE LINE ABOVE the affected line. Never inline at end of line.

**CORRECT:**
```solidity
// ...
// @audit-issue This variable is unused.
uint256 totalDeposits;
```

**WRONG — inline comment:**
```solidity
uint256 totalDeposits; // @audit-issue This variable is unused.
```

**WRONG — adding explanatory text that wasn't in original:**
```solidity
// This might have been used to do this and that.
uint256 totalDeposits;
```

**WRONG — rewording omission markers:**
```solidity
// ... other code was here ...
uint256 totalDeposits;
```

### Comment style
All inserted audit comments must be full sentences that start with a capital letter and end with a period.

**CORRECT:**
```solidity
// @audit-issue This variable is unused.
uint256 totalDeposits;
```

**WRONG — abbreviated:**
```solidity
// @audit-issue unused var
uint256 totalDeposits;
```

## Output
Append the finding entry to `<config_dir>/findings.json` (following the schema in Section 3.7.1).
Regenerate `<config_dir>/findings.md` from the JSON by running `npx solaudit render-findings`.
Update the source annotation to `@audit-issue-verified` with the finding ID reference.
Update `<config_dir>/tracking.json` with the new finding.
```

---

### 5.9 Skill: `compare-findings`

**Trigger:** Phase 4.2 — After external AI agents have been run and results uploaded.

**Recommended model:** Sonnet

**What it does:**
1. Reads all files in `<config_dir>/ai-results/`
2. Reads `<config_dir>/findings.json` (auditor's own findings — canonical data)
3. Semantically compares each AI finding against existing findings
4. Produces a comparison report and updates the tracking table

**Prompt strategy:**
```markdown
# Skill: Compare Findings

## Context
Read:
- `<config_dir>/findings.json` — your own findings (canonical data)
- All files in `<config_dir>/ai-results/` — external AI agent outputs
- `<config_dir>/tracking.json` — current tracking state

## Task
For each finding from an external AI agent:

1. **Semantic matching:** Does this describe the same vulnerability as any existing finding?
   - Match on: affected contract, affected function, root cause, attack vector
   - NOT on: exact wording or severity rating
   - If match found → mark as duplicate, record the mapping

2. **Novelty assessment:** For non-duplicate findings:
   - Is this a valid concern? (Rate: likely valid / needs review / likely false positive)
   - What is the reasoning?
   - Does it affect in-scope contracts?

3. **Priority ranking:** Rank novel findings by likely severity.

## Output
Write to `<config_dir>/comparison.json`:
```jsonc
{
  "duplicates": [
    { "ai_finding": "nethermind-003", "matches": "F001", "confidence": "high" }
  ],
  "novel": [
    {
      "id": "AI-N001",
      "source": "nethermind",
      "original_id": "nethermind-012",
      "title": "...",
      "validity": "needs_review",
      "reasoning": "...",
      "priority": 1
    }
  ],
  "rejected": [
    { "id": "nethermind-007", "reason": "Out of scope — affects mock contract only" }
  ]
}
\```

Update `<config_dir>/tracking.json` with all entries.
```

---

### 5.10 Skill: `validate-ai-finding`

**Trigger:** Phase 4.3 — Auditor wants to investigate a novel AI finding.

**Recommended model:** Opus

**What it does:**
1. Reads the specific AI finding
2. Loads relevant code context
3. Reasons about validity
4. Optionally generates a PoC (reuses `generate-poc` skill logic)
5. Updates tracking table

```markdown
# Skill: Validate AI Finding

## Context
Read the AI finding from `<config_dir>/comparison.json` → novel findings.
Run: `npx solaudit context --target <affected_contract>`

## Task
1. Read the AI agent's claim carefully
2. Trace the described attack path in the actual code
3. Determine: Is this valid?
   - If valid → generate PoC (follow generate-poc skill), write finding (follow write-finding skill)
   - If invalid → explain why, update tracking as "rejected"
   - If uncertain → flag for manual review with specific questions

## Output
Update `<config_dir>/tracking.json` with the validation result.
```

---

## 6. Dashboard

### 6.1 Overview

A Next.js application running on `localhost:3000`. It reads all data from the configurable output directory. No database, no API routes that write data — purely a visualization layer.

### 6.2 Configuration

The dashboard needs to know where to find the audit project. Options:

- **Environment variable:** `SOLAUDIT_PROJECT_DIR=/path/to/project`
- **CLI flag:** `npm run dev -- --project /path/to/project`
- **Config file:** `~/.solaudit/dashboard.json` with last-used project path

The dashboard watches the output directory for file changes and auto-refreshes (use `fs.watch` or `chokidar`).

### 6.3 Pages

#### 6.3.1 Home / Overview

**URL:** `/`

**Content:**
- Project name, commit hash, chain (from `config.json`)
- AI-generated overview (rendered from `overview.md`)
- Key stats in cards: total contracts, nSLOC, external functions, assembly lines (from `stats.json`)
- Quick links to other pages

**Data sources:** `config.json`, `overview.md`, `stats.json`

---

#### 6.3.2 Statistics

**URL:** `/stats`

**Content:**
- Detailed breakdown table: per-contract stats (nSLOC, functions, modifiers, events, errors)
- Test coverage overview: overall line/branch coverage percentages, per-contract coverage bars
- Uncovered lines highlighted per contract (low coverage areas are high-priority review targets)
- Dependency chart: which packages are used, version, import count
- ERC/EIP usage badges
- Solidity version
- Sortable/filterable table

**Data sources:** `stats.json`

---

#### 6.3.3 System Diagram

**URL:** `/diagram`

**Content:**
- Embedded Excalidraw viewer rendering `diagram.excalidraw`
- Interactive: pan, zoom, hover for details
- Option to open in Excalidraw desktop app

**Data sources:** `diagram.excalidraw`

**Implementation:** Use `@excalidraw/excalidraw` React component in read-only mode with the JSON data.

---

#### 6.3.4 Flows

**URL:** `/flows`

**Content:**
- Embedded Excalidraw viewer rendering `flows.excalidraw`
- Filter sidebar: by user type, by value transfer, by contract
- Same interactive features as diagram page

**Data sources:** `flows.excalidraw`

---

#### 6.3.5 Access Control

**URL:** `/access`

**Content:**
- Two-tier display: raw function→modifier facts (Tier 1) and interpreted role groupings (Tier 2)
- Matrix view: roles (columns) × functions (rows), cells marked with ✓
- Confidence badges on each role (high: green, medium: yellow, low: red with tooltip showing `derived_from` and `warnings`)
- Click a function → see the modifier logic, link to source line, see evidence snippet
- Highlight functions callable by "anyone" (potential attack surface)
- Filter by confidence level to see which role assignments need manual verification

**Data sources:** `access-control.json`

---

#### 6.3.6 State Variables

**URL:** `/state`

**Content:**
- Sortable table: contract, name, type, mutability, readers, writers, confidence
- Storage slot column shown only when `storage_layout_source` is `"compiler-artifact"`
- Confidence indicators on read/write analysis (tooltip shows `derived_from` and any warnings)
- Filters: show only mutable, show only unused, show only unbounded, show only low-confidence
- Color coding: red for unused, yellow for unbounded mutable, green for constant/immutable
- Click a variable → see all functions that read/write it, with evidence snippets

**Data sources:** `state-vars.json`

---

#### 6.3.7 External Calls

**URL:** `/calls`

**Content:**
- Table: contract, function, target, method, return checked, reentrancy guard, trust level, confidence
- Confidence indicators on trust level and return-check analysis (tooltip shows `derived_from`, `reasoning`, and `warnings`)
- Color coding by trust level (red for external, yellow for semi-trusted, green for trusted)
- Filter by: unchecked returns, outside reentrancy guard, call type, low-confidence entries
- Click a row → see evidence snippet and full provenance metadata

**Data sources:** `external-calls.json`

---

#### 6.3.8 Invariants

**URL:** `/invariants`

**Content:**
- Rendered markdown from `invariants.md`
- Grouped by source (documentation vs code)
- Discrepancies section highlighted prominently
- Confidence badges (high/medium/low)

**Data sources:** `invariants.md`

---

#### 6.3.9 Spec Conformance

**URL:** `/conformance`

**Content:**
- Summary bar: count by status (CONFORMS, DEVIATES, PARTIAL, UNVERIFIABLE, UNDOCUMENTED)
- Table of all conformance checks, sorted by status (deviations first)
- Filterable by: source (external docs, NatSpec, interface, ERC/EIP), status, confidence
- DEVIATES items highlighted in red with severity hint badges
- Click a row → see the spec text, the code location, and the finding explanation side-by-side
- Link to related invariants where applicable

**Data sources:** `spec-conformance.json`

---

#### 6.3.10 Annotations

**URL:** `/annotations`

**Content:**
- Table of all `@audit` annotations
- Filterable by type: issue, issue-verified, question, note
- Status indicators: unverified (orange), verified (green), open question (blue)
- Click → see code context and link to finding if verified
- "Refresh" button that triggers `solaudit annotations` via the dashboard (single exception to read-only: it triggers a CLI command)

**Data sources:** `annotations.json`

---

#### 6.3.11 Findings

**URL:** `/findings`

**Content:**
- Rendered findings from `findings.md`
- Summary table at top: count by severity (computed from `findings.json`)
- Each finding rendered with full template structure
- Link to PoC file and validation memo for each finding
- Severity badges

**Data sources:** `findings.json` (for summary stats, filtering), `findings.md` (for rendered display)

---

#### 6.3.12 Tracking Table

**URL:** `/tracking`

**Content:**
- Master table of ALL findings (manual + all AI agents)
- Columns: ID, title, severity, source, status, PoC status, duplicates
- Filterable by: source, severity, status
- Status indicators: verified (green), pending (yellow), rejected (red)
- Summary stats: total findings, unique findings, duplicates, pending validation

**Data sources:** `tracking.json`, `comparison.json`

---

## 7. AI Context Strategy

### 7.1 Model Selection

- **Primary model:** Claude (via Claude Code) — used for all AI-assisted skills
- **Model for skills:** Configurable in `config.json` → `settings.ai_model`. Default: `claude-sonnet-4-20250514`. Can be upgraded for complex analysis.

**Per-skill model recommendations:**

| Skill | Recommended Model | Rationale |
|-------|-------------------|-----------|
| `init-audit` | Sonnet | Orchestration only, runs CLI tools, no deep reasoning needed |
| `generate-overview` | Sonnet | Summarization task, well within Sonnet's capabilities |
| `generate-diagram` | Sonnet | Structured output generation from structured input |
| `generate-flows` | Opus | Requires deep code comprehension and tracing complex execution paths |
| `identify-invariants` | Opus | Critical reasoning task — must reason about implicit guarantees across contracts and docs |
| `check-spec-conformance` | Opus | Must cross-reference multiple spec sources against implementation details, detect subtle behavioral deviations |
| `generate-poc` | Opus | Must trace exploit paths, reason about edge cases, and write compilable test code |
| `write-finding` | Sonnet | Structured writing from already-validated issue — template-driven |
| `compare-findings` | Sonnet | Semantic matching and classification, not deep code analysis |
| `validate-ai-finding` | Opus | Must independently verify a claim by tracing code — same complexity as original auditing |

**Claude Code model limitation:** As of now, Claude Code uses a single model for the entire session. You cannot programmatically switch models mid-session from within a skill. To use Opus for a specific skill, you need to manually switch the model in Claude Code settings before invoking that skill. The `ai_model` field in `config.json` serves as a reminder of which model the skill was designed for, and skills should include a note like "Recommended model: Opus" at the top so the auditor knows to switch if needed. If Claude Code adds per-task model selection in the future, the skill files can specify this directly.

### 7.2 Context Assembly Rules

| Phase | Context needed | Assembly strategy |
|-------|---------------|-------------------|
| 1.1 Overview | Full codebase + docs | `solaudit context` (full) + fetched docs |
| 1.3 Diagram | Dependency graph + stats | `deps.json` + `stats.json` (small, structured — no full code needed) |
| 1.4 Flows | Full codebase + access + calls | `solaudit context` (full) + `access-control.json` + `external-calls.json` |
| 1.5 Invariants | Full codebase + docs + state vars | `solaudit context` (full) + docs + `state-vars.json` |
| 1.6 Spec conformance | Full codebase + docs + NatSpec + interfaces + ERC/EIP standards | `solaudit context` (full) + docs + `stats.json` (for ERC list) + `invariants.md` |
| 3.1 PoC | Targeted contracts + existing test infra | `solaudit context --target <contract>` (focused) + existing test base contracts and setup |
| 3.2 Finding | Issue + PoC + targeted code | Annotation + PoC file + `solaudit context --target` |
| 4.2 Compare | Own findings + AI results | `findings.json` + AI result files (no code needed) |
| 4.3 Validate | AI finding + targeted code | Finding description + `solaudit context --target` |

### 7.3 Token Budget Management

The `solaudit context` tool should include a `--estimate` flag that reports token count without outputting context:

```bash
$ solaudit context --estimate
Total in-scope: 14,230 nSLOC
Estimated tokens: 67,400
Strategy: full context (fits in single prompt)
```

For codebases exceeding 150k tokens:
- Chunk by clusters from `deps.json`
- Include a 500-token summary of excluded contracts ("Contract X: ERC4626 vault, 342 nSLOC, interacts with Strategy and Oracle")
- Skills should make multiple passes if needed, one cluster at a time

---

## 8. Build Order

Phased delivery so the toolkit is usable incrementally.

### Phase A — Foundation

**Goal:** Be able to initialize an audit and get basic stats.

Build:
- [ ] `solaudit init`
- [ ] `solaudit stats`
- [ ] `solaudit deps`
- [ ] `config.json` schema and validation
- [ ] Project directory structure

**Usable after this phase:** You can set up an audit and see codebase stats from the CLI.

---

### Phase B — Analysis Tools

**Goal:** All deterministic analysis tools working.

Build:
- [ ] `solaudit access`
- [ ] `solaudit state`
- [ ] `solaudit calls`
- [ ] `solaudit annotations`
- [ ] `solaudit context`
- [ ] `solaudit render-findings`
- [ ] Confidence + provenance metadata on all analysis outputs

**Usable after this phase:** Full deterministic analysis available via CLI. Claude Code can already use these tools manually even without formal skills.

---

### Phase C — Core Skills

**Goal:** AI-assisted analysis working via Claude Code.

Build:
- [ ] Skill: `init-audit` (orchestrates Phase A+B tools)
- [ ] Skill: `generate-overview`
- [ ] Skill: `identify-invariants`
- [ ] Skill: `check-spec-conformance`
- [ ] Skill: `generate-poc`
- [ ] Skill: `write-finding`

**Usable after this phase:** Full audit workflow from understand → review → findings, all via CLI + Claude Code.

---

### Phase D — Dashboard MVP

**Goal:** Visualization layer for all generated data.

Build:
- [ ] Next.js project setup with file-watching
- [ ] Home/Overview page
- [ ] Statistics page
- [ ] Access Control page
- [ ] State Variables page
- [ ] External Calls page
- [ ] Invariants page
- [ ] Spec Conformance page
- [ ] Annotations page
- [ ] Findings page

**Usable after this phase:** Full Phase 1-3 workflow with visual dashboard.

---

### Phase E — Diagrams

**Goal:** Excalidraw diagram generation.

Build:
- [ ] Skill: `generate-diagram`
- [ ] Skill: `generate-flows`
- [ ] Dashboard: Diagram page with Excalidraw viewer
- [ ] Dashboard: Flows page with Excalidraw viewer

**Usable after this phase:** Complete Phase 1 with visual diagrams.

---

### Phase F — AI Comparison

**Goal:** Phase 4 re-audit workflow.

Build:
- [ ] AI results import format (standardized JSON schema for pasting Nethermind/Zellic/other outputs)
- [ ] Skill: `compare-findings`
- [ ] Skill: `validate-ai-finding`
- [ ] Dashboard: Tracking Table page

**Usable after this phase:** Complete end-to-end audit workflow.

---

## 9. Open Decisions

Items intentionally left flexible for future resolution:

| Decision | Current default | Can be changed to |
|----------|----------------|-------------------|
| Output directory name | `.solaudit/` | Any path via `config.json` |
| AI model | `claude-sonnet-4-20250514` | Any Claude model |
| Finding template | Built-in markdown template | Custom template file |
| Excalidraw generation | Via Claude Code skill | Could become a deterministic tool if patterns stabilize |
| External AI agent import | Manual file upload | API integration per agent |
| Dashboard port | 3000 | Configurable |
| Annotation refresh | Manual CLI command | Could become a file watcher |

---

## 10. Non-Goals (Explicitly Out of Scope)

- **Report generation:** No formatted PDF/DOCX report output (for now)
- **Contest platform integration:** No Sherlock/C4/Cantina support
- **Checklist system:** No per-contract review checklist
- **Session/time tracking:** No time-per-file logging
- **Deployed dashboard:** Localhost only
- **Multi-auditor collaboration:** Single auditor workflow
- **Known attack pattern pre-scan:** Covered by Phase 4 AI agents
