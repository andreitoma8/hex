---
description: "Write a manual issue as a Potential card on the board (pending validation)"
---

# Skill: Write Finding

**Recommended model:** Sonnet

This skill records a manual issue that the auditor has spotted during review. The issue lands on the dashboard's Issues board as a **Potential** card with `status: "pending_validation"` and `source: "manual"`. The auditor promotes it to Verified later (via drag-drop on the board, or by running `/validate-issue <id>` which produces a validation memo and optional PoC).

## Context Assembly

Read:
- The issue description provided by the auditor.
- The relevant source code.
- `<output_dir>/findings.json` and `<output_dir>/tracking.json` — to determine the next finding ID. Use the highest existing `F<NNN>` ID across both files and increment by 1. Rejected and invalid findings keep their IDs reserved.

## Step 0: Duplicate gate

Scan `findings.json` and `tracking.json` for any existing entry that covers the same vulnerability (same affected contract/function, same or overlapping root cause). If a match is found, warn the auditor:

> "This appears to duplicate `F<NNN>`: \<title\>. Proceed anyway?"

Only continue if confirmed.

## Severity Guide

Assess severity directly based on impact and exploitability:

- **Critical** — Direct fund loss or permanent protocol-breaking impact that anyone can trigger with no special conditions.
- **High** — Significant fund loss, privilege escalation, or severe DoS that requires specific but realistic conditions.
- **Medium** — Temporary DoS, griefing with economic cost, or incorrect accounting that compounds over time.
- **Low** — Minor issues with limited economic impact, requires unlikely conditions to exploit.
- **Info** — Gas inefficiency, cosmetic issues, best-practice deviations with no direct security impact.

### Likelihood × Impact Matrix

Cross-reference both before assigning a severity.

| | Low Impact | Medium Impact | High Impact |
|---|---|---|---|
| **High Likelihood** | Medium | High | Critical |
| **Medium Likelihood** | Low | Medium | High |
| **Low Likelihood** | Info | Low | Medium |

**Impact:** High = direct fund loss / permanent state corruption / full bypass of critical access control. Medium = temporary DoS, griefing with cost, incorrect accounting that compounds, or partial access bypass. Low = minor inefficiency, cosmetic, best-practice deviation.

**Likelihood:** High = anyone can trigger with no preconditions; common conditions; profitable. Medium = specific but realistic conditions; moderate setup/timing; economically viable. Low = unlikely conditions; complex multi-step; unprofitable.

## Template

Write the finding following this structure:

```json
{
  "id": "F<NNN>",
  "title": "<concise, descriptive title>",
  "severity": "Critical|High|Medium|Low|Info",
  "category": "<e.g., Math / Rounding, Access Control, Reentrancy, Oracle Manipulation>",
  "description": "<clear, self-contained description covering what the vulnerability is, why it exists, and what the impact would be if exploited>",
  "root_cause": {
    "locations": [
      { "file": "<path>", "snippet": "<relevant code>" }
    ]
  },
  "poc": {
    "status": "not_started",
    "file": null,
    "validation_memo": null
  },
  "recommendation": "<a suggested direction phrased as 'Consider...', not a prescriptive fix>",
  "references": {
    "external_links": []
  },
  "created_at": "<ISO timestamp>"
}
```

### Recommendation tone

Phrase recommendations as suggestions, not commands. The auditor proposes direction; the protocol team owns the implementation:

- Start with `Consider...`, `One option is...`, `The team may want to...`, `It would be worth...`.
- Avoid `Replace X with Y`, `You must...`, `Always do...`, `Never do...`.
- Keep under three sentences when possible. Detailed analysis belongs in the description.

**Recommendation must be prose only.** No code snippets in the `recommendation` field. Code belongs in `root_cause.locations[].snippet`.

## Code Block Formatting Rules (STRICT)

When including code snippets in the finding:

### Never modify original code
Only allowed modifications: `@audit` / `@audit-issue` comments and `// ....` to indicate omitted lines.

### Comment placement
Add comments on a **separate line above** the affected line. Never inline.

**CORRECT:**
```solidity
// ....
// @audit-issue This calculation is vulnerable to rounding errors.
uint256 shares = assets.mulDiv(totalSupply, totalAssets, Math.Rounding.Down);
```

### Comment style
All inserted audit comments must be full sentences starting with a capital letter and ending with a period.

## Actions

1. **Append the finding** to the `findings` array inside `<output_dir>/findings.json`. File structure is `{ "findings": [...] }` — create with this wrapper if missing.
2. **Add a tracking entry** to `<output_dir>/tracking.json` with:
   ```json
   {
     "id": "F<NNN>",
     "title": "<same as finding>",
     "severity": "<same as finding>",
     "source": "manual",
     "status": "pending_validation",
     "poc_status": "not_started",
     "poc_file": null,
     "duplicates": [],
     "notes": ""
   }
   ```
3. **Annotate source files.** For each entry in `root_cause.locations[]`:
   - Open the source file at `file`.
   - Find the first significant line of the `snippet` (skip blank lines and `// ....`).
   - If an existing `// @audit-issue ...` comment is directly above, replace it with `// @audit-issue F<NNN> <short title>`.
   - Otherwise insert `// @audit-issue F<NNN> <short title>` directly above, matching indentation.

(The `@audit-issue-verified` annotation comes later, via `/validate-issue` once the issue is promoted to Verified.)

## After writing

The finding now appears on the dashboard's `/issues` board as a Potential card. The auditor can:

- Run `/validate-issue F<NNN>` to write a validation memo and optionally generate a PoC; on success the card moves to Verified.
- Drag the card directly from Potential → Verified on the board if they're confident no PoC is needed (e.g., trivial Info-level issues).
- Run `/sync-issues` if `settings.github.repo` is configured, to push verified findings to the team's GitHub repo.

Do NOT run `/validate-issue` or `/sync-issues` automatically — those are auditor-driven decisions.
