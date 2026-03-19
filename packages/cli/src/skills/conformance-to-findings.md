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

### 2. Skip already-processed and duplicate items

For each selected conformance item, check **both** tracking.json and findings.json:

**a) Already processed?** Check `tracking.json` for an entry that references this conformance ID in `notes`, or has `source: "spec-conformance"` with a closely matching title. If found → skip.

**b) Already covered by existing finding?** Check `findings.json` — does any existing finding cover the same vulnerability? Match on: same affected contract/function AND same root cause (overlapping code location or semantically equivalent issue).

If covered → **don't create a new finding**. Instead:
1. Add a tracking entry with `finding_id` set to the matched finding's ID, `source: "spec-conformance"`, and `status`/`poc_status` inherited from the matched finding's tracking entry.
2. Log: "Skipped SC-XXX — already covered by FYYY"

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
