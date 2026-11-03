---
description: "Write a manual issue as a Potential card on the board (pending validation)"
---

# Skill: Write Finding


This skill records a manual issue that the auditor has spotted during review. The issue lands on the dashboard's Issues board as a **Potential** card with `status: "pending_validation"` and `source: "manual"`. The auditor promotes it to Verified later (via drag-drop on the board, or by running `/validate-finding <id>` which produces a validation memo and optional PoC).

## Context Assembly

Read:
- The issue description provided by the auditor.
- The relevant source code.
- `<output_dir>/findings.json` and `<output_dir>/tracking.json` — to check for duplicates (ids are allocated by `hex issue new`, never hand-assigned).

## Step 0: Duplicate gate

After filling the card (Actions steps 1 and 2), run `npx --no-install hex issue dedup <id>`: it finds the exact functions from the description's code block and backticked names, lists existing cards on those functions, and prints the match rules. Run it on the filled card; on an empty one it finds no functions and misses every duplicate. If a candidate matches under those rules, warn the auditor:

> "This appears to duplicate `<H-NNN>`: \<title\>. Proceed anyway?"

If they say it is a duplicate, record it with `npx --no-install hex issue mark-duplicate <id> --of <H-NNN> …` (signals as the rules describe) instead of filling in the fields. Otherwise continue.

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
  "description": "<short structured paragraphs (expected behavior, the flaw, the impact) with a fenced solidity snippet and every identifier backticked as `name(...)`; no headings or bold section labels — see Description format below>",
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

The finding is rendered inline after `**Description**:` in the report, so it must be prose (no markdown headings), but it must be **structured and readable**, not a wall of text:

- **Split into short paragraphs that separate the parts of the finding.** Cover, in order, how the code is supposed to work (the expected behavior or spec), what is wrong (the flaw), and the impact. Give each its own short paragraph rather than one dense block. Look at how a clean finding reads: a paragraph of context/expected behavior, the offending code, then a paragraph on what breaks and why it matters.
- **No markdown headings and no bold section labels.** The separation is paragraph breaks, not headers. Do not write `#`/`##`, and do not introduce paragraphs with `**Summary**:`, `**Impact**:`, `**Details**:`, `**Affected code**:` or similar labels — those read as machine-generated. Let the prose carry the structure.
- **Backtick every Solidity identifier** so the report renders it in monospace. Functions are written as `` `functionName(...)` `` with the literal `(...)`, e.g. `` `deposit(...)` ``, `` `sweepTreasury(...)` ``. Contracts, interfaces, variables, constants, and hex/number literals get plain backticks: `` `CardinalExchange` ``, `` `undeployedLpCapital` ``, `` `feeBps` ``. Standard names (ERC-4626, UUPS, ERC-20) stay as plain text. Never leave a bare identifier in the prose.
- **Show the offending code.** Include a fenced ```` ```solidity ```` block of the relevant lines (with `@audit-issue` comments per the Code Block Formatting Rules below) rather than describing the code only in words. Keep it minimal — just what's needed to see the issue.
- Affected file paths belong in `--file` (the File(s) line), not narrated in the description.
- **Be concise within the structure.** Short paragraphs, no padding, don't restate the title or repeat the recommendation. Readable and specific beats long.

### Report-facing content (STRICT)

The description, recommendation, and title end up verbatim in the client's published report. Keep them free of anything that only makes sense inside Hex or that rots when the code moves:

- **Stand alone — no cross-references to other findings.** Never point at another issue by its Hex id (`H-NNN`) or by its number/title ("see H-005", "as in the previous finding"). Report readers have no Hex ids and sections get reordered. If two issues share a mechanism, describe that mechanism inline in each.
- **No line numbers — show the code.** Do not cite specific source lines ("line 56", "on lines 43, 55"). Line numbers drift the moment code or comments change. Instead embed a minimal fenced ```` ```solidity ```` block in the description showing the relevant code, and refer to it by function or variable name in the prose. (The report renders those blocks; it also renders `root_cause.locations[].snippet` when a materialized finding carries one.)
- **No PoC references.** Do not name or link the proof-of-concept test or its path. The PoC belongs in the validation memo (`poc.validation_memo`), which the report never renders.

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
   npx --no-install hex issue new --source manual --title "<concise title>" --severity <Severity> \
     --file src/Foo.sol [--file src/Bar.sol]
   ```
   This prints the allocated id (e.g. `H-007`). Capture it.

2. **Fill the fields** (write the description and recommendation to temp files first, to preserve newlines):
   ```bash
   npx --no-install hex issue patch <id> --description-file /tmp/<id>_desc.md --recommendation-file /tmp/<id>_reco.md
   ```
   The description must be self-contained (what the issue is, why it exists, the impact) and follow the **Description format** rules below. The recommendation is prose only, hedged (`Consider...`), no code.

3. **Run the duplicate gate** (Step 0) on the filled card.

There is **no source-file annotation** — Hex does not write `@audit-issue` comments into the client's `.sol` files. The board and the finding record are the single place the issue lives.

## After writing

The finding appears on the dashboard's `/issues` board as a Potential card (`H-NNN`). The auditor can:

- Run `/validate-finding <id>` to write a validation memo and optionally generate a PoC; on success the card moves to Verified.
- Drag the card from Potential → Verified on the board if no PoC is needed (e.g., trivial Info-level issues).
- Run `/sync-issues` (once findings are Verified and `settings.github.repo` is set) to push them to GitHub.

Do NOT run `/validate-finding` or `/sync-issues` automatically — those are auditor-driven.
