# Publish to the Hex board — Turn 6

This file is Hex's addition to the skill. It runs **once per scan, after Turn 5** has printed
the report, and turns the scan's result into Hex board state:

- every **FINDING** → a raw record in `.hex/ai-results/ai-audit/findings.json` and a
  **Potential** card on the Issues board (`source: ai-audit`, `status: unverified`), deduped
  against everything already on the board;
- every **LEAD** → an open lead on the contract's Hex note (`/notes`), never a card.

The report Turn 5 printed is not touched. The board copy is a **rewrite** of each finding to
Hex's report standard, because the board's text ends up verbatim in the client's report.

**Never** hand-edit `.hex/tracking.json` or `.hex/findings.json` — cards go through
`npx hex issue`, leads through `npx hex note lead`. **Never** move a card to Verified, and never
run `/validate-finding` or `/sync-issues` from here: those are the auditor's calls.

---

## Step 1 — Export the winners

```bash
bash {resolved_path}/hex-export.sh --dir .hex/ai-audit/runs/{stamp}
```

Then Read `.hex/ai-audit/runs/{stamp}/hex-digest.md`. It holds one block per key — the winner
across all passes, the same set the report printed — with its key, confidence, location, title
and body (Description and Fix for a FINDING, the one-line body for a LEAD). Work from this file
only; do not re-read run files by line number, and do not re-run the gate.

If the digest says `None`, print `Hex board: nothing to publish (scan {stamp}).` and stop.

## Step 2 — Load the board once

Read, in one parallel message:

- `.hex/tracking.json` and `.hex/findings.json` — every card on the board, all sources.
- `.hex/ai-results/ai-audit/findings.json` — records from earlier `/ai-audit` scans (may not exist).
- `.hex/config.json` — the scope (to find each contract's file) and `project.mode`.
- In a differential audit with prior findings: `.hex/previous-audit/findings.json` and
  `.hex/previous-audit/review.json` (either may not exist).

**Already on the board** = the set of `scan_key` values of records in
`ai-results/ai-audit/findings.json` whose `id` is the `source_ref` of a tracking entry with
`source: "ai-audit"`, in any column. A key in this set was filed by an earlier scan.

## Step 3 — Triage each FINDING

Go through the digest's FINDINGs in order. For each one decide **exactly one** outcome:

1. **already on board** — its key is in the set above. Skip it. Do not update that card: the
   auditor may have edited, validated or rejected it, and a re-scan does not overrule them.
2. **known from the prior audit** — differential audit only. It matches a prior finding (match
   rules below) that the prior audit left open: `review.json` status
   `acknowledged_still_present`, or a prior `resolution` of `Acknowledged`, `Unresolved` or
   `Not Fixed`. Skip it; the client already knows. A match to a prior finding that was **fixed**
   is not "known" — that is a regression, and it is filed (outcome 4, or 3 if `/init-audit`
   already carded the regression).
3. **duplicate** — it matches an existing card from any other source, or an `ai-audit` card with
   a different key. It is filed, then moved to the Duplicate column (Step 5).
4. **new** — none of the above. It is filed.

### Match rules (the same rules `/ingest-aa-report` uses)

Compare the finding against each candidate on four signals:

| Signal | How to compare |
|---|---|
| **contract** (boolean) | Does the affected contract name match? |
| **function** (boolean) | Does the affected function name match? |
| **root_cause** | `same` / `overlapping` / `different` — judge the technical mechanism. |
| **attack_vector** | `same` / `overlapping` / `different` — judge what an attacker actually does. |

A match is **at least one of**:
- `root_cause = same` AND `function = true`, or
- `root_cause = same` AND `contract = true` AND `attack_vector = same`, or
- `root_cause = overlapping` AND `function = true` AND `attack_vector = same`.

When several cards match, the canonical one is the earliest-created card that is not itself in
the Duplicate column.

## Step 4 — Write the raw records

For every finding that is **new** or a **duplicate**, read the code at its location
(`Contract.function` — find the contract's file in the scope, then read the function), and write
one record. Ids continue from the highest `AI-NNN` already in the file (`AI-001` when empty).

```json
{
  "id": "AI-NNN",
  "tool": "ai-audit",
  "scan_key": "<the digest's key, verbatim>",
  "scan_stamp": "{stamp}",
  "title": "<concise, descriptive title>",
  "severity": "Critical | High | Medium | Low | Info",
  "confidence": "high | medium | low",
  "category": "<auditor-style category, e.g. Reentrancy, Access Control, Math / Rounding>",
  "raw_category": "<the bug-class segment of the key, verbatim>",
  "description": "<Hex description standard, below>",
  "recommendation": "<prose only, 'Consider ...', 1-2 sentences, no code>",
  "affected_code": [{ "file": "<path>", "snippet": "<the offending code>" }]
}
```

Write the whole file once with the Write tool, keeping every earlier record:

```json
{ "tool": "ai-audit", "ran_at": "<ISO now>", "duration_seconds": null, "total_findings": <all records>, "findings": [ ... ] }
```

This file is the source record behind the cards (as `ai-results/auditagent/findings.json` is for
AuditAgent); `hex issue new` materializes each card from it. Writing it directly is correct.
Skipped findings (already on board, known from the prior audit) get **no** record.

### Field rules

**confidence** — from the digest's score: `90-100` → `high`, `75-89` → `medium`, below `75` → `low`.
It says how sure the scan is that the bug is real. It is **not** severity.

**severity** — assess impact and likelihood yourself, from the code, with Hex's matrix:

| | Low Impact | Medium Impact | High Impact |
|---|---|---|---|
| **High Likelihood** | Medium | High | Critical |
| **Medium Likelihood** | Low | Medium | High |
| **Low Likelihood** | Info | Low | Medium |

- **Impact:** High = direct fund loss, permanent state corruption, or full bypass of critical
  access control. Medium = temporary DoS, griefing with cost, accounting errors that compound, or
  partial access bypass. Low = minor inefficiency, cosmetic, or best-practice deviation.
- **Likelihood:** High = anyone can trigger it with no preconditions, and it pays. Medium =
  specific but realistic conditions or timing. Low = unlikely conditions, complex multi-step
  setup, or unprofitable.

**title** — the digest's title is a good start. Keep it concise and descriptive, backtick
identifiers, no em dashes, no confidence score.

**description** — the digest's Description is one Simplified-English sentence. The board needs
the Hex standard, which every source (manual, AuditAgent, conformance, GitHub) meets:

- **Short paragraphs that separate the parts:** how the code is supposed to work (expected
  behavior), what is wrong (the flaw), and the impact. Not one dense block.
- **No markdown headings and no bold section labels** (`**Summary**:`, `**Impact**:`). The
  separation is paragraph breaks.
- **Backtick every Solidity identifier.** Functions as `` `functionName(...)` `` with the literal
  `(...)`; contracts, variables and constants in plain backticks. Standard names (ERC-4626, UUPS)
  stay plain.
- **Show the offending code** in a minimal fenced ```` ```solidity ```` block. Never modify the
  original code: the only additions allowed are `// ....` for omitted lines and a
  `// @audit-issue <full sentence>.` comment on its own line **above** the affected line.
- **No line numbers, no confidence scores, no PoC references, no cross-references** to other
  findings (`H-NNN`, "the previous finding"), no em dashes. The text must stand alone in a report.

**recommendation** — turn the Fix into a suggestion: start with *Consider...*, *One option
is...* or *The team may want to...*; 1-2 sentences; prose only, no code or diff. When the digest
had Option A / Option B fixes, name both directions in prose. A finding below 75 has no Fix:
write the direction its Description implies.

**affected_code** — one entry per affected file, with the snippet of the offending lines (same
code-block rules as above). This is what fills the card's File(s) line and the report's code.

## Step 5 — File the cards

For each record, in id order:

```bash
npx hex issue new --source ai-audit --source-ref AI-NNN --title "<title>" --severity <Severity>
```

It prints the allocated `H-NNN`; capture it. The card lands in Potential as `unverified`, with
description, recommendation and code materialized from the record.

For each **duplicate**, move it and record why:

```bash
npx hex issue move <new H-NNN> --to duplicate --duplicate-of <canonical H-NNN>
```

Then append to `.hex/comparison.json` → `duplicates` (create the file as
`{ "duplicates": [], "novel": [], "rejected": [] }` if it does not exist):

```json
{
  "ai_finding": "<new H-NNN>",
  "matches": "<canonical H-NNN>",
  "confidence": "high | medium | low",
  "match_signals": { "contract": true, "function": true, "root_cause": "same", "attack_vector": "same" },
  "reasoning": "<one short sentence: which signals carried the call>"
}
```

## Step 6 — Leads to notes

For each LEAD in the digest, add it to the contract's note. `<Contract>` is the part of the
location before the first `.`:

```bash
npx hex note lead "<Contract>" \
  --text "<title> (\`Contract.function\`): <the lead's body, one line>" \
  --source ai-audit --source-ref "<key>"
```

The command is idempotent on the key: a lead already added by an earlier scan (open, logged or
dismissed) is left as it is, and the command says so on stderr. Open leads keep the contract
unreviewed on `/progress` until the auditor closes them — that is intended.

## Step 7 — Summary

Print, and nothing else:

```
Hex board — scan {stamp}
- N new Potential card(s): H-0xx, H-0yy, ...
- K marked Duplicate of existing cards
- J already on the board from an earlier scan (not re-filed)
- P known from the prior audit (not filed)
- L lead(s) added to contract notes (M already there)
Report: .hex/ai-audit/runs/{stamp}/full-report.md

Run /validate-finding <id> on a card to confirm it and promote it to Verified.
```

Print the "known from the prior audit" line only in a differential audit with prior findings.
