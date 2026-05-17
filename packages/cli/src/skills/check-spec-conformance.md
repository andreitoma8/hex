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
- `attack-surface.json` — for token interactions (which tokens the protocol sends/receives) and external dependencies

Run: `npx hex context` to get the full codebase.

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

For each ERC/EIP listed in `stats.json`, **fetch the canonical spec first**:
- Use **WebFetch** to retrieve the EIP from `https://eips.ethereum.org/EIPS/eip-<number>` (e.g. `https://eips.ethereum.org/EIPS/eip-20` for ERC-20)
- Extract the Specification section, focusing on MUST/SHOULD/MAY requirements
- Use this fetched spec text as the authoritative reference for all conformance checks below — do not rely on training data alone
- If the fetch fails, fall back to training knowledge but note `"spec_fetched": false` in the output

Then for each standard, verify:
- Does the implementation conform to the standard's MUST/SHOULD/MAY requirements?
- Are required events emitted in the correct circumstances?
- Are required error conditions handled?

**For EACH standard detected, you MUST fetch the canonical spec.** Do not skip this step even if you believe you know the standard well. After fetching, extract ALL `MUST`, `SHOULD`, and `MAY` requirements into a checklist, then systematically verify each one against the implementation.

Known gotchas to check:
- **ERC-20:** return values on transfer/approve, zero-amount transfers, approval race condition
- **ERC-4626:** rounding direction (up vs down) per the spec, preview vs actual amounts, maxDeposit/maxMint/maxWithdraw/maxRedeem return values
- **ERC-721:** safeTransferFrom callback behavior, approve/getApproved semantics
- **ERC-2612:** permit deadline, nonce handling, domain separator chain ID
- **ERC-1155:** batch operation semantics, balanceOf requirements

### Weird Token Compatibility Check

For every contract that interacts with ERC-20 tokens (check `attack-surface.json` `token_interactions`), verify handling of non-standard token behaviors. This is critical because protocols rarely restrict which tokens can be used, and many deployed tokens have non-standard behaviors.

For each behavior below, classify as CONFORMS (handled correctly), DEVIATES (not handled, tokens with this behavior could be used), PARTIAL (some code paths handle it), or UNVERIFIABLE (depends on token whitelist configuration):

- **Fee-on-transfer tokens** (e.g., STA, PAXG): Does the protocol calculate received amounts using `balanceAfter - balanceBefore`, or does it trust the transfer amount parameter? If the latter, accounting will be wrong for fee-on-transfer tokens.
- **Rebasing tokens** (e.g., stETH, aTokens): Does the protocol cache token balances that may become stale between transactions? Does internal accounting track shares or absolute amounts?
- **Blocklist tokens** (e.g., USDC, USDT): Can a blocked/frozen address cause denial of service by being unable to receive transfers in a batch or loop operation? Can a blocklisted user prevent liquidation or withdrawal for others?
- **Double-entry point tokens** (e.g., legacy SNX via ProxyERC20): Could the same underlying token be counted twice through different entry points? Does the protocol deduplicate token addresses?
- **Low-decimal tokens** (e.g., USDC with 6, GUSD with 2, WBTC with 8): Are decimal conversions handled correctly? Is there precision loss with very small amounts that could be exploited through repeated small operations?
- **Upgradeable tokens** (e.g., USDT, USDC): Is there risk that token behavior changes post-deployment (e.g., adding fee-on-transfer, changing decimals)?
- **No-revert-on-failure tokens** (e.g., ZRX, BAT): Does the protocol check return values on transfer/approve, or use `SafeERC20`/`safeTransfer`? Unchecked calls to these tokens silently fail.
- **Tokens with non-standard decimals**: Does the protocol hardcode 18 decimals, or read `decimals()` dynamically? Hardcoded assumptions break with non-18-decimal tokens.

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
    "erc_eip": [{ "standard": "ERC-20", "spec_fetched": true }, { "standard": "ERC-4626", "spec_fetched": true }]
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
      "spec_location": {
        "url": "https://eips.ethereum.org/EIPS/eip-20#transfer (REQUIRED for erc_eip; recommended for external_docs when a stable section anchor is available)",
        "section": "Section anchor or heading the requirement came from (e.g. 'transfer', 'Methods → balanceOf')",
        "anchor": "Optional URL fragment to link directly to the requirement",
        "file": "For natspec source: the contract file where the spec comment lives",
        "line": "For natspec source: the line of the spec comment"
      },
      "status": "CONFORMS|DEVIATES|PARTIAL|UNVERIFIABLE|UNDOCUMENTED",
      "finding": "...",
      "code_location": { "file": "...", "line_start": 0, "line_end": 0 },
      "severity_hint": "Critical|High|Medium|Low|Info",
      "confidence": "high|medium|low"
    }
  ]
}
```

For every `erc_eip` source item, the `spec_location.url` field MUST be populated and MUST point to the canonical eips.ethereum.org page (with a `#section` anchor when the requirement maps to a specific section). The dashboard renders this as a clickable link on `/conformance` so auditors can verify against the spec without re-fetching it. If you cannot find an anchor, link to the EIP root.

The dashboard renders this JSON with structured tables, expandable details, and status filtering — no separate markdown file is needed.
