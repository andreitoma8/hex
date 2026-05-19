---
description: "Generate a protocol overview from codebase and analysis data"
---

# Skill: Generate Protocol Overview

**Recommended model:** Sonnet

## Context Assembly

Read these files from the output directory:
- `config.json` — for project name, scope, chain, docs URL
- `stats.json` — for high-level numbers (contracts, nSLOC, ERCs, dependencies)
- `deps.json` — for contract relationships and clusters
- `access-control.json` — for roles, modifiers, and access restrictions
- `patterns.json` — for protocol pattern flags and `protocol_hints`
- `attack-surface.json` — for entry points (permissionless/role-gated/owner-only), token interactions, external dependencies
- `constraints.json` — for setter constraints and enforcement status

Run: `npx hex context` to get the full codebase context.

If `config.json` has a `docs_url`, fetch and read the documentation.

### Protocol-Type Detection

Read `.hex/patterns.json` and classify the protocol archetype:
- If `protocol_hints` includes "vault" or ERC4626 flag detected → **Vault** archetype
- If ORACLE flag + lending-related contract names (e.g., Lend, Borrow, Liquidate, Pool) → **Lending** archetype
- If `protocol_hints` includes "cross-chain" → **Bridge** archetype
- If governance-pattern contracts detected (Governor, Timelock, Voting) → **Governance** archetype
- If AMM/DEX patterns (constant product, swap, liquidity pool, Router) → **AMM/DEX** archetype
- If staking/reward distribution patterns (Staking, RewardDistributor, Gauge) → **Staking** archetype
- Multiple archetypes may apply (e.g., a vault that uses oracles). Note all detected archetypes.

Read `.hex/attack-surface.json` for:
- `entry_points.permissionless` — functions anyone can call
- `entry_points.role_gated` — functions restricted by role
- `entry_points.owner_only` — admin-only functions
- `token_interactions` — token in/out flows
- `external_dependencies` — oracle, DEX, lending protocol integrations

## Task

Write a protocol overview that explais what the protocol is, what it aims to do, and foregrounds trust assumptions and security-critical design decisions. Identify and explain who holds power, and what can go wrong. Be precise and technical. Reference specific contract names and functions where relevant.

### Protocol-Type Specific Guidance

Based on the detected archetype, emphasize the following in the overview:

- **Vault**: share pricing mechanism, withdrawal queue/delays, strategy relationships, yield source, fee structure
- **Lending**: collateralization model, liquidation mechanism, interest rate model, oracle dependency, bad debt handling
- **Bridge**: message passing mechanism, validator/relayer set, finality requirements, replay protection
- **Governance**: voting mechanism, proposal lifecycle, quorum requirements, timelock delays, veto capabilities
- **AMM/DEX**: pricing curve, liquidity provision, fee tiers, MEV protection, router permissions
- **Staking**: reward distribution model, lock-up periods, slashing conditions, compounding mechanism

**Do NOT:**
- List findings or security concerns (this is descriptive)
- Speculate about vulnerabilities
- Include code snippets
- Add disclaimers about AI limitations
- Omit trust assumptions even if none seem concerning (every protocol has them)
- Skip the Roles & Actors table (even if only `onlyOwner` exists, document what the owner can do)

## Output

Write the overview to `<output_dir>/overview.md` with this format:

```markdown
# Protocol Overview: [Name]

## Purpose
[1-2 Paragraphs: what the protocol does, target users, the problem it solves, architecture]

## Key Contracts

| Contract | Type | nSLOC | Role | Entry Points |
|----------|------|-------|------|--------------|
| ... | Core/Token/Oracle/Gov/Storage | ... | One-line purpose | public/external count |

## Roles & Actors

| Role | Granted Via | Permissions | Risk if Compromised |
|------|------------|-------------|---------------------|
| Owner | constructor / transferOwnership | Can set fees, pause, upgrade | Full protocol control — fund theft possible |
| Keeper | KEEPER_ROLE via AccessControl | Can trigger harvests, rebalance | Could manipulate strategy timing |
| Anyone | (permissionless) | Can deposit, withdraw, liquidate | N/A — intended public access |

Populate from `access-control.json` roles and `attack-surface.json` entry point classification. Include every distinct role, even if only one exists.

## Trust Assumptions

For each trust assumption the protocol relies on, state:
1. The assumption itself
2. What depends on it (which functions, what value is at risk)
3. The consequence if broken — categorize as:
   - **Catastrophic** (direct fund loss, total protocol failure)
   - **Severe** (partial fund loss, protocol degradation requiring intervention)
   - **Moderate** (degraded service, no direct fund loss)

Common trust assumptions to check:
- Admin/owner behaves honestly (no rug pull via upgrades, fee changes, or pausing)
- Oracle returns accurate and timely prices
- External protocols (DEX, lending, bridge) function correctly
- Block timestamps are approximately accurate
- Sufficient liquidity exists for operations to succeed

## External Dependencies

| Dependency | Type | Trust Level | Called By | Risk if Compromised |
|-----------|------|------------|----------|---------------------|
| Chainlink | Oracle | High trust | Vault.getPrice() | Stale/manipulated prices → bad liquidations |
| Uniswap V3 | DEX | Medium trust | Router.swap() | Sandwich attacks, liquidity drain |

Populate from `attack-surface.json` `external_dependencies`.

## Upgradeability Status

For each upgradeable contract:
- Proxy pattern used (UUPS, Transparent, Beacon, Diamond, or custom)
- Who controls the upgrade (EOA, multisig, timelock, governance)
- Timelock delay (if any)
- Whether `_disableInitializers` is called in implementation constructor
- Whether storage layout is compatible across versions

If no contracts are upgradeable, state: "No upgradeable contracts detected."

## Token Interactions

| Contract | Function | Token | Direction | Mechanism |
|----------|----------|-------|-----------|-----------|
| Vault | deposit() | USDC | In | transferFrom |
| Vault | withdraw() | USDC | Out | transfer |

Populate from `attack-surface.json` `token_interactions`.

## Security-Critical Design Decisions

Document decisions that create concentrated risk:
- **Single points of failure**: single-EOA ownership without multisig, no timelock on sensitive operations
- **Missing timelocks**: admin functions that take effect immediately (fee changes, strategy swaps, pausing)
- **Unenforced constraints**: setters without input validation (from `constraints.json` — look for setters where `enforced` is false)
- **Privileged operations without delay**: upgrade, pause, migration functions callable by a single address
- **Economic assumptions**: hardcoded parameters (max fees, slippage tolerances, liquidation thresholds) that could become unsafe under market conditions

## Architecture Notes
- [Notable design patterns used and their implications]
- [Protocol-type-specific architectural observations based on detected archetype]
- [Concerns or unusual patterns worth investigating during review]
```
