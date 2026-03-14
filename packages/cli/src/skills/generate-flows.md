---
description: "Generate Excalidraw flow charts by user type and value paths"
---

# Skill: Generate Flow Charts

**Recommended model:** Opus

## Context Assembly

Run: `npx solaudit context` to get the full codebase.

Read these files from the output directory:
- **`access-control.json`** — Role → function mapping
  - `roles`: Array of `{ role, confidence, functions: [{ contract, function }] }`
- **`external-calls.json`** — External call surface with trust levels
  - `calls`: Array of `{ contract, function, target, method, trust_level, call_type }`
- **`state-vars.json`** — State variable inventory
  - `variables`: Array of `{ contract, name, type, visibility, mutability, ... }`
- **`stats.json`** — Contract overview, types, sizes, ERC/EIP data
  - `per_contract`: Array of `{ contract, file, type, nsloc, functions, external_functions, inherits, ... }`
  - `erc_eip_usage`: Detected ERC/EIP standards across the protocol
- **`deps.json`** — Contract relationships, clusters, inheritance
  - `graph`: Record of contract name → `{ inherits, imports, calls }`
  - `clusters`, `inheritance_trees`, `topological_order`
- **`overview.md`** (optional) — AI-generated protocol overview. If present, extract per-contract purpose descriptions to inform swim lane headers, flow naming, and annotations.

### ERC/EIP Mapping

Using `stats.json.per_contract.inherits`, determine which contracts implement ERC/EIP standards (e.g., if Vault inherits ERC4626, label it `[ERC-4626]`). Cross-reference with `stats.json.erc_eip_usage` to confirm. Use these labels in swim lane headers.

## Task

Create Excalidraw flow charts for every significant flow in the protocol.

**Critical instruction:** All labels, node text, and annotations must use **plain English descriptions** — not Solidity code. The audience is someone who wants to understand the protocol flow without reading source code. Function names, variable names, and Solidity syntax must NOT appear in node labels. You may include them as small, secondary annotations only if needed for cross-referencing with the codebase.

### Flow Grouping

Group flows by:

1. **User type** (from access control: anyone, owner, keeper, etc.)
   - For each role, trace what functions they can call and what those functions do

2. **Value flows** (any path where tokens/ETH move)
   - Deposits, withdrawals, fee collection, liquidations, swaps
   - Mark entry/exit points for value

3. **Admin flows** (configuration, pausing, upgrades)
   - What can the admin change?
   - What are the consequences of each admin action?

### For Each Flow

- Start with the entry point (the user action that triggers the flow)
- Trace through all internal steps, state changes, and external interactions
- End at the outcome (result returned, tokens transferred, or operation rejected)
- Mark where value (tokens/ETH) enters or leaves the system with a red border
- Mark where important protocol state is modified with a yellow highlight
- Show rejection conditions as rounded rectangles with red stroke (do NOT use diamond shapes — they break in raw Excalidraw JSON)

### Plain-English Labeling Rules

Every label in the diagram must follow these rules:

**Swim lane headers** — Use contract purpose + ERC label, not just the contract name:
- Bad: `Vault`
- Good: `Vault [ERC-4626] — Main deposit/withdrawal entry`
- Derive the purpose from `overview.md` (if available) or infer from the contract's role. Include the ERC label from `stats.json.per_contract.inherits` when applicable.

**Node labels (steps)** — Describe what happens, not what function is called:
- Bad: `_deposit(assets, shares, receiver)`
- Good: `Calculate shares for deposited assets and mint to receiver`

**State change labels** — Describe the effect on the protocol, not the variable:
- Bad: `totalAssets += amount`
- Good: `Increase tracked total assets`

**Decision nodes** — Describe the condition in plain terms:
- Bad: `require(assets > 0)`
- Good: `Deposit amount must be > 0`

**External call labels** — Describe the purpose of the interaction:
- Bad: `IERC20(token).transferFrom(msg.sender, address(this), assets)`
- Good: `Pull deposited tokens from user`

**Value transfer arrows** — Describe what moves and where:
- Bad: `safeTransfer(token, receiver, amount)`
- Good: `Send withdrawal proceeds to user`

The goal: same information density as code-level labels, but written for someone reviewing the protocol's logic without a code editor open.

### Layout

Use swim lanes to separate contracts:
- Each contract gets a vertical column
- The column header includes: contract name, ERC label (if any), and one-line purpose (from `overview.md` or inferred)
- Steps between contracts are horizontal arrows with plain-English labels
- State changes are annotated inline with plain-English descriptions
- External calls (to out-of-scope contracts) go to a separate "External" lane

### Visual Conventions

| Element | Shape | Color |
|---------|-------|-------|
| Entry point (user action) | Rounded rectangle | Green fill (#dcfce7) |
| Internal step | Rectangle | White fill |
| State change | Rectangle with dashed border | Yellow fill (#fef9c3) |
| External interaction | Rectangle with bold border | Red fill (#fee2e2) |
| Decision / validation check | Rounded rectangle | White fill, red stroke (#ef4444) |
| Value transfer | Arrow with "$" label | Red stroke |
| Return / rejection | Rounded rectangle | Gray fill |

## Output

Generate each flow as a separate file: `<output_dir>/flow-<name>.excalidraw` (e.g., `flow-deposit.excalidraw`, `flow-admin-pause.excalidraw`).

Generate flows one at a time, not programmatically all at once. If there are more than 3 flows, do them sequentially — verify each flow renders correctly before starting the next.

Use the swim lane layout:
- Y-axis: flow progression (top to bottom)
- X-axis: contract separation (left to right)
- Each file contains a single flow

---

## Excalidraw JSON Structure

Every output file must use this exact wrapper:

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

## Element Templates

**CRITICAL:** Every labeled shape requires TWO elements — a shape with `boundElements` and a separate text element with `containerId`. Text without `containerId` will float free and not move with its shape.

### Swim Lane Header (rectangle + bound text)

```json
{
  "type": "rectangle",
  "id": "lane-Vault",
  "x": 100,
  "y": 100,
  "width": 240,
  "height": 70,
  "strokeColor": "#3b82f6",
  "backgroundColor": "#dbeafe",
  "fillStyle": "solid",
  "strokeWidth": 2,
  "strokeStyle": "solid",
  "roughness": 0,
  "opacity": 100,
  "angle": 0,
  "groupIds": [],
  "frameId": null,
  "index": "a0",
  "roundness": { "type": 3 },
  "seed": 100001,
  "version": 1,
  "versionNonce": 100001,
  "isDeleted": false,
  "boundElements": [
    { "id": "text-lane-Vault", "type": "text" }
  ],
  "updated": 1,
  "link": null,
  "locked": false
},
{
  "type": "text",
  "id": "text-lane-Vault",
  "x": 110,
  "y": 110,
  "width": 220,
  "height": 50,
  "text": "Vault [ERC-4626]\nMain deposit/withdrawal entry",
  "originalText": "Vault [ERC-4626]\nMain deposit/withdrawal entry",
  "fontSize": 11,
  "fontFamily": 2,
  "textAlign": "center",
  "verticalAlign": "middle",
  "containerId": "lane-Vault",
  "autoResize": true,
  "lineHeight": 1.25,
  "strokeColor": "#1e1e1e",
  "backgroundColor": "transparent",
  "fillStyle": "solid",
  "strokeWidth": 1,
  "strokeStyle": "solid",
  "roughness": 0,
  "opacity": 100,
  "angle": 0,
  "groupIds": [],
  "frameId": null,
  "roundness": null,
  "seed": 100002,
  "version": 1,
  "versionNonce": 100002,
  "isDeleted": false,
  "boundElements": null,
  "updated": 1,
  "link": null,
  "locked": false
}
```

### Flow Step Box (rectangle + bound text)

```json
{
  "type": "rectangle",
  "id": "s-1",
  "x": 100,
  "y": 200,
  "width": 240,
  "height": 55,
  "strokeColor": "#1e1e1e",
  "backgroundColor": "#ffffff",
  "fillStyle": "solid",
  "strokeWidth": 1,
  "strokeStyle": "solid",
  "roughness": 0,
  "opacity": 100,
  "angle": 0,
  "groupIds": [],
  "frameId": null,
  "index": "a1",
  "roundness": { "type": 3 },
  "seed": 100003,
  "version": 1,
  "versionNonce": 100003,
  "isDeleted": false,
  "boundElements": [
    { "id": "text-s-1", "type": "text" }
  ],
  "updated": 1,
  "link": null,
  "locked": false
},
{
  "type": "text",
  "id": "text-s-1",
  "x": 110,
  "y": 210,
  "width": 220,
  "height": 35,
  "text": "Calculate shares for\ndeposited assets",
  "originalText": "Calculate shares for\ndeposited assets",
  "fontSize": 12,
  "fontFamily": 2,
  "textAlign": "center",
  "verticalAlign": "middle",
  "containerId": "s-1",
  "autoResize": true,
  "lineHeight": 1.25,
  "strokeColor": "#1e1e1e",
  "backgroundColor": "transparent",
  "fillStyle": "solid",
  "strokeWidth": 1,
  "strokeStyle": "solid",
  "roughness": 0,
  "opacity": 100,
  "angle": 0,
  "groupIds": [],
  "frameId": null,
  "roundness": null,
  "seed": 100004,
  "version": 1,
  "versionNonce": 100004,
  "isDeleted": false,
  "boundElements": null,
  "updated": 1,
  "link": null,
  "locked": false
}
```

### Decision / Validation Check (rounded rectangle + bound text, red stroke)

Do NOT use diamond shapes — they break in raw Excalidraw JSON.

```json
{
  "type": "rectangle",
  "id": "s-check-1",
  "x": 100,
  "y": 280,
  "width": 240,
  "height": 55,
  "strokeColor": "#ef4444",
  "backgroundColor": "#ffffff",
  "fillStyle": "solid",
  "strokeWidth": 2,
  "strokeStyle": "solid",
  "roughness": 0,
  "opacity": 100,
  "angle": 0,
  "groupIds": [],
  "frameId": null,
  "index": "a2",
  "roundness": { "type": 3 },
  "seed": 100005,
  "version": 1,
  "versionNonce": 100005,
  "isDeleted": false,
  "boundElements": [
    { "id": "text-s-check-1", "type": "text" }
  ],
  "updated": 1,
  "link": null,
  "locked": false
},
{
  "type": "text",
  "id": "text-s-check-1",
  "x": 110,
  "y": 290,
  "width": 220,
  "height": 35,
  "text": "Deposit amount must be > 0",
  "originalText": "Deposit amount must be > 0",
  "fontSize": 11,
  "fontFamily": 2,
  "textAlign": "center",
  "verticalAlign": "middle",
  "containerId": "s-check-1",
  "autoResize": true,
  "lineHeight": 1.25,
  "strokeColor": "#1e1e1e",
  "backgroundColor": "transparent",
  "fillStyle": "solid",
  "strokeWidth": 1,
  "strokeStyle": "solid",
  "roughness": 0,
  "opacity": 100,
  "angle": 0,
  "groupIds": [],
  "frameId": null,
  "roundness": null,
  "seed": 100006,
  "version": 1,
  "versionNonce": 100006,
  "isDeleted": false,
  "boundElements": null,
  "updated": 1,
  "link": null,
  "locked": false
}
```

### Arrow (between steps)

```json
{
  "type": "arrow",
  "id": "arrow-s1-s2",
  "x": 220,
  "y": 255,
  "width": 0,
  "height": 25,
  "points": [[0, 0], [0, 25]],
  "strokeColor": "#1e1e1e",
  "backgroundColor": "transparent",
  "fillStyle": "solid",
  "strokeWidth": 2,
  "strokeStyle": "solid",
  "roughness": 0,
  "opacity": 100,
  "angle": 0,
  "groupIds": [],
  "frameId": null,
  "roundness": null,
  "elbowed": true,
  "seed": 100007,
  "version": 1,
  "versionNonce": 100007,
  "isDeleted": false,
  "boundElements": null,
  "updated": 1,
  "link": null,
  "locked": false,
  "startBinding": {
    "elementId": "s-1",
    "focus": 0,
    "gap": 2,
    "fixedPoint": null
  },
  "endBinding": {
    "elementId": "s-check-1",
    "focus": 0,
    "gap": 2,
    "fixedPoint": null
  },
  "startArrowhead": null,
  "endArrowhead": "triangle"
}
```

**Arrow rules:**
- `roughness: 0` + `roundness: null` + `elbowed: true` = clean elbow arrows
- `points` array: first point is always `[0, 0]`, subsequent points are offsets from the arrow's `(x, y)`
- `width` and `height` must match the bounding box of the `points` array
- Both source and target shapes must include this arrow's ID in their `boundElements` array

### Arrow Label (free text, unbound)

For labels on arrows (e.g., "revert", "success", "$"), use a standalone text element positioned beside the arrow. Do NOT bind it to the arrow.

```json
{
  "type": "text",
  "id": "label-arrow-s1-s2",
  "x": 230,
  "y": 260,
  "width": 40,
  "height": 15,
  "text": "revert",
  "originalText": "revert",
  "fontSize": 10,
  "fontFamily": 2,
  "textAlign": "left",
  "verticalAlign": "top",
  "containerId": null,
  "autoResize": true,
  "lineHeight": 1.25,
  "strokeColor": "#6b7280",
  "backgroundColor": "transparent",
  "fillStyle": "solid",
  "strokeWidth": 1,
  "strokeStyle": "solid",
  "roughness": 0,
  "opacity": 100,
  "angle": 0,
  "groupIds": [],
  "frameId": null,
  "roundness": null,
  "seed": 100008,
  "version": 1,
  "versionNonce": 100008,
  "isDeleted": false,
  "boundElements": null,
  "updated": 1,
  "link": null,
  "locked": false
}
```

### Section Divider (full-width rectangle + text)

```json
{
  "type": "rectangle",
  "id": "sec-1",
  "x": 80,
  "y": 500,
  "width": 600,
  "height": 25,
  "strokeColor": "#cbd5e1",
  "backgroundColor": "#f8fafc",
  "fillStyle": "solid",
  "strokeWidth": 1,
  "strokeStyle": "solid",
  "roughness": 0,
  "opacity": 100,
  "angle": 0,
  "groupIds": [],
  "frameId": null,
  "index": "a5",
  "roundness": { "type": 3 },
  "seed": 100009,
  "version": 1,
  "versionNonce": 100009,
  "isDeleted": false,
  "boundElements": [
    { "id": "text-sec-1", "type": "text" }
  ],
  "updated": 1,
  "link": null,
  "locked": false
},
{
  "type": "text",
  "id": "text-sec-1",
  "x": 90,
  "y": 505,
  "width": 580,
  "height": 15,
  "text": "Validation Phase",
  "originalText": "Validation Phase",
  "fontSize": 10,
  "fontFamily": 2,
  "textAlign": "center",
  "verticalAlign": "middle",
  "containerId": "sec-1",
  "autoResize": true,
  "lineHeight": 1.25,
  "strokeColor": "#374151",
  "backgroundColor": "transparent",
  "fillStyle": "solid",
  "strokeWidth": 1,
  "strokeStyle": "solid",
  "roughness": 0,
  "opacity": 100,
  "angle": 0,
  "groupIds": [],
  "frameId": null,
  "roundness": null,
  "seed": 100010,
  "version": 1,
  "versionNonce": 100010,
  "isDeleted": false,
  "boundElements": null,
  "updated": 1,
  "link": null,
  "locked": false
}
```

---

## Scale Hierarchy

**Height formula:** `containerHeight = max(minHeight, numLines × fontSize × 1.25 + 20)`

The +20 accounts for Excalidraw's BOUND_TEXT_PADDING (5px each side = 10px) plus margin.

| Element | Width | Min Height | Font size | Notes |
|---------|-------|------------|-----------|-------|
| Swim lane header | 240 | 70 | 11 | 2-3 lines (name + ERC + purpose) |
| Flow step (1-2 lines) | 240 | 55 | 12 | Entry points, simple steps |
| Flow step (3+ lines) | 240 | compute | 11 | Use formula; never less than 55 |
| Validation check | 240 | 55 | 11 | Rounded rect, red stroke |
| Rejection / outcome | 240 | 40 | 12 | Short summary text |
| Section divider | full-width | 25 | 10 | Must be 25px, not 20 |

### Arrow Edge Calculation

To position arrows, calculate shape edge midpoints:

| Edge | X | Y |
|------|---|---|
| Top center | `x + width/2` | `y` |
| Bottom center | `x + width/2` | `y + height` |
| Left center | `x` | `y + height/2` |
| Right center | `x + width` | `y + height/2` |

Set the arrow's `(x, y)` to the source edge point. Set the last point in `points` to the offset from `(x, y)` to the target edge point.

---

## Element ID Convention

Use descriptive string IDs. Never use UUIDs.

| Element | Pattern | Example |
|---------|---------|---------|
| Lane header | `lane-<Contract>` | `lane-Vault` |
| Lane label | `text-lane-<Contract>` | `text-lane-Vault` |
| Flow step | `s-<n>` | `s-1` |
| Step label | `text-s-<n>` | `text-s-1` |
| Validation check | `s-check-<n>` | `s-check-1` |
| Check label | `text-s-check-<n>` | `text-s-check-1` |
| Arrow | `arrow-<src>-<dst>` | `arrow-s1-s2` |
| Arrow label | `label-arrow-<src>-<dst>` | `label-arrow-s1-s2` |
| Section divider | `sec-<n>` | `sec-1` |
| Section label | `text-sec-<n>` | `text-sec-1` |

Use sequential integer seeds: namespace by flow section (section 1: 100xxx, section 2: 200xxx, etc.).

---

## Validation Checklist

After generating each flow file, verify every point before finishing:

- [ ] Every rectangle has `boundElements` listing its text element (and any connected arrows)
- [ ] Every text element inside a shape has `containerId` matching its parent shape's `id`
- [ ] `text` and `originalText` fields are identical on every text element
- [ ] Container height ≥ `numLines × fontSize × 1.25 + 20` (no text overflow)
- [ ] No diamond shapes (they break in raw Excalidraw JSON)
- [ ] Every arrow has `points` array with at least 2 points (first is `[0, 0]`)
- [ ] Arrow `width` and `height` match the bounding box of its `points` array
- [ ] Every arrow's `startBinding.elementId` and `endBinding.elementId` reference real element IDs
- [ ] Both source and target shapes list the arrow in their `boundElements`
- [ ] All coordinates are positive
- [ ] No overlapping step boxes within a swim lane
- [ ] `roughness: 0` on all elements
- [ ] Swim lane headers include ERC label when applicable
- [ ] Section dividers use height ≥ 25 (not 20)
