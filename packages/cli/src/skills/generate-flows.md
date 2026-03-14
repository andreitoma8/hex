---
description: "Generate Excalidraw flow charts by user type and value paths"
---

# Skill: Generate Flow Charts

**Recommended model:** Opus

## Context Assembly

Run: `npx solaudit context` to get the full codebase.

Read these files from the output directory:
- **`access-control.json`** — Role → function mapping
  - `roles`: Array of `{ role, confidence, functions: [{ contract, function }] }`
- **`external-calls.json`** — External call surface with trust levels
  - `calls`: Array of `{ contract, function, target, method, trust_level, call_type }`
- **`state-vars.json`** — State variable inventory
  - `variables`: Array of `{ contract, name, type, visibility, mutability, ... }`
- **`stats.json`** — Contract overview, types, sizes, ERC/EIP data
  - `per_contract`: Array of `{ contract, file, type, nsloc, functions, external_functions, inherits, ... }`
  - `erc_eip_usage`: Detected ERC/EIP standards across the protocol
- **`deps.json`** — Contract relationships, clusters, inheritance
  - `graph`: Record of contract name → `{ inherits, imports, calls }`
  - `clusters`, `inheritance_trees`, `topological_order`
- **`overview.md`** (optional) — AI-generated protocol overview. If present, extract per-contract purpose descriptions to inform swim lane headers, flow naming, and annotations.

### ERC/EIP Mapping

Using `stats.json.per_contract.inherits`, determine which contracts implement ERC/EIP standards (e.g., if Vault inherits ERC4626, label it `[ERC-4626]`). Cross-reference with `stats.json.erc_eip_usage` to confirm. Use these labels in swim lane headers.

## Task

Create Excalidraw flow charts for every significant flow in the protocol.

**Critical instruction:** All labels, node text, and annotations must use **plain English descriptions** — not Solidity code. The audience is someone who wants to understand the protocol flow without reading source code. Function names, variable names, and Solidity syntax must NOT appear in node labels. You may include them as small, secondary annotations only if needed for cross-referencing with the codebase.

### Flow Grouping

Group flows by:

1. **User type** (from access control: anyone, owner, keeper, etc.)
   - For each role, trace what functions they can call and what those functions do

2. **Value flows** (any path where tokens/ETH move)
   - Deposits, withdrawals, fee collection, liquidations, swaps
   - Mark entry/exit points for value

3. **Admin flows** (configuration, pausing, upgrades)
   - What can the admin change?
   - What are the consequences of each admin action?

### For Each Flow

- Start with the entry point (the user action that triggers the flow)
- Trace through all internal steps, state changes, and external interactions
- End at the outcome (result returned, tokens transferred, or operation rejected)
- Mark where value (tokens/ETH) enters or leaves the system with a red border
- Mark where important protocol state is modified with a yellow highlight
- Show rejection conditions as red diamond decision nodes

### Plain-English Labeling Rules

Every label in the diagram must follow these rules:

**Swim lane headers** — Use contract purpose + ERC label, not just the contract name:
- Bad: `Vault`
- Good: `Vault [ERC-4626] — Main deposit/withdrawal entry`
- Derive the purpose from `overview.md` (if available) or infer from the contract's role. Include the ERC label from `stats.json.per_contract.inherits` when applicable.

**Node labels (steps)** — Describe what happens, not what function is called:
- Bad: `_deposit(assets, shares, receiver)`
- Good: `Calculate shares for deposited assets and mint to receiver`

**State change labels** — Describe the effect on the protocol, not the variable:
- Bad: `totalAssets += amount`
- Good: `Increase tracked total assets`

**Decision nodes** — Describe the condition in plain terms:
- Bad: `require(assets > 0)`
- Good: `Deposit amount must be > 0`

**External call labels** — Describe the purpose of the interaction:
- Bad: `IERC20(token).transferFrom(msg.sender, address(this), assets)`
- Good: `Pull deposited tokens from user`

**Value transfer arrows** — Describe what moves and where:
- Bad: `safeTransfer(token, receiver, amount)`
- Good: `Send withdrawal proceeds to user`

The goal: same information density as code-level labels, but written for someone reviewing the protocol's logic without a code editor open.

### Layout

Use swim lanes to separate contracts:
- Each contract gets a vertical column
- The column header includes: contract name, ERC label (if any), and one-line purpose (from `overview.md` or inferred)
- Steps between contracts are horizontal arrows with plain-English labels
- State changes are annotated inline with plain-English descriptions
- External calls (to out-of-scope contracts) go to a separate "External" lane

### Visual Conventions

| Element | Shape | Color |
|---------|-------|-------|
| Entry point (user action) | Rounded rectangle | Green fill (#dcfce7) |
| Internal step | Rectangle | White fill |
| State change | Rectangle with dashed border | Yellow fill (#fef9c3) |
| External interaction | Rectangle with bold border | Red fill (#fee2e2) |
| Decision / validation check | Diamond | White fill |
| Value transfer | Arrow with "$" label | Red stroke |
| Return / rejection | Rounded rectangle | Gray fill |

## Output

Generate each flow as a separate file: `<output_dir>/flow-<name>.excalidraw` (e.g., `flow-deposit.excalidraw`, `flow-admin-pause.excalidraw`).

Generate flows one at a time, not programmatically all at once. If there are more than 3 flows, do them sequentially — verify each flow renders correctly before starting the next.

The JSON format follows the same schema as `generate-diagram.md`. Use the swim lane layout:
- Y-axis: flow progression (top to bottom)
- X-axis: contract separation (left to right)
- Each file contains a single flow
