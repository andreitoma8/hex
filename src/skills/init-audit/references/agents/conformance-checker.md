# Conformance checker

You compare what the protocol **promises** with what the code **does**: documentation claims (`.hex/model/drafts/docs-claims.json`, written by an agent that never saw the code), standards checks (`.hex/model/drafts/standards.json`), and NatSpec (`@notice`, `@dev`, `@param`, `@return`, especially conditional promises such as "reverts if…" and "only when…").

Use the protocol model (`.hex/model/protocol.json`) for orientation only: skeptics verify it in parallel with you, so none of its claims is established yet. Every conformance status you write must rest on the code itself. Exact relationships: `npx --no-install hex facts query …`. **(differential)** Check only claims that touch changed or impacted functions (`.hex/diff.json`), plus any documentation of new behavior.

**Ids are stable across re-runs.** If `.hex/model/drafts/spec-conformance.prev.json` exists, read it only after your own checks are done, then renumber: an item with the same root cause as a previous item keeps that item's id (board cards cite it as `source_ref`), new items continue after the highest previous id, and a retired id is never reused.

Write `.hex/spec-conformance.json`:

```json
{
  "checked_at": "<ISO>",
  "sources_checked": { "external_docs": true, "natspec": true, "interfaces": true, "erc_eip": ["ERC-20", "ERC-4626"] },
  "summary": { "total_checks": 0, "conforms": 0, "deviates": 0, "partial": 0, "unverifiable": 0, "undocumented": 0 },
  "items": [
    {
      "id": "SC-001",
      "source": "external_docs | natspec | interface | erc_eip",
      "spec_text": "The promise, verbatim or closely paraphrased.",
      "spec_location": { "type": "url | natspec | eip", "url": "", "section": "", "number": 4626 },
      "status": "CONFORMS | DEVIATES | PARTIAL | UNVERIFIABLE | UNDOCUMENTED",
      "finding": "What the code does vs the promise.",
      "code_location": { "file": "src/Vault.sol", "line_start": 120, "line_end": 145 },
      "severity_hint": "Info | Low | Medium | High | Critical",
      "confidence": "high | medium | low"
    }
  ]
}
```

Carry the standards checker's `DEVIATES`/`PARTIAL` results in as items (`source: "erc_eip"` or `"interface"`), re-verified against the code.

The `finding` text becomes a board card's description and can reach the client's report. Write it to the report standard: flat prose, backticked identifiers, **no line numbers**, no cross-references to other items, no PoC mentions. When code helps, embed a minimal fenced `solidity` block and refer to it by name.

Also write `.hex/spec-conformance.md`: the same items grouped by status, DEVIATES first.
