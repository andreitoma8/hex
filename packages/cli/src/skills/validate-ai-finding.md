---
description: "Independently verify a novel finding from an AI audit agent"
---

# Skill: Validate AI Finding

**Recommended model:** Opus

## Context Assembly

Read the specific AI finding from `<output_dir>/comparison.json` → novel findings.
The auditor will specify which finding to validate (by ID or description).

Run: `npx solaudit context --target <affected_contract>` for focused context.

Also read:
- `<output_dir>/state-vars.json` — for state variable details
- `<output_dir>/access-control.json` — for access restrictions
- `<output_dir>/external-calls.json` — for external call surface

## Task

### 1. Understand the Claim
Read the AI agent's finding carefully. Extract:
- What vulnerability is being claimed?
- What contract/function is affected?
- What is the claimed attack path?
- What is the claimed impact?

### 2. Trace the Attack Path
In the actual code:
- Follow the described attack path step by step
- Check each precondition the attack requires
- Verify the claimed state changes actually occur
- Check if the impact is correctly assessed

### 3. Evaluate

**If Valid:**

1. Use the **AskUserQuestion** tool to ask:
   > The finding appears **VALID**. How would you like to proceed?
   >
   > 1. Generate a full PoC test, then write the finding
   > 2. Accept with rational verification only (no PoC — just validation memo + finding)
   >
   > Reply **1** or **2**.

2. **If the user chooses 1 (PoC):**
   - Follow the `generate-poc` skill to create a PoC
   - Follow the `write-finding` skill to write the finding

3. **If the user chooses 2 (rational verification only):**
   - Write the validation memo (see Output section below)
   - Follow the `write-finding` skill to write the finding with `poc.status: "not_started"` and `poc.file: null`

4. Update tracking: `status: "verified"`

5. **After the finding has been written**, use the **AskUserQuestion** tool to ask:
   > Finding written as **F\<NNN\>** with severity: **\<current severity\>**.
   >
   > Would you like to change the severity? Reply with the new severity (Critical / High / Medium / Low / Info), or **no** to keep it.

6. If the user provides a new severity:
   - Update the finding in `<output_dir>/findings.json`
   - Update `<output_dir>/tracking.json` if it has a severity field for this entry

**If Invalid:**
- Explain exactly why:
  - Is the attack path blocked? By what? (modifier, require, state check)
  - Are the preconditions impossible? Why?
  - Is the impact assessment wrong? What actually happens?
- Update tracking: `status: "rejected"`

**If Uncertain:**
- List specific questions that need manual investigation
- What would confirm or deny the finding?
- Update tracking: `status: "pending_validation"` with notes

## Output

Write a validation memo at `<output_dir>/validations/<finding_id>_memo.md`:

```markdown
# AI Finding Validation: <ID> — <Title>

**Source:** <agent name>
**Original ID:** <original finding id>
**Verdict:** Valid / Invalid / Uncertain
**Date:** <YYYY-MM-DD>

## AI Agent's Claim
[Summarize what the AI agent reported]

## Analysis
[Step-by-step trace through the code]

## Protections Evaluated
[Access control, reentrancy guards, input validation, etc.]

## Verdict Reasoning
[Why valid/invalid/uncertain]

## Action Taken
[If valid: PoC written, finding created]
[If invalid: no further action needed]
[If uncertain: questions for manual review listed]
```

Update `<output_dir>/tracking.json` with the validation result.
