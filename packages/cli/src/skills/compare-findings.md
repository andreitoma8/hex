---
description: "Semantically compare your findings against AI agent results"
---

# Skill: Compare Findings

**Recommended model:** Sonnet

## Context Assembly

Read these files from the output directory:
- `findings.json` — your own findings (canonical source of truth)
- All files in `ai-results/` — external AI agent outputs (JSON format)
- `tracking.json` — current tracking state (if exists)
- `config.json` — for scope information

## Task

For each finding from an external AI agent:

### 1. Semantic Matching
Determine if this describes the same vulnerability as any existing finding.

Match on:
- Affected contract and function
- Root cause (same underlying code issue)
- Attack vector (same exploitation path)

Do NOT match on:
- Exact wording (different phrasing ≠ different issue)
- Severity rating (agents often disagree on severity)

If match found → mark as **duplicate**, record the mapping with confidence level.

### 2. Novelty Assessment
For non-duplicate findings:
- **likely_valid** — Clear vulnerability description, affects in-scope code, plausible attack path
- **needs_review** — Plausible but requires manual verification (complex conditions, unclear impact)
- **likely_false_positive** — Out of scope, misunderstands the code, or describes a non-issue

Provide reasoning for each assessment.

### 3. Scope Check
Verify the finding affects contracts in the audit scope (`config.json` → `project.scope`).
Reject findings that only affect out-of-scope code (mocks, tests, dependencies).

### 4. Priority Ranking
Rank novel findings by likely severity (Critical > High > Medium > Low > Info).

## Output

Write to `<output_dir>/comparison.json`:
```json
{
  "compared_at": "<ISO timestamp>",
  "sources": ["nethermind", "zellic"],
  "duplicates": [
    {
      "ai_finding": "<source>-<id>",
      "matches": "F001",
      "confidence": "high|medium|low",
      "reasoning": "Both describe the same share inflation attack in Vault.deposit"
    }
  ],
  "rejected": [
    {
      "id": "<source>-<id>",
      "reason": "Out of scope — affects mock contract only"
    }
  ]
}
```

Novel findings (everything not in `duplicates` or `rejected`) are implicit — do NOT include a `novel` array.

Update `<output_dir>/tracking.json` with all entries:

**Duplicates:** For each duplicate pair:
1. Add the AI finding ID to the canonical finding's `duplicates` array in tracking
2. **Create a tracking entry** for the AI finding with:
   - `id`: the AI finding's original ID (e.g., `solidity-auditor-001`)
   - `finding_id`: the canonical finding ID (e.g., `F009`)
   - `title`: the AI finding's title
   - `severity`: the AI finding's severity
   - `source`: the AI tool name (e.g., `solidity-auditor`)
   - `status`: inherited from the canonical finding's tracking entry (e.g., if canonical is `verified`, set `verified`)
   - `poc_status`: inherited from the canonical finding's tracking entry
   - If a tracking entry for this AI finding already exists, update it rather than creating a duplicate

This ensures every AI finding has a tracking entry the dashboard can find.

**Novel findings** (not duplicates, not rejected): add as new entries using their **original AI ID** (e.g., `solidity-auditor-005`) as the tracking `id`, with `status: "pending_validation"`, no `finding_id`.

**Rejected findings:** do not add to tracking.

Report a summary: X duplicates found, Y novel findings to review, Z rejected.
