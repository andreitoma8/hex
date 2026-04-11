---
description: "Three-pass invariant identification from docs, code, and comparison"
---

# Skill: Identify Invariants

**Recommended model:** Opus

## Context Assembly

Read these files from the output directory:
- `config.json` — for docs URL and scope
- `stats.json` — for contract overview and ERC/EIP usage
- `state-vars.json` — for key state variables and their mutability
- `access-control.json` — for role restrictions
- `deps.json` — for contract relationships
- `patterns.json` — for protocol pattern flags, `protocol_hints`, and risk areas
- `attack-surface.json` — for entry point classification, token interactions, and external dependencies
- `constraints.json` — for setter constraints and enforcement status

Run: `npx hex context` to get the full codebase.

If `config.json` has a `docs_url`, fetch and read the full documentation.

### Protocol-Type Detection

Read `.hex/patterns.json` and classify the protocol archetype:
- If `protocol_hints` includes "vault" or ERC4626 flag detected → **Vault** archetype
- If ORACLE flag + lending-related contract names → **Lending** archetype
- If `protocol_hints` includes "cross-chain" → **Bridge** archetype
- If governance-pattern contracts (Governor, Timelock, Voting) → **Governance** archetype
- If AMM/DEX patterns (constant product, swap, liquidity pool) → **AMM/DEX** archetype
- If staking/reward distribution patterns → **Staking** archetype
- Multiple archetypes may apply. Note all detected archetypes.

## Task — Three-Pass Analysis

### Pass 1: From Documentation
Read the documentation and extract every stated invariant, guarantee, or assumption:
- Explicit invariants ("total shares always equals sum of individual balances")
- Behavioral guarantees ("fee never exceeds 10%")
- Access control claims ("only the owner can pause")
- Safety properties ("withdrawals are always possible")
- Economic assumptions ("the oracle always returns a positive price")

For each, note the source (doc page/section) and quote the relevant text.

### Pass 2: From Code

Read the contracts and identify invariants that are enforced or assumed. Classify each invariant into one of the following 8 categories (aligned with the Trace2Inv taxonomy, FSE 2024):

1. **Access Control** — who can call what
   - Role exclusivity: only designated role can call sensitive functions
   - Role hierarchy: higher roles inherit lower role permissions correctly
   - Admin-only state changes: privileged operations properly gated
   - Permission revocation completeness: revoking a role removes all associated access
   - Privilege separation: no single role can perform all critical operations
2. **Time Lock** — temporal constraints
   - Delay enforcement: timelocked operations respect minimum delay
   - Deadline expiry: time-bounded operations revert after deadline
   - Cooldown periods: rate-limited operations enforce minimum intervals
3. **Gas Control** — bounded computation
   - Gas limits on loops: unbounded loops over dynamic arrays are capped or avoided
   - Bounded iteration: iteration counts have maximum limits
4. **Reentrancy** — state-before-interaction patterns
   - Checks-effects-interactions ordering: state updated before external calls
5. **Oracle Slippage** — price/data feed bounds
   - Staleness checks: oracle data validated for recency (heartbeat, updatedAt)
   - Deviation bounds: price changes bounded to prevent manipulation (max deviation per update)
6. **Special Storage** — storage layout invariants
   - Slot collision avoidance: no unintended storage overlap in proxy/upgradeable contracts
   - Initialization guards: initializers can only be called once, `_disableInitializers` in constructors
7. **Money Flow** — token/ETH conservation
   - Balance conservation: tokens in == tokens out + fees across all paths (no creation or destruction)
   - Fee bounds: fees capped at documented maximum, never exceed 100%
   - Share-to-asset monotonicity: share price can only increase (for vault-type contracts)
   - Withdrawal completeness: users can always withdraw their fair share
8. **Data Flow** — cross-function state consistency
   - Cross-function invariant preservation: state variables remain consistent across related function calls
   - Mapping consistency: related mappings stay in sync (e.g., balance mapping and total supply)
   - Array-length bounds: dynamic arrays have maximum length limits
   - Enum range validity: enum values stay within defined range

Use `state-vars.json` to identify key state variables and their constraints.
Use `access-control.json` to verify access control claims.
Use `constraints.json` to identify setters with missing enforcement.

### Protocol-Archetype Invariant Check

After the general analysis, check for invariants specific to the detected protocol archetype. These are the invariants most frequently violated in real-world exploits:

**Vault / ERC-4626:**
- Solvency: `totalAssets() >= totalSupply()` at all times (accounting for rounding)
- Share price monotonicity: share price can only increase over time (no share inflation)
- Rounding direction: `convertToShares` rounds down, `convertToAssets` rounds down (favoring the vault, never the user)
- First-depositor defense: virtual shares, minimum deposit, or dead shares prevent share inflation attack
- Withdrawal guarantee: depositors can always redeem shares for proportional assets

**AMM / DEX:**
- Constant product preservation (or curve-specific invariant) holds after every swap
- Pool value per LP share is monotonically non-decreasing
- Reserve non-negativity: pool reserves never go negative
- Slippage bounds enforced on every user-initiated swap

**Lending:**
- Health factor > 1 for all accounts after every non-liquidation operation
- Collateralization: total borrows <= total deposits * maximum LTV
- Interest rate monotonicity: utilization increase → interest rate increase
- Liquidation incentive: liquidator bonus covers gas + bad debt in worst case

**Staking:**
- Reward proportionality: rewards distributed proportional to stake amount and staking duration
- Conservation: `totalStaked == sum of all individual stakes`
- Reward sufficiency: `rewardRate * duration <= rewardBalance` (rewards are funded)

**Bridge:**
- Message nonce uniqueness: no replay of cross-chain messages
- Cross-chain conservation: source chain lock/burn == destination chain mint/unlock
- Finality enforcement: message processing waits for source chain finality

### Commonly Missed Invariant Check

Explicitly verify these 7 frequently overlooked invariant types (the most common root causes in real-world exploits):

1. **Conservation laws** — tokens in == tokens out + fees across ALL code paths. Check that no path creates or destroys value. (Example: Euler Finance $197M exploit violated conservation because `donateToReserves` reduced an account's collateral without a health check.)
2. **Cross-function consistency** — state variables updated atomically across related functions. If function A reads state that function B writes, can B be called between A's read and A's subsequent use?
3. **Rounding direction** — always favors the protocol (vault, pool, lender), never the user. Check all division operations, especially in share/asset conversions.
4. **Flash loan guards** — state cannot be manipulated within a single transaction to extract value. Check if critical price/balance reads can be influenced by flash-borrowed capital.
5. **Oracle manipulation bounds** — price cannot be moved more than a safe percentage in one block. Check for TWAP window adequacy and spot price usage.
6. **Authorization completeness** — every external/public state-changing function has appropriate access control. Use `attack-surface.json` `entry_points.permissionless` to identify unguarded functions.
7. **Share price monotonicity** — for any vault-type contract, verify that no operation can decrease the share price (asset-per-share ratio).

### Pass 3: Compare and Reconcile
- Flag any invariant stated in docs but **not enforced** in code (potential bug)
- Flag any invariant enforced in code but **not documented** (implicit assumption)
- Flag any invariant that is **partially enforced** (enforced in some paths but not others)
- Rate confidence: high (clearly enforced with explicit checks), medium (partially enforced), low (assumed but not checked)

## Discrepancy Severity Guide

Rate each discrepancy using the same Likelihood x Impact matrix as findings:

| | Low Impact | Medium Impact | High Impact |
|---|---|---|---|
| **High Likelihood** | Medium | High | Critical |
| **Medium Likelihood** | Low | Medium | High |
| **Low Likelihood** | Info | Low | Medium |

## Output Format

Write to `<output_dir>/invariants.md`:

```markdown
# Protocol Invariants

## From Documentation
1. [INV-D01] <invariant statement> — **Confidence: High/Medium/Low** — Enforced in: <file:line> — Source: <doc reference>

## From Code Analysis
1. [INV-C01] [<Category>] <invariant statement> — **Confidence: High/Medium/Low** — Enforced in: <file:line>

## Discrepancies
1. [DISC-01] <description of mismatch between docs and code>
   - **Severity:** Critical/High/Medium/Low/Info
   - **Docs say:** <quote>
   - **Doc ref:** <section name, URL anchor, or page reference from the documentation>
   - **Code does:** <description>
   - **Risk:** <explanation of potential impact>

## Implicit Assumptions
1. [ASSUM-01] <assumption that the code relies on but never explicitly checks>
   - **Where:** <file:line>
   - **If violated:** <what breaks>
```

**CRITICAL:** The output section headers (`## From Documentation`, `## From Code Analysis`, `## Discrepancies`, `## Implicit Assumptions`) and ID prefixes (`INV-D`, `INV-C`, `DISC-`, `ASSUM-`) MUST remain exactly as shown above. The dashboard parses this markdown using regex and will break if headers or ID formats change. The Trace2Inv category tag (e.g., `[Money Flow]`, `[Access Control]`) goes inside the invariant statement text on the `[INV-C##]` line, not as a separate section header.
