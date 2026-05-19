---
description: "Write a structured finding with severity, description, and recommendation"
---

# Skill: Write Finding

**Recommended model:** Sonnet

## Context Assembly

Read:
- The issue description provided by the auditor
- The validation memo from `<output_dir>/validations/` (if exists)
- The PoC file (if exists)
- The relevant source code
- `<output_dir>/findings.json` and `<output_dir>/tracking.json` — to determine next finding ID. Use the highest existing ID (F-prefixed) from **either** file and increment by 1. This ensures rejected or invalidated findings don't have their IDs reused.

## Step 0: Validation Gate

Before writing a finding, verify the issue has been validated.

### 1. Look up the issue in `<output_dir>/tracking.json`

Match the issue by title or description. Then act based on status:

### 2. Duplicate check

Before writing, scan `findings.json` for any finding that covers the same vulnerability (same affected contract/function, same or overlapping root cause). If a match is found, **warn the auditor**: "This appears to duplicate FXXX: <title>. Proceed anyway?" Only continue if confirmed.

### 3. Act based on status

**No tracking entry (new/manual finding) or `status: "pending_validation"`:**

Validate by reasoning before proceeding — trace the attack path in the code step by step:
1. **Is this actually exploitable?** Trace the exact execution path.
2. **What are the preconditions?** What state must the system be in? What does the attacker need?
3. **What would the impact be?** Quantify if possible (fund loss amount, DoS duration, etc.).
4. **Are there existing protections?** Check for reentrancy guards, access control that blocks the attack path, input validation that blocks required preconditions, economic constraints that make the attack unprofitable.

Then:
- **If valid:** Write a validation memo to `<output_dir>/validations/<finding_id_or_short_name>_memo.md` (use the memo format from the `generate-poc` skill). Add or update the tracking entry with `status: "verified"`, `poc_status: "not_started"`. Proceed to write the finding.
- **If invalid:** Write a validation memo explaining why. Add or update the tracking entry with `status: "rejected"`. **Stop — do not write the finding.** Inform the auditor of the rejection reason.

**`status: "rejected"`:**

**Stop — do not write the finding.** Inform the auditor that this issue was previously rejected. Point to the existing validation memo at `<output_dir>/validations/` if present.

**`status: "verified"`:**

Proceed to write the finding.

### 4. PoC status handling

Record whatever the current `poc_status` is in the finding's `poc` field. **Never auto-trigger PoC generation.** If `poc_status` is `"not_started"` or absent, set `poc.status: "not_started"` and `poc.file: null` in the finding.

---

## Severity Guide

Assess severity directly based on impact and exploitability:

- **Critical:** Direct fund loss or permanent protocol-breaking impact that anyone can trigger with no special conditions
- **High:** Significant fund loss, privilege escalation, or severe DoS that requires specific but realistic conditions
- **Medium:** Temporary DoS, griefing with economic cost, or incorrect accounting that compounds over time
- **Low:** Minor issues with limited economic impact, requires unlikely conditions to exploit
- **Info:** Gas inefficiency, cosmetic issues, best-practice deviations with no direct security impact

### Likelihood × Impact Matrix

Use this matrix as an equally important tool for determining severity. Cross-reference the direct definitions above with the matrix to ensure consistent severity mapping.

| | Low Impact | Medium Impact | High Impact |
|---|---|---|---|
| **High Likelihood** | Medium | High | Critical |
| **Medium Likelihood** | Low | Medium | High |
| **Low Likelihood** | Info | Low | Medium |

**Impact definitions:**
- **High:** Direct loss of funds, permanent corruption of protocol state, or complete bypass of critical access control
- **Medium:** Temporary DoS, griefing with economic cost, incorrect accounting that compounds, or partial access control bypass
- **Low:** Minor economic inefficiency, cosmetic issues, or deviations from best practices with no direct security consequence

**Likelihood definitions:**
- **High:** Anyone can trigger with no special conditions, preconditions are common or always met, attack is profitable
- **Medium:** Requires specific but realistic conditions, attacker needs moderate setup or timing, economically viable
- **Low:** Requires unlikely conditions, complex multi-step attack, unprofitable, or depends on external factors rarely met

### Required: Severity Reasoning Step

Before you assign severity, you MUST work through the matrix in this order. Write each step into the finding's `severity_reasoning` field. Free-text justification is not enough — the schema requires `likelihood`, `impact`, and `justification` as separate values.

1. **Likelihood scenario.** Describe in one or two sentences what an attacker must do to trigger the bug. Then choose one: `High` / `Medium` / `Low`.
2. **Impact scenario.** Describe in one or two sentences what the worst realistic outcome is if the attack lands. Then choose one: `Critical` / `High` / `Medium` / `Low`.
3. **Justification.** State explicitly: *"Likelihood × Impact = severity"*. If you deviate from the matrix (e.g., assigning High when the matrix says Medium), say so and explain why (existing protection, off-chain mitigation, etc.).
4. Only after writing the reasoning should you set `severity`.

Two findings with the same severity should be defensible against each other on this reasoning, not on the title or category alone.

## Template

Write the finding following this exact structure:

```json
{
  "id": "F<NNN>",
  "title": "<concise, descriptive title>",
  "severity": "Critical|High|Medium|Low|Info",
  "severity_reasoning": {
    "likelihood": "High|Medium|Low",
    "impact": "Critical|High|Medium|Low",
    "justification": "<one-paragraph explanation that maps the likelihood × impact pair to the assigned severity, calling out any deviation from the matrix>"
  },
  "category": "<e.g., Math / Rounding, Access Control, Reentrancy, Oracle Manipulation>",
  "description": "<clear, self-contained description covering what the vulnerability is, why it exists, and what the impact would be if exploited>",
  "root_cause": {
    "locations": [
      { "file": "<path>", "snippet": "<relevant code>" }
    ]
  },
  "poc": {
    "status": "passing|failing|not_started",
    "file": "<test file path or null>",
    "validation_memo": "<memo path or null>"
  },
  "recommendation": "<concrete, implementable fix>",
  "references": {
    "external_links": []
  },
  "created_at": "<ISO timestamp>"
}
```

The `severity_reasoning` block is required for every new finding. The dashboard and `/compare-findings` will surface it when comparing across auditors and AI agents.

**Recommendation must be prose only.** Do not include code snippets, code blocks, or inline code in the `recommendation` field. Describe the fix in plain language. Code examples belong only in `root_cause.locations[].snippet`.

## Code Block Formatting Rules (STRICT)

When including code snippets in the finding:

### Never modify original code
The only allowed modifications are `@audit` / `@audit-issue` comments and `// ....` to indicate omitted lines.

### Comment placement
Always add comments on a **SEPARATE LINE ABOVE** the affected line. Never inline at end of line.

**CORRECT:**
```solidity
// ....
// @audit-issue This calculation is vulnerable to rounding errors.
uint256 shares = assets.mulDiv(totalSupply, totalAssets, Math.Rounding.Down);
```

### Comment style
All inserted audit comments must be full sentences starting with a capital letter and ending with a period.

## Actions

1. Append the finding to the `findings` array inside `<output_dir>/findings.json`. The file structure is `{ "findings": [...] }`. If the file doesn't exist, create it with this wrapper.
2. Update `<output_dir>/tracking.json` with the new finding entry
3. **Annotate source files.** For each entry in `root_cause.locations[]`:
   - Open the source file at the path in `file`.
   - Find the first significant line of the `snippet` in the file (skip blank lines and `// ....` placeholders).
   - If an existing `// @audit-issue ...` comment is on the line directly above, **replace** it with `// @audit-issue-verified F<NNN> <short title>`.
   - Otherwise, **insert** `// @audit-issue-verified F<NNN> <short title>` on a new line directly above the matched line, using the same indentation.
   - `<NNN>` is the finding ID (e.g., `F001`) and `<short title>` is the finding's `title` field.

## After writing

If `settings.github.repo` is set in `config.json`, suggest the user run `/sync-github` to publish this finding to the team's GitHub repo and to pull in any new teammate findings. Do not run `/sync-github` automatically — the auditor should choose when to publish.
