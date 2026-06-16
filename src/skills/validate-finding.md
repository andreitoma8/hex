---
description: "Validate any potential finding on the board (manual / auditagent / conformance / github): check both correctness and security relevance, then route to Verified, Rejected, or leave Uncertain"
---

# Skill: Validate Finding

**Recommended model:** Opus

## What this skill does

Takes a single potential issue from the dashboard's Issues board and runs an independent validation pass on it. Source-agnostic — the issue can come from any of:

- **Manual** (`/write-finding`) — `source: "manual"`, `status: "pending_validation"`.
- **Auditagent** (`/ingest-aa-report`) — `source: "auditagent"`, `status: "unverified"`.
- **Conformance** (materialized by `/init-audit`) — `source: "conformance"`, `status: "pending_validation"`.
- **GitHub** (teammate findings via `/sync-issues`) — `source: "github"`, `status: "pending_validation"`.

The skill judges **two** things, not one: first **correctness** (is the claim true?), then for true claims **security relevance** (is it actually a vuln worth reporting, or true-but-by-design / a missing feature / self-inflicted?). It writes a validation memo (always), optionally generates a PoC, and moves the card. Outcomes: **Verified** (true + security-relevant), **Rejected** (either factually incorrect, *or* true-but-not-a-security-issue), or **Uncertain**. Both Rejected kinds land in the board's **Rejected** column, distinguished by disposition.

## Invocation

The auditor invokes by id or by free-text reference:

```
/validate-finding F003
/validate-finding SC-007
/validate-finding AA-N002
/validate-finding for the rounding issue in Vault.sol
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

### 2.5 Reality gate — is it security-relevant?

Correctness is not enough. AI scanners (and sometimes teammates) surface claims that are **factually true but not security issues** — by-design behavior, missing features, defense-in-depth nice-to-haves, or risks only the deployer can inflict on themselves. This is the precision pass. **Run it for every finding; treat it as mandatory for `source: auditagent | github`** (those skew recall-over-precision). `manual` / `conformance` items already passed an auditor's eye, so they can lean lighter.

For a claim you found **true**, run these five checks — each one pushes toward *not-security-relevant*:

- **Trigger model.** Can only the deployer/owner harm their own deployment? Then it's self-inflicted, not an attack.
- **Out-of-scope dependency.** Does the impact require an out-of-scope component (e.g. the integrating contract) to be buggy or malicious — and if so, does the finding grant a capability that component didn't already have? No capability gain → defense-in-depth noise.
- **Trivial workaround.** Is there an integrator-controlled or already-documented mitigation (a constructor param, a config, standard usage)?
- **Class.** Defect, deliberate design decision, or missing feature? Only defects are findings.
- **Net test.** Would a senior auditor put this in a client report as a security issue, as an informational note, or not at all?

Carry the answers into the verdict and the memo (Triggerability / Depends-on-out-of-scope / Disposition).

### 3. Verdict

Combine the two axes — correctness (Step 2) and security relevance (Step 2.5):

| Correctness | Security-relevant? | → Outcome |
|---|---|---|
| True | Yes | **Verified** |
| True | No | **Rejected** (by-design / informational) |
| False | — | **Rejected** (incorrect) |
| Uncertain | — | **Uncertain** |

**Verified — true and security-relevant:**

1. Use **AskUserQuestion** to ask:
   > The finding appears **VALID and security-relevant**. How would you like to proceed?
   >
   > 1. Generate a full PoC test, then promote to Verified.
   > 2. Accept with rational verification only — validation memo, no PoC.
   >
   > Reply **1** or **2**.

2. **If PoC chosen:** invoke the `generate-poc` skill flow (read the project test setup, write the PoC, run and iterate until it passes). Note the test path, e.g. `test/hex-pocs/<id>_<name>.t.sol`.

3. **If memo-only chosen:** no PoC file.

4. **Calibrate severity — don't inherit it.** The source's severity (especially AuditAgent's) is a *hypothesis*, not authoritative. Re-derive it from realistic impact × likelihood; many technically-true findings collapse to Info. A finding whose worst case is self-inflicted or chain-conditional must say so and re-rate accordingly.

5. **Persist via the CLI — do not hand-edit `findings.json` or `tracking.json`.** The `hex issue` command is the single source of truth for board mutations; it materializes a `findings.json` entry from the source record (conformance / auditagent / github) when one does not exist yet, and routes fields correctly. Write the validation memo and the recommendation to temp files, then:

   ```bash
   # Land the editable fields (materializes a finding for conformance/auditagent/github ids):
   npx hex issue patch <id> \
     --severity <Severity> \
     --description-file <output_dir>/validations/<id>_memo.md \
     --recommendation-file /tmp/<id>_reco.md
   # Promote to Verified:
   npx hex issue move <id> --to verified
   ```

   For a memo-only verdict, the same two commands apply (the PoC fields just stay unset). For `--description-file`, you may pass either the memo or a dedicated description file; prefer a clean description file if the memo is long.

   Any description you write must be **flat prose** (plus a fenced code block only when a snippet is genuinely needed) — no markdown headings or header-like section labels (`Summary`/`Details`/`Impact`/`Affected code`); weave impact into the prose. **Keep it concise** — a single tight paragraph covering what the issue is, why it exists, and its impact, plus a 1–2 sentence hedged recommendation; trim anything that doesn't drive the point home. This matches the finding template used by the dashboard copy and the GitHub issue body. If the affected files are missing or wrong, set them with `--file` (repeatable) rather than narrating them in the description: `npx hex issue patch <id> --file src/Foo.sol [--file src/Bar.sol]`.

   Hex does not write `@audit-issue` comments into the client's source files — the board and finding record are the only place the issue lives.

6. Use **AskUserQuestion** to ask:
   > Issue verified as **\<id\>** with severity **\<current severity\>**.
   >
   > Would you like to change the severity? Reply with the new severity (Critical / High / Medium / Low / Info), or **no** to keep it.

7. If the user provides a new severity, run `npx hex issue patch <id> --severity <NewSeverity>`.

**Rejected — true but not a security issue (by-design / informational):**

The claim is correct, but Step 2.5 says it isn't a vuln worth reporting (self-inflicted, design decision, missing feature, defense-in-depth noise). This is **not** the same as "incorrect" — give it its own disposition so it's distinguishable from a false positive and AuditAgent gets honest feedback.

1. Write the memo with `Disposition: by-design` (or `informational`) and the Step-2.5 reasoning.
2. Mark the disposition and move it:
   ```bash
   npx hex issue patch <id> --resolution Acknowledged
   npx hex issue move <id> --to rejected
   ```
   `Acknowledged` on a Rejected card means "AA was right, but it's by-design / not a security issue" — the board shows a **By-design** chip. (A Rejected card with *no* resolution = factually incorrect; see below.)
3. Do NOT write a finding body or carry it into the report.

**Rejected — incorrect (false positive):**

The claim is factually wrong. Explain why:
- Is the attack path blocked? By what specifically (modifier, require, state check)?
- Are the preconditions impossible? Why?
- Is the impact assessment wrong? What actually happens?

Move it to the Rejected column with **no** resolution (the board shows an **Invalid** chip): `npx hex issue move <id> --to rejected`. Do NOT write a finding body — the memo records the reasoning.

**Uncertain:**

1. List specific questions that need manual investigation.
2. State what would confirm or deny the issue.
3. Leave the column as-is (no `hex issue move`). Record the open questions on the card: `npx hex issue patch <id> --notes "<open questions>"`.

## Output: validation memo

Write `<output_dir>/validations/<id>_memo.md` (always — for valid, invalid, and uncertain verdicts):

```markdown
# Finding Validation: <ID> — <Title>

**Source:** <manual | auditagent | conformance | github>
**Original record:** <pointer to the specific record being validated — e.g., findings.json#F003, ai-results/auditagent/findings.json#AA-014>
**Correctness:** True / False / Uncertain
**Security relevance:** security-relevant / not-security-relevant / n/a
**Triggerability:** external | self-inflicted
**Depends on out-of-scope component:** no | yes (capability gain: yes/no)
**Disposition:** security-finding | by-design | informational | false
**Date:** <YYYY-MM-DD>

## Claim being validated
[One- to two-sentence summary of the issue under review]

## Analysis
[Step-by-step trace through the code, or spec-vs-code comparison for conformance items]

## Protections evaluated
[Access control, reentrancy guards, input validation, economic constraints, etc.]

## Reality gate
[The five Step-2.5 checks for true claims: trigger model, out-of-scope dependency, trivial workaround, class, net test. Skip with "n/a (claim is false)" for incorrect findings.]

## Verdict reasoning
[Why Verified / Rejected (by-design or incorrect) / Uncertain — tie it to the two axes above]

## Action taken
[If Verified + PoC: PoC at <path>, test passing, finding updated/created; severity re-rated to <X>]
[If Verified + memo-only: finding updated/created, no PoC; severity <X>]
[If Rejected by-design: moved to Rejected with resolution Acknowledged, no finding written]
[If Rejected incorrect: moved to Rejected, no resolution, no finding written]
[If uncertain: open questions listed; tracking status unchanged]
```

## After validation

The board reflects the new state automatically (the dashboard watches `tracking.json` and `findings.json`). The auditor can:

- Move on to the next Potential card.
- Run `/sync-issues` to push the newly Verified finding to GitHub if `settings.github.repo` is configured.
- Run `/generate-overleaf` once all verifications are done, to produce the LaTeX report sections.
