---
description: "Generate Excalidraw flow charts by user type and value paths"
---

# Skill: Generate Flow Charts

**Recommended model:** Opus

## Context Assembly

Run: `npx solaudit context` to get the full codebase.

Read these files from the output directory:
- **`access-control.json`** — Role → function mapping
- **`external-calls.json`** — External call surface with trust levels
- **`state-vars.json`** — State variable inventory
- **`stats.json`** — Contract overview, types, sizes, ERC/EIP data
- **`deps.json`** — Contract relationships, clusters, inheritance
- **`overview.md`** (optional) — AI-generated protocol overview for swim lane headers and flow naming

### ERC/EIP Mapping

From `stats.json.per_contract.inherits`, determine which contracts implement ERC/EIP standards (e.g., Vault inherits ERC4626 → label `[ERC-4626]`). Use these labels in swim lane headers.

## Task

Create Excalidraw flow charts for every significant flow in the protocol.

**Critical instruction:** All labels, node text, and annotations must use **plain English descriptions** — not Solidity code. The audience is someone reviewing the protocol without reading source code.

### Flow Grouping

1. **User type** (from access control: anyone, owner, keeper, etc.) — trace what functions each role can call
2. **Value flows** (deposits, withdrawals, fee collection, liquidations, swaps) — mark entry/exit points for value
3. **Admin flows** (configuration, pausing, upgrades) — what can the admin change and what are the consequences

### For Each Flow

- Start with the entry point (user action that triggers the flow)
- Trace through all internal steps, state changes, and external interactions
- End at the outcome (result returned, tokens transferred, or operation rejected)
- Mark value entry/exit points with red border
- Mark important state modifications with yellow highlight
- Show rejection conditions as rounded rectangles with red stroke (no diamond shapes)

### Plain-English Labeling Rules

**Swim lane headers** — Contract purpose + ERC label:
- Bad: `Vault` → Good: `Vault [ERC-4626] — Main deposit/withdrawal entry`

**Node labels** — Describe what happens, not what function is called:
- Bad: `_deposit(assets, shares, receiver)` → Good: `Calculate shares for deposited assets and mint to receiver`

**State changes** — Describe the effect:
- Bad: `totalAssets += amount` → Good: `Increase tracked total assets`

**Decisions** — Plain conditions:
- Bad: `require(assets > 0)` → Good: `Deposit amount must be > 0`

**External calls** — Purpose of interaction:
- Bad: `IERC20(token).transferFrom(...)` → Good: `Pull deposited tokens from user`

**Value transfers** — What moves and where:
- Bad: `safeTransfer(token, receiver, amount)` → Good: `Send withdrawal proceeds to user`

### Layout

Use swim lanes to separate contracts:
- Each contract gets a vertical column with header (name + ERC label + one-line purpose)
- Steps between contracts are horizontal arrows with plain-English labels
- State changes annotated inline
- External calls (out-of-scope contracts) go to a separate "External" lane

### Visual Conventions

| Element | Shape | Color |
|---------|-------|-------|
| Entry point (user action) | Rounded rectangle | Green fill (`#dcfce7`) |
| Internal step | Rectangle | White fill |
| State change | Rectangle, dashed border | Yellow fill (`#fef9c3`) |
| External interaction | Rectangle, bold border | Red fill (`#fee2e2`) |
| Decision / validation | Rounded rectangle | White fill, red stroke (`#ef4444`) |
| Value transfer | Arrow with "$" label | Red stroke |
| Return / rejection | Rounded rectangle | Gray fill |

---

## Excalidraw JSON Rules

### Binding pattern (REQUIRED for every labeled shape)

Every labeled shape = **TWO elements**: a shape with `boundElements` + a text element with `containerId`.

```
Shape:  "boundElements": [{"id": "<text-id>", "type": "text"}, ...arrows...]
Text:   "containerId": "<shape-id>",  "originalText" must equal "text"
```

### Critical properties

1. `fontFamily: 2` (Helvetica) on ALL text — never `1` (Virgil/handwritten)
2. `roughness: 0` on everything
3. `autoResize: true` on bound text elements
4. `textAlign: "center"`, `verticalAlign: "middle"` for bound text
5. No diamond shapes — use styled rectangles instead
6. Size containers to fit text: `height = max(minHeight, numLines × fontSize × 1.25 + 20)`

### Arrow rules

1. Always elbowed: `roughness: 0` + `roundness: null` + `elbowed: true`
2. `points[0]` is always `[0, 0]`; subsequent points are offsets from arrow's `(x, y)`
3. `width`/`height` = bounding box of the `points` array
4. Both source and target shapes must list the arrow in their `boundElements`
5. `startBinding.elementId` / `endBinding.elementId` must reference real element IDs

### Arrow labels

For labels on arrows (e.g., "revert", "success", "$"), use a standalone text element positioned beside the arrow. Do NOT bind it to the arrow.

### Element ID Convention

| Element | Pattern | Example |
|---------|---------|---------|
| Lane header | `lane-<Contract>` | `lane-Vault` |
| Lane label | `text-lane-<Contract>` | `text-lane-Vault` |
| Flow step | `s-<n>` | `s-1` |
| Step label | `text-s-<n>` | `text-s-1` |
| Validation check | `s-check-<n>` | `s-check-1` |
| Arrow | `arrow-<src>-<dst>` | `arrow-s1-s2` |
| Arrow label | `label-arrow-<src>-<dst>` | `label-arrow-s1-s2` |
| Section divider | `sec-<n>` | `sec-1` |

Use descriptive string IDs, never UUIDs. Sequential integer seeds namespaced by section.

### JSON wrapper

```json
{
  "type": "excalidraw",
  "version": 2,
  "source": "solaudit",
  "elements": [ ... ],
  "appState": { "viewBackgroundColor": "#ffffff", "gridSize": 20 },
  "files": {}
}
```

---

## Validation Checklist

- [ ] Every shape has `boundElements` listing its text (and connected arrows)
- [ ] Every bound text has `containerId` matching its parent shape's `id`
- [ ] `text` === `originalText` on every text element
- [ ] `fontFamily: 2` everywhere, never `1`
- [ ] `roughness: 0` on all elements
- [ ] No diamond shapes
- [ ] Arrow `points[0]` is `[0, 0]`; `width`/`height` match points bounding box
- [ ] Both source and target shapes list each arrow in `boundElements`

---

## Output

Generate each flow as a separate file: `<output_dir>/flow-<name>.excalidraw` (e.g., `flow-deposit.excalidraw`, `flow-admin-pause.excalidraw`).

Generate flows one at a time. If there are more than 3 flows, do them sequentially — verify each renders correctly before starting the next.

Swim lane layout: Y-axis = flow progression (top to bottom), X-axis = contract separation (left to right). Each file contains a single flow.
