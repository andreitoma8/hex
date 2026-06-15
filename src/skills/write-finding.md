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
- `<output_dir>/findings.json` and `<output_dir>/tracking.json` — to check for duplicates (ids are allocated by `hex issue new`, never hand-assigned).

## Step 0: Duplicate gate

Scan `findings.json` and `tracking.json` for any existing entry that covers the same vulnerability (same affected contract/function, same or overlapping root cause). If a match is found, warn the auditor:

> "This appears to duplicate `<H-NNN>`: \<title\>. Proceed anyway?"

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

The `id`, `poc`, and `created_at` fields are managed by `hex issue new` (see Actions) — you supply the rest via `hex issue patch`. The full record shape, for reference:

```json
{
  "id": "H-NNN (allocated by hex issue new)",
  "title": "<concise, descriptive title>",
  "severity": "Critical|High|Medium|Low|Info",
  "category": "<e.g., Math / Rounding, Access Control, Reentrancy, Oracle Manipulation>",
  "description": "<flat prose covering what the vulnerability is, why it exists, and its impact — no markdown headings; see Description format below>",
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
- Keep it to 1–2 sentences. Detailed analysis belongs in the description, not here.

**Recommendation must be prose only.** No code snippets in the `recommendation` field. Code belongs in `root_cause.locations[].snippet`.

### Description format (STRICT)

The finding is rendered as a flat template (`## [Severity] Title`, then `**Description**:`, `**Recommendation(s)**:` …). The description goes inline after `**Description**:`, so it must read as **flat prose**:

- **No markdown headings and nothing that looks like one** — no `#`/`##`/`###`, and no section labels such as `Summary`, `Details`, `Impact`, `Affected code`, whether as a heading or a bold line on its own. Weave the impact into the prose instead of giving it its own section.
- **Code blocks are allowed when a snippet is genuinely needed** — a fenced ```` ```solidity ```` block illustrating the bug is fine. Keep it to what's relevant; follow the Code Block Formatting Rules below.
- Affected file paths belong in `--file` (the File(s) line), not in an "Affected code" section in the description.
- **Be concise.** Prefer a single tight paragraph: what the issue is, why it exists, and its impact — just enough to drive the point home. Don't restate the title, don't pad with background the reader doesn't need, and don't repeat the recommendation. There's no hard word count; brevity is the goal.

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

Persist through the `hex issue` CLI — never hand-edit `findings.json` or `tracking.json`. The CLI allocates the uniform `H-NNN` id, writes the tracking entry (`status: pending_validation`, `source: manual`), and creates the findings.json skeleton.

1. **Create the issue** — pass `--file` once per affected file so the **File(s)** line is populated (repeatable). Do **not** narrate the affected files in the description instead:
   ```bash
   npx hex issue new --source manual --title "<concise title>" --severity <Severity> \
     --file src/Foo.sol [--file src/Bar.sol]
   ```
   This prints the allocated id (e.g. `H-007`). Capture it.

2. **Fill the fields** (write the description and recommendation to temp files first, to preserve newlines):
   ```bash
   npx hex issue patch <id> --description-file /tmp/<id>_desc.md --recommendation-file /tmp/<id>_reco.md
   ```
   The description must be self-contained (what the issue is, why it exists, the impact) and follow the **Description format** rules below. The recommendation is prose only, hedged (`Consider...`), no code.

There is **no source-file annotation** — Hex does not write `@audit-issue` comments into the client's `.sol` files. The board and the finding record are the single place the issue lives.

## After writing

The finding appears on the dashboard's `/issues` board as a Potential card (`H-NNN`). The auditor can:

- Run `/validate-issue <id>` to write a validation memo and optionally generate a PoC; on success the card moves to Verified.
- Drag the card from Potential → Verified on the board if no PoC is needed (e.g., trivial Info-level issues).
- Run `/sync-issues` (once findings are Verified and `settings.github.repo` is set) to push them to GitHub.

Do NOT run `/validate-issue` or `/sync-issues` automatically — those are auditor-driven.
