---
description: "Validate any potential issue on the board (manual / auditagent / conformance / github) and promote it to Verified or Invalid"
---

# Skill: Validate Issue

**Recommended model:** Opus

## What this skill does

Takes a single potential issue from the dashboard's Issues board and runs an independent validation pass on it. Source-agnostic — the issue can come from any of:

- **Manual** (`/write-finding`) — `source: "manual"`, `status: "pending_validation"`.
- **Auditagent** (`/ingest-aa-report`) — `source: "auditagent"`, `status: "unverified"`.
- **Conformance** (materialized by `/init-audit`) — `source: "conformance"`, `status: "pending_validation"`.
- **GitHub** (teammate findings via `/sync-issues`) — `source: "github"`, `status: "pending_validation"`.

The skill writes a validation memo (always), optionally generates a PoC, and updates the tracking entry to `verified` or `rejected`. Card moves on the board.

## Invocation

The auditor invokes by id or by free-text reference:

```
/validate-issue F003
/validate-issue SC-007
/validate-issue AA-N002
/validate-issue for the rounding issue in Vault.sol
```

Resolve to a single tracking entry by:
1. Exact id match in `<output_dir>/tracking.json`, or
2. Title / description substring match (if multiple, ask the auditor to disambiguate).

## Context Assembly

Once the issue is resolved, read:

- `<output_dir>/tracking.json` — the entry being validated.
- Source-specific raw data:
  - `manual` → `<output_dir>/findings.json` (the full finding record).
  - `auditagent` → `<output_dir>/ai-results/auditagent/findings.json` (the matching `findings[*]` entry).
  - `conformance` → `<output_dir>/spec-conformance.json` (the matching `items[*]` entry).
  - `github` → `<output_dir>/external/github/findings.json` (the matching entry).
- `<output_dir>/state-vars.json`, `<output_dir>/access-control.json`, `<output_dir>/external-calls.json` for cross-referenced facts.
- The affected contract source via `npx hex context --target <affected_contract>`.

## Validation pass

### 1. Understand the claim

Extract from the source-specific record:
- The vulnerability being claimed (one sentence).
- The affected contract/function.
- The claimed attack path or spec violation.
- The claimed impact.

For conformance items, the "claim" is `spec_text` + the finding paragraph — i.e., "the spec says X, the code does Y".

### 2. Trace it in the code

- Follow the claimed path step by step in the actual code.
- Check each precondition.
- Verify the state changes actually occur.
- Check existing protections (modifiers, reentrancy guards, input validation, economic constraints).
- For conformance items: re-read the cited spec section, compare to the implementation.

### 3. Verdict

**Valid:**

1. Use **AskUserQuestion** to ask:
   > The issue appears **VALID**. How would you like to proceed?
   >
   > 1. Generate a full PoC test, then promote to Verified.
   > 2. Accept with rational verification only — validation memo, no PoC.
   >
   > Reply **1** or **2**.

2. **If PoC chosen:** invoke the `generate-poc` skill flow (read the project test setup, write the PoC, run and iterate until it passes). Set `poc.status = "passing"`, `poc.file = "test/hex-pocs/<id>_<name>.t.sol"`.

3. **If memo-only chosen:** leave `poc.status = "not_started"`, `poc.file = null`.

4. If the issue source is **conformance**, **auditagent**, or **github** (no manual finding record yet), invoke the `write-finding` skill flow to materialize a structured finding into `<output_dir>/findings.json` — reusing the existing tracking id. If `source = "manual"`, the finding already exists; update its `poc` block in place.

5. Update the tracking entry: `status = "verified"`, `poc_status` per choice above, `poc_file` per choice above.

6. For source files in `root_cause.locations[]`, replace any `// @audit-issue F<NNN>` annotation with `// @audit-issue-verified F<NNN> <short title>` (matching indentation).

7. Use **AskUserQuestion** to ask:
   > Issue verified as **\<id\>** with severity **\<current severity\>**.
   >
   > Would you like to change the severity? Reply with the new severity (Critical / High / Medium / Low / Info), or **no** to keep it.

8. If the user provides a new severity, update both `findings.json` and `tracking.json`.

**Invalid:**

1. Explain why:
   - Is the attack path blocked? By what specifically (modifier, require, state check)?
   - Are the preconditions impossible? Why?
   - Is the impact assessment wrong? What actually happens?
2. Update tracking: `status = "rejected"`.
3. Do NOT write a finding to `findings.json`. The memo alone records the reasoning.

**Uncertain:**

1. List specific questions that need manual investigation.
2. State what would confirm or deny the issue.
3. Leave tracking `status` as-is. Append findings to the `notes` field describing the open questions.

## Output: validation memo

Write `<output_dir>/validations/<id>_memo.md` (always — for valid, invalid, and uncertain verdicts):

```markdown
# Issue Validation: <ID> — <Title>

**Source:** <manual | auditagent | conformance | github>
**Original record:** <pointer to the specific record being validated — e.g., findings.json#F003, ai-results/auditagent/findings.json#AA-014>
**Verdict:** Valid / Invalid / Uncertain
**Date:** <YYYY-MM-DD>

## Claim being validated
[One- to two-sentence summary of the issue under review]

## Analysis
[Step-by-step trace through the code, or spec-vs-code comparison for conformance items]

## Protections evaluated
[Access control, reentrancy guards, input validation, economic constraints, etc.]

## Verdict reasoning
[Why valid / invalid / uncertain]

## Action taken
[If valid + PoC: PoC at <path>, test passing, finding F<NNN> updated/created]
[If valid + memo-only: finding F<NNN> updated/created, no PoC]
[If invalid: tracking entry rejected, no finding written]
[If uncertain: open questions listed; tracking status unchanged]
```

## After validation

The board reflects the new state automatically (the dashboard watches `tracking.json` and `findings.json`). The auditor can:

- Move on to the next Potential card.
- Run `/sync-issues` to push the newly Verified finding to GitHub if `settings.github.repo` is configured.
- Run `/generate-overleaf` once all verifications are done, to produce the LaTeX report sections.
