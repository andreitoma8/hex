# Skill: Generate Proof of Concept

**Recommended model:** Opus

## Context Assembly

Read:
- The annotation or issue description provided by the auditor
- Run: `npx solaudit context --target <relevant_contract>` for focused context
- `<output_dir>/state-vars.json` — for relevant state variable info
- `<output_dir>/access-control.json` — for access restrictions
- `<output_dir>/external-calls.json` — for external call surface (if relevant)

## Step 0: Understand the Project's Test Infrastructure

Before writing any test code, inspect the project's existing test setup:

1. Look at the test directory structure (`test/`, `tests/`, etc.)
2. Read 2-3 existing test files to understand:
   - Which test framework is used (Foundry, Hardhat/Mocha, Brownie, etc.)
   - How contracts are deployed in tests (direct deploy, factory, fork, etc.)
   - Existing base test contracts or test helpers (e.g., `BaseTest.sol`, `TestSetup.sol`)
   - How tokens are dealt, accounts are impersonated, etc.
   - Fork configuration (RPC URL, block number) if applicable
3. Read the project config (`foundry.toml`, `hardhat.config.ts`, etc.) for test settings

**CRITICAL:** Reuse existing test infrastructure. If the project has a `BaseTest.sol` that deploys the full system, inherit from it. Do NOT recreate deployment logic that already exists.

## Step 1: Validate by Reasoning

Before writing any code, reason through:

1. **Is this actually exploitable?** Trace the exact execution path step by step.
2. **What are the preconditions?** What state must the system be in? What does the attacker need?
3. **What would the impact be?** Quantify if possible (fund loss amount, DoS duration, etc.)
4. **Are there existing protections?** Check for:
   - Reentrancy guards
   - Access control that prevents the attack path
   - Input validation that blocks required preconditions
   - Economic constraints that make the attack unprofitable

If you conclude the issue is **NOT valid**, explain why clearly and stop. Still write the validation memo.

## Step 2: Write PoC (only if Step 1 validates)

### Foundry Project
```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {BaseTest} from "../BaseTest.sol";  // or whatever the project uses

contract F001_Description_PoC is BaseTest {
    function setUp() public override {
        super.setUp();
        // Only add PoC-specific setup here
    }

    function test_poc_description() public {
        // Step 1: Set up initial state
        // Step 2: Execute attack
        // Step 3: Assert impact
    }
}
```

### Hardhat/TypeScript Project
```typescript
import { expect } from "chai";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { deployFixture } from "../helpers/deploy";

describe("F001 - Description", function () {
  it("should demonstrate the vulnerability", async function () {
    // Reuse project fixtures
    // Step-by-step attack
    // Assert impact
  });
});
```

Requirements:
- Match the project's coding style and conventions
- Inherit from / reuse existing test base contracts or fixtures
- Add descriptive comments for each step
- End with clear assertions that demonstrate the impact
- Name the file: `test/poc/<finding_id>_<short_name>.t.sol` (Foundry) or `.test.ts` (Hardhat)

## Step 3: Run and Verify

Run the test:
- Foundry: `forge test --match-test test_poc_description -vvv`
- Hardhat: `npx hardhat test test/poc/<file> --grep "poc_description"`

If it fails, debug and fix. Iterate until the PoC passes.

## Output

**Always produce a validation memo** at `<output_dir>/validations/<annotation_id>_memo.md`:

```markdown
# Validation Memo: <ID> — <Title>

**Verdict:** Valid / Invalid / Uncertain
**Date:** <YYYY-MM-DD>
**Annotation:** <ID> (<file>:<line>)

## Reasoning
[Step-by-step reasoning from Step 1]

## Execution Path
[Traced call path: function1() -> function2() -> ...]

## Protections Considered
[Existing guards, checks, or mitigations evaluated and why they don't prevent the issue]

## Conclusion
[If valid: summary of exploit + pointer to PoC file]
[If invalid: clear explanation of why not exploitable]
[If uncertain: specific questions for manual investigation]
```

If valid, also write the test file to the project's test directory.
