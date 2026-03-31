---
description: "Generate a protocol overview from codebase and analysis data"
---

# Skill: Generate Protocol Overview

**Recommended model:** Sonnet

## Context Assembly

Read these files from the output directory:
- `config.json` — for project name, scope, chain, docs URL
- `stats.json` — for high-level numbers (contracts, nSLOC, ERCs, dependencies)
- `deps.json` — for contract relationships and clusters

Run: `npx hex context` to get the full codebase context.

If `config.json` has a `docs_url`, fetch and read the documentation.

## Task

Write a 2-3 paragraph overview of this protocol. Cover:

1. **What the protocol does** — purpose, target users, the problem it solves
2. **Core mechanism** — how it works at a high level (deposit/withdraw flows, token economics, governance model, etc.)
3. **Key contracts and their roles** — which contracts are the entry points, which hold state, which are libraries
4. **Notable design patterns or architectural decisions** — upgradeability patterns, access control model, external dependencies, oracle usage

Write for an experienced Solidity auditor who needs to quickly understand what they're looking at before diving into the code. Be precise and technical. Reference specific contract names and functions where relevant.

**Do NOT:**
- List findings or security concerns — this is purely descriptive
- Speculate about vulnerabilities
- Include code snippets
- Add disclaimers about AI limitations

## Output

Write the overview to `<output_dir>/overview.md` with this format:

```markdown
# Protocol Overview: [Name]

[2-3 paragraphs]

## Key Contracts

| Contract | Type | nSLOC | Role |
|----------|------|-------|------|
| ... | ... | ... | ... |

## External Dependencies
- [Package] v[version] — used for [purpose]

## Architecture Notes
- [Notable design decisions, patterns, or concerns to keep in mind during review]
```
