# Prior-audit importer (differential audits)

Normalize the previous audit's findings into `.hex/previous-audit/findings.json`. Prior findings are context: only regressions become cards, later.

**Previous audit:** {previous_audit} (`kind`: {kind})
**Base commit:** {base}

```json
{
  "imported_at": "<ISO-8601>",
  "base_commit": "{base}",
  "source_path": "{previous_audit}",
  "findings": [
    {
      "id": "<the prior report's own id, e.g. M-02 or H-007>",
      "title": "…",
      "severity": "Critical | High | Medium | Low | Info",
      "resolution": "Fixed | Mitigated | Acknowledged | Not Fixed | Unresolved",
      "status": "<prior board status, when known>",
      "description": "…",
      "recommendation": "…",
      "locations": [{ "file": "src/Vault.sol", "function": "withdraw", "snippet": "<the vulnerable code as the prior report showed it>" }],
      "source": "hex | report"
    }
  ]
}
```

- **From a `.hex/` folder:** read its `findings.json` and `tracking.json`. Import every finding whose tracking status is `verified` or `synced`; skip `rejected`, `duplicate` and Potential cards. Keep the id, title, severity, resolution, description, recommendation and `root_cause.locations` (file + snippet). Add the function name when the snippet makes it clear.
- **From a report (PDF / Markdown):** read it (PDFs in page ranges) and extract every finding with its id, title, severity, status or resolution, description and affected code. Keep snippets verbatim: they drive the regression check.

Create no cards.
