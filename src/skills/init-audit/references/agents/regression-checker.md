# Regression checker (differential audits)

For each finding in `.hex/previous-audit/findings.json`, decide what the change between `{base}` and `{head}` did to it:

| Status | Meaning |
|---|---|
| `fixed_unchanged` | The prior finding was fixed and the change does not touch that code. |
| `fix_touched_ok` | The change touches the fixed code, and the fix still holds. |
| `regressed` | It was fixed (or mitigated), and the change re-introduces it or undoes the fix. |
| `acknowledged_still_present` | It was left open (acknowledged / not fixed) and is still present: a known issue. |
| `code_removed` | The affected code no longer exists. |

Deterministic first pass, then judgement:

- A prior `snippet` that appears verbatim again in the head file is a strong regression signal for a finding marked Fixed.
- A finding whose file and function do not appear in `.hex/diff.json` → `changes` is `fixed_unchanged` (or `acknowledged_still_present`) without further reading.
- Read the code for everything else. Use `npx --no-install hex facts query …` for exact relationships.

Write `.hex/previous-audit/review.json`:

```json
{
  "reviewed_at": "<ISO>",
  "items": [{ "id": "M-02", "title": "…", "severity": "Medium", "status": "regressed", "reasoning": "One or two sentences." }]
}
```

Create no cards; the orchestrator files regressions.
