---
description: "Write a structured finding with severity, description, and recommendation"
---

# Skill: Write Finding

**Recommended model:** Sonnet

## Context Assembly

Read:
- The annotation / issue description
- The validation memo from `<output_dir>/validations/` (if exists)
- The PoC file (if exists)
- The relevant source code
- `<output_dir>/findings.json` — to determine next finding ID

## Severity Guide

Rate severity using Likelihood × Impact:

| | Low Impact | Medium Impact | High Impact |
|---|---|---|---|
| **High Likelihood** | Medium | High | Critical |
| **Medium Likelihood** | Low | Medium | High |
| **Low Likelihood** | Info | Low | Medium |

**Impact** = What's the worst that can happen?
- High: Direct fund loss, permanent DoS, privilege escalation to drain funds
- Medium: Temporary DoS, griefing with economic cost, incorrect accounting that compounds
- Low: Cosmetic issues, gas inefficiency, minor griefing with negligible cost

**Likelihood** = How easy is it to trigger?
- High: Anyone can trigger with no special conditions, or it will happen naturally
- Medium: Requires specific but realistic conditions (market conditions, timing, etc.)
- Low: Requires unlikely conditions (large capital, admin collusion, specific block timing)

## Template

Write the finding following this exact structure:

```json
{
  "id": "F<NNN>",
  "title": "<concise, descriptive title>",
  "severity": "Critical|High|Medium|Low|Info",
  "likelihood": "High|Medium|Low",
  "impact": "High|Medium|Low",
  "category": "<e.g., Math / Rounding, Access Control, Reentrancy, Oracle Manipulation>",
  "description": "<clear description understandable by a developer who hasn't seen the code>",
  "impact_detail": "<specific description of what happens if exploited>",
  "root_cause": {
    "summary": "<why this vulnerability exists>",
    "locations": [
      { "file": "<path>", "line_start": 0, "line_end": 0, "snippet": "<relevant code>" }
    ]
  },
  "poc": {
    "status": "passing|failing|not_started",
    "file": "<test file path or null>",
    "validation_memo": "<memo path or null>"
  },
  "recommendation": "<concrete, implementable fix>",
  "references": {
    "annotation_id": "<ID or null>",
    "annotation_location": "<file:line or null>",
    "external_links": []
  },
  "created_at": "<ISO timestamp>"
}
```

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
2. Regenerate markdown: `npx solaudit render-findings`
3. Update the source annotation to `@audit-issue-verified` with finding ID
4. Update `<output_dir>/tracking.json` with the new finding entry
