---
description: "Convert spec conformance deviations into validated findings"
---

# Skill: Conformance to Findings

**Recommended model:** Sonnet

## Purpose

Process `spec-conformance.json` items with `status: "DEVIATES"` or `"PARTIAL"` and convert validated deviations into structured findings using the `write-finding` template.

## Context Assembly

Read:
- `<output_dir>/spec-conformance.json` — the source conformance items
- `<output_dir>/tracking.json` — to check for already-processed items and determine next finding ID
- `<output_dir>/findings.json` — to determine next finding ID (use highest ID from either file + 1)
- The relevant source code for each deviation
- `<output_dir>/validations/` — for any existing validation memos

## Process

### 1. Filter conformance items

Select items from `spec-conformance.json` where `status` is `"DEVIATES"` or `"PARTIAL"`.

### 2. Skip already-processed items

For each selected item, check if it already exists in `tracking.json` by cross-referencing the conformance item's `id` field. Look for tracking entries whose `notes` field references the conformance ID, or whose title closely matches the conformance finding text.

If already tracked, skip it and note that it was skipped.

### 3. Validate each deviation

For each unprocessed item, apply the **write-finding Step 0 validation gate** logic:

1. Read the conformance item details: `spec_text`, `finding`, `code_location`, `severity_hint`
2. Trace the issue in the actual source code step by step:
   - **Is this actually a real deviation?** Verify the spec text against the code behavior.
   - **What is the impact?** Consider whether the deviation matters in practice.
   - **Are there mitigating factors?** Check for alternative protections or intentional design choices.
3. Decide: **valid** or **invalid**

### 4a. If valid — write finding

Use the `write-finding` template to create the finding:

- Use `severity_hint` from the conformance item as a starting point, but adjust based on your own Likelihood × Impact analysis
- Set `category` appropriately based on the deviation type
- In `root_cause.locations`, use the `code_location` from the conformance item

**Actions:**
1. Append finding to `findings.json`
2. Add tracking entry with `status: "verified"`, `source: "spec-conformance"`, `poc_status: "not_started"`
3. Run `npx solaudit render-findings`

### 4b. If invalid — reject

- Write a brief validation memo to `<output_dir>/validations/<conformance_id>_memo.md` explaining why the deviation does not warrant a finding
- Add tracking entry with `status: "rejected"`, `source: "spec-conformance"`, `notes: "Conformance item <id>: <reason>"`
- **Do not write a finding**

### 5. Summary

After processing all items, report:
- How many items were processed
- How many became findings (with IDs)
- How many were rejected (with brief reasons)
- How many were skipped (already in tracking)

## Important

- **Never auto-trigger PoC generation.** Set `poc.status: "not_started"` and `poc.file: null`.
- **Recommendation must be prose only.** No code in the recommendation field.
- Use the highest existing finding ID from **either** `findings.json` or `tracking.json` and increment sequentially.
- Process items one at a time to maintain correct ID sequencing.
