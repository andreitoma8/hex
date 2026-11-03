---
description: "Validate any potential finding on the board (manual / ai-audit / auditagent / conformance / github / prior-audit): check both correctness and security relevance, then route to Verified, Rejected, or leave Uncertain"
---

# Skill: Validate Finding

## What this skill does

Takes a single potential issue from the dashboard's Issues board and runs an independent validation pass on it. Source-agnostic — the issue can come from any of:

- **Manual** (`/write-finding`) — `source: "manual"`, `status: "pending_validation"`.
- **Auditagent** (`/ingest-aa-report`) — `source: "auditagent"`, `status: "unverified"`.
- **AI audit** (`/ai-audit`) — `source: "ai-audit"`, `status: "unverified"`.
- **Prior audit** (regressions found by `/init-audit` in a differential audit) — `source: "prior-audit"`, `status: "pending_validation"`.
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
  - `ai-audit` → `<output_dir>/ai-results/ai-audit/findings.json` (the matching `findings[*]` entry; the scan's own write-up is in `<output_dir>/ai-audit/runs/<scan_stamp>/full-report.md`).
  - `prior-audit` → `<output_dir>/previous-audit/findings.json` (the prior finding) and `previous-audit/review.json` (why it was judged a regression).
  - `conformance` → `<output_dir>/spec-conformance.json` (the matching `items[*]` entry).
  - `github` → `<output_dir>/external/github/findings.json` (the matching entry).
- The affected source files themselves (read them; do not rely on summaries).
- Exact relationships from the compiler facts: `npx --no-install hex facts query function|callers|callees|readers|writers|reach <ref>` (who can reach the vulnerable code, who else writes the state it depends on).
- The protocol model (`.hex/model/protocol.json`): trust assumptions and privileges, which decide many reality-gate calls.
- The triage rules: `npx --no-install hex rules list`. A finding whose whole impact depends on a rule (trusted role, out-of-scope token type, known issue) is not security-relevant.

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

Correctness is not enough. AI scanners (and sometimes teammates) surface claims that are **factually true but not security issues** — by-design behavior, missing features, defense-in-depth nice-to-haves, or risks only the deployer can inflict on themselves. This is the precision pass. **Run it for every finding; treat it as mandatory for `source: auditagent | ai-audit | github`** (those skew recall-over-precision). `manual` / `conformance` items already passed an auditor's eye, so they can lean lighter.

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

1. **Write a PoC. This is the default.** Follow the `generate-poc` flow: read the project's test setup, write `test/hex-pocs/<id>_<name>.t.sol` (or `.test.ts`), assert the **impact**, run it, and iterate until it passes. The PoC is what fix review re-runs later to prove the fix.

2. **Memo-only is the exception.** Skip the PoC only when one cannot reasonably exist (an off-chain or governance-process issue, a pure spec deviation with no exploit, an Info-level code-quality finding), and say why in the memo.

3. **Record the result on the card:**
   ```bash
   npx --no-install hex issue validation <id> --verdict reproduced --by auditor \
     --poc test/hex-pocs/<id>_<name>.t.sol --poc-status passing --memo .hex/validations/<id>_memo.md
   # memo-only:
   npx --no-install hex issue validation <id> --verdict valid_no_poc --by auditor --memo .hex/validations/<id>_memo.md
   ```

4. **Calibrate severity — don't inherit it.** The source's severity (especially AuditAgent's) is a *hypothesis*, not authoritative. Re-derive it from realistic impact × likelihood; many technically-true findings collapse to Info. A finding whose worst case is self-inflicted or chain-conditional must say so and re-rate accordingly.

5. **Persist via the CLI — do not hand-edit `findings.json` or `tracking.json`.** The `hex issue` command is the single source of truth for board mutations; it materializes a `findings.json` entry from the source record (conformance / auditagent / ai-audit / github / prior-audit) when one does not exist yet, and routes fields correctly. Write the validation memo and the recommendation to temp files, then:

   ```bash
   # Land the editable fields (materializes a finding for conformance/auditagent/github ids):
   npx --no-install hex issue patch <id> \
     --severity <Severity> \
     --description-file <output_dir>/validations/<id>_memo.md \
     --recommendation-file /tmp/<id>_reco.md
   # Promote to Verified:
   npx --no-install hex issue move <id> --to verified
   ```

   For a memo-only verdict, the same two commands apply (the PoC fields just stay unset). For `--description-file`, you may pass either the memo or a dedicated description file; prefer a clean description file if the memo is long.

   Any description you write must be **structured, readable prose** (no markdown headings), not a single dense block. Split it into short paragraphs that separate how the code is supposed to work (expected behavior / the spec), what is wrong (the flaw), and the impact, and include a fenced ```` ```solidity ```` block of the offending code. Do not introduce paragraphs with bold section labels (`**Summary**:`/`**Impact**:`/`**Details**:`/`**Affected code**:`) — the separation is paragraph breaks, not headers. **Backtick every Solidity identifier**, writing functions as `` `functionName(...)` `` with literal `(...)` and contracts/variables/constants in plain backticks; never leave a bare identifier in the prose. Keep each paragraph tight (no padding), and add a 1–2 sentence hedged recommendation. This matches the finding template used by the dashboard copy and the GitHub issue body. If the affected files are missing or wrong, set them with `--file` (repeatable) rather than narrating them in the description: `npx --no-install hex issue patch <id> --file src/Foo.sol [--file src/Bar.sol]`.

   **A conformance-sourced (or auditagent/github) finding must be rewritten to the exact same standard as a manual `/write-finding` finding** — do not pass the raw source text through. AuditAgent findings in particular arrive as one long unformatted paragraph; reshape them into the structured, backticked, snippet-bearing form above. Specifically, the prose you land must obey the report-facing content rules:
   - **Structure + identifiers:** short expected/flaw/impact paragraphs, a ```solidity snippet, every identifier backticked and functions as `` `name(...)` `` (as above).
   - **Recommendation tone:** hedged (`Consider...`, `One option is...`), never prescriptive (`Replace X with Y`, `You must...`). Follow the project writing style (no em dashes, no banned words / AI giveaways).
   - **No line numbers — show the code.** Never cite specific source lines ("line 56"); line numbers drift. Use the ```solidity block instead, and refer to code by function/variable name. Do not transcribe line numbers from the conformance item's `code_location` into the prose (that field stays internal, for navigation only).
   - **Stand alone — no cross-references** to other findings by Hex id (`H-NNN`) or number/title.
   - **No PoC references** in the description or recommendation.

   **Normalizing legacy findings:** if you are re-run on a finding whose stored description still contains line numbers, `H-NNN` cross-references, or PoC mentions (authored before these rules), rewrite it now: replace line references with a fenced ```` ```solidity ```` block, drop the id/PoC references, and re-land the cleaned prose via `--description-file`. This (followed by `/sync-issues`) is how an already-synced finding gets cleaned; the report never rewrites GitHub-canonical prose itself.

   Hex does not write `@audit-issue` comments into the client's source files — the board and finding record are the only place the issue lives.

6. Use **AskUserQuestion** to ask:
   > Issue verified as **\<id\>** with severity **\<current severity\>**.
   >
   > Would you like to change the severity? Reply with the new severity (Critical / High / Medium / Low / Info), or **no** to keep it.

7. If the user provides a new severity, run `npx --no-install hex issue patch <id> --severity <NewSeverity>`.

**Rejected — true but not a security issue (by-design / informational):**

The claim is correct, but Step 2.5 says it isn't a vuln worth reporting (self-inflicted, design decision, missing feature, defense-in-depth noise). This is **not** the same as "incorrect" — give it its own disposition so it's distinguishable from a false positive and AuditAgent gets honest feedback.

1. Write the memo with `Disposition: by-design` (or `informational`) and the Step-2.5 reasoning, and record it: `npx --no-install hex issue validation <id> --verdict refuted --by auditor --memo .hex/validations/<id>_memo.md`.
2. **Propose a triage rule** when the reason is general (a trusted role, an out-of-scope token type, a deliberate design choice), so AI runs stop raising the same class. Ask the auditor once, with AskUserQuestion: "Add a triage rule: *<one sentence>*?". On yes: `npx --no-install hex rules add --kind <trusted_role|out_of_scope|by_design|known_issue> --text "<sentence>" --from <id>`.
3. Mark the disposition and move it:
   ```bash
   npx --no-install hex issue patch <id> --resolution Acknowledged
   npx --no-install hex issue move <id> --to rejected
   ```
   `Acknowledged` on a Rejected card means "AA was right, but it's by-design / not a security issue" — the board shows a **By-design** chip. (A Rejected card with *no* resolution = factually incorrect; see below.)
4. Do NOT write a finding body or carry it into the report.

**Rejected — incorrect (false positive):**

The claim is factually wrong. Explain why:
- Is the attack path blocked? By what specifically (modifier, require, state check)?
- Are the preconditions impossible? Why?
- Is the impact assessment wrong? What actually happens?

Record and move it with **no** resolution (the board shows an **Invalid** chip): `npx --no-install hex issue validation <id> --verdict refuted --by auditor --memo .hex/validations/<id>_memo.md`, then `npx --no-install hex issue move <id> --to rejected`. Do NOT write a finding body — the memo records the reasoning.

**Uncertain:**

1. List specific questions that need manual investigation.
2. State what would confirm or deny the issue.
3. Leave the column as-is (no `hex issue move`). Record it: `npx --no-install hex issue validation <id> --verdict uncertain --by auditor --memo .hex/validations/<id>_memo.md` and the open questions: `npx --no-install hex issue patch <id> --notes "<open questions>"`.

## Output: validation memo

Write `<output_dir>/validations/<id>_memo.md` (always — for valid, invalid, and uncertain verdicts):

```markdown
# Finding Validation: <ID> — <Title>

**Source:** <manual | ai-audit | auditagent | conformance | github | prior-audit>
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
- Run `/generate-report` once all verifications are done, to produce the LaTeX report sections.
