---
description: "Verify code matches documentation, NatSpec, interfaces, and ERCs"
---

# Skill: Check Spec Conformance

**Recommended model:** Opus

## Context Assembly

Read these files from the output directory:
- `config.json` — for docs URL, scope, ERC/EIP info
- `stats.json` — for ERC/EIP usage list
- `invariants.md` — for cross-reference with invariant analysis (if available)

Run: `npx solaudit context` to get the full codebase.

If `config.json` has a `docs_url`, fetch and read the full documentation.

## Task — Four-Source Analysis

### Source 1: External Documentation
Read the project documentation and extract every behavioral claim:
- "Users can deposit X and receive Y"
- "Fees are capped at 10%"
- "Only the admin can pause the contract"
- "Withdrawals process within one epoch"

For each claim, find the code that implements it. Verify the implementation matches.

### Source 2: NatSpec Comments
For every function with `@notice`, `@dev`, `@param`, or `@return` NatSpec:
- Does the function actually do what `@notice` says?
- Are `@param` descriptions accurate (especially constraints like "must be > 0")?
- Does the function return what `@return` describes?
- Are there `@dev` notes about behavior that the code contradicts?

Pay special attention to:
- NatSpec that mentions conditions ("reverts if...", "only when...", "must be called before...")
- NatSpec on inherited/overridden functions — does the override still satisfy the parent's spec?

### Source 3: Interface Conformance
For every interface the contract implements (explicit `is IVault` or implicit):
- Does the contract implement ALL functions defined in the interface?
- Do the implementations respect the behavioral semantics of the interface?
- Are there functions that SHOULD be part of the interface but aren't?

### Source 4: ERC/EIP Standard Compliance
For each ERC/EIP listed in `stats.json`:
- Does the implementation conform to the standard's MUST/SHOULD/MAY requirements?
- Are required events emitted in the correct circumstances?
- Are required error conditions handled?

Known gotchas to check:
- **ERC-20:** return values on transfer/approve, zero-amount transfers
- **ERC-4626:** rounding direction (up vs down) per the spec, preview vs actual amounts
- **ERC-721:** safeTransferFrom callback behavior
- **ERC-2612:** permit deadline, nonce handling
- **ERC-1155:** batch operation semantics

## Conformance Classification

For each spec item, classify as:
- **CONFORMS** — Code matches the spec. Include evidence.
- **DEVIATES** — Code behaves differently. This is a potential finding.
- **PARTIAL** — Partially implements but misses edge cases.
- **UNVERIFIABLE** — Spec is ambiguous or depends on runtime conditions.
- **UNDOCUMENTED** — Code behavior with no corresponding spec.

## Output

Write to `<output_dir>/spec-conformance.json`:
```json
{
  "checked_at": "<ISO timestamp>",
  "sources_checked": {
    "external_docs": true/false,
    "natspec": true,
    "interfaces": true,
    "erc_eip": ["ERC-20", "ERC-4626"]
  },
  "summary": {
    "total_checks": 0,
    "conforms": 0,
    "deviates": 0,
    "partial": 0,
    "unverifiable": 0,
    "undocumented": 0
  },
  "items": [
    {
      "id": "SC-001",
      "source": "natspec|erc_eip|external_docs|interface",
      "spec_text": "...",
      "spec_location": {},
      "status": "CONFORMS|DEVIATES|PARTIAL|UNVERIFIABLE|UNDOCUMENTED",
      "finding": "...",
      "code_location": { "file": "...", "line_start": 0, "line_end": 0 },
      "severity_hint": "Critical|High|Medium|Low|Info",
      "confidence": "high|medium|low"
    }
  ]
}
```

Also render to `<output_dir>/spec-conformance.md` for human reading, grouped by status (DEVIATES first, then PARTIAL, UNVERIFIABLE, UNDOCUMENTED, CONFORMS).
