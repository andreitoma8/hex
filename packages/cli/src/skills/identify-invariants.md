# Skill: Identify Invariants

**Recommended model:** Opus

## Context Assembly

Read these files from the output directory:
- `config.json` — for docs URL and scope
- `stats.json` — for contract overview
- `state-vars.json` — for key state variables and their mutability
- `access-control.json` — for role restrictions
- `deps.json` — for contract relationships

Run: `npx solaudit context` to get the full codebase.

If `config.json` has a `docs_url`, fetch and read the full documentation.

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
Read the contracts and identify invariants that are enforced or assumed:

- **Arithmetic invariants** — e.g., `totalAssets >= sum of deposits - withdrawals`
- **Access control invariants** — e.g., only owner can call `setFee`
- **State machine invariants** — e.g., contract cannot be unpaused once deprecated
- **Token accounting invariants** — e.g., `contract.balance >= tracked internal balance`
- **Ordering invariants** — e.g., `initialize` must be called before `deposit`
- **Boundary invariants** — e.g., `fee <= MAX_FEE`
- **Reentrancy invariants** — e.g., state updates before external calls

Use `state-vars.json` to identify key state variables and their constraints.
Use `access-control.json` to verify access control claims.

### Pass 3: Compare and Reconcile
- Flag any invariant stated in docs but **not enforced** in code (potential bug)
- Flag any invariant enforced in code but **not documented** (implicit assumption)
- Flag any invariant that is **partially enforced** (enforced in some paths but not others)
- Rate confidence: high (clearly enforced with explicit checks), medium (partially enforced), low (assumed but not checked)

## Output Format

Write to `<output_dir>/invariants.md`:

```markdown
# Protocol Invariants

## From Documentation
1. [INV-D01] <invariant statement> — **Confidence: High/Medium/Low** — Enforced in: <file:line> — Source: <doc reference>

## From Code Analysis
1. [INV-C01] <invariant statement> — **Confidence: High/Medium/Low** — Enforced in: <file:line>

## Discrepancies
1. [DISC-01] <description of mismatch between docs and code>
   - **Docs say:** <quote>
   - **Code does:** <description>
   - **Risk:** <potential impact>

## Implicit Assumptions
1. [ASSUM-01] <assumption that the code relies on but never explicitly checks>
   - **Where:** <file:line>
   - **If violated:** <what breaks>
```
