---
description: "Create an Excalidraw system architecture diagram"
---

# Skill: Generate System Diagram

**Recommended model:** Sonnet

## Context Assembly

Read these files from the output directory:

- **`deps.json`** — Contract relationships, clusters, inheritance
  - `graph`: Record of contract name → `{ inherits: string[], imports: string[], calls: string[] }`
  - `clusters`: Array of `{ id: string, contracts: string[], total_nsloc: number }`
  - `inheritance_trees`: Arrays of ordered contract names (base → derived)
  - `topological_order`: Contracts sorted by dependency depth
- **`access-control.json`** — Roles and function access
  - `roles`: Array of `{ role: string, confidence: { value: "high"|"medium"|"low" }, functions: [{ contract, function }] }`
- **`stats.json`** — Contract types and sizes
  - `per_contract`: Array of `{ contract, file, type, nsloc, functions, external_functions, modifiers, events, errors }`
- **`external-calls.json`** — External call surface with trust levels
  - `calls`: Array of `{ contract, function, target, method, trust_level: { value: "trusted"|"semi-trusted"|"untrusted"|"external" }, call_type }`
- **`overview.md`** (optional) — AI-generated protocol overview. If present, extract per-contract purpose descriptions to use as annotations on the diagram.
- **`state-vars.json`** — State variable inventory
  - `variables`: Array of `{ contract, name, type, visibility, mutability, ... }`
  - Look for address-type variables (`address`, `IERC20`, `IStrategy`, etc.) that reference other in-scope contracts. These represent architectural dependencies ("Contract A holds a reference to Contract B") that may not appear in `external-calls.json`.
- **ERC/EIP from `stats.json`** — Note that `stats.json.erc_eip_usage` contains detected ERC/EIP standards. Also, `stats.json.per_contract.inherits` can map which contract implements which ERC.

## Step 0: Plan Before Drawing

Before generating any JSON, analyze the data and plan the layout.

### 1. Determine diagram size tier

| Tier | Contracts | Strategy |
|------|-----------|----------|
| Small | 1-8 | Generate entire diagram in one pass |
| Medium | 9-20 | Generate in one pass, but plan layout carefully |
| Large | 21+ | Generate cluster-by-cluster to avoid token limits |

### 2. Identify hero contracts

The 1-3 most important contracts get larger rectangles. Rank by:
- Highest nSLOC (from `stats.json`)
- Most incoming/outgoing calls (from `deps.json.graph`)
- Most external functions (from `stats.json`)

### 3. Map ERC/EIP usage to contracts

Using `stats.json.per_contract.inherits`, determine which contracts implement ERC/EIP standards (e.g., if Vault inherits ERC4626, label it `[ERC-4626]`). Cross-reference with `stats.json.erc_eip_usage` to confirm.

### 4. Plan the cluster grid

Assign each cluster from `deps.json.clusters` to a canvas region. Output the plan in a code fence before starting JSON generation:

```
Tier: Medium (14 contracts)
Hero: Vault (1,245 nSLOC), Strategy (890 nSLOC)

Cluster layout:
  Row 0: [Core (Vault, Strategy, Router)] x=100..900, y=100..500
  Row 1: [Libraries (Math, SafeCast)] x=100..500, y=600..900
  Row 1: [Interfaces (IVault, IStrategy)] x=600..1000, y=600..900
```

---

## Color Palette

Use these exact colors. Do not invent new ones.

### Contract fills (by type from `stats.json`)

| Type | Fill | Stroke |
|------|------|--------|
| Core contract (contract) | `#dbeafe` | `#3b82f6` |
| Library | `#dcfce7` | `#22c55e` |
| Interface | `#f3f4f6` | `#9ca3af` |
| Abstract contract | `#fef3c7` | `#f59e0b` |

### Cluster boundaries

| Element | Fill | Stroke | Style |
|---------|------|--------|-------|
| Cluster boundary | `#f8fafc` | `#cbd5e1` | `strokeStyle: "dashed"` |

### Role badges

| Role type | Fill | Stroke |
|-----------|------|--------|
| `anyone` / unrestricted | `#fee2e2` | `#ef4444` |
| Low confidence | `#fef9c3` | `#eab308` |
| High/medium confidence | `#dcfce7` | `#22c55e` |

### Arrows

| Relationship | Stroke color | Style |
|--------------|-------------|-------|
| Inheritance | `#6b7280` | solid |
| External call (trusted) | `#3b82f6` | dashed |
| External call (semi-trusted) | `#f59e0b` | dashed |
| External call (untrusted/external) | `#ef4444` | dashed |
| Role → contract connection | `#9ca3af` | dotted |
| State var reference | `#9ca3af` | dotted, thin (`strokeWidth: 1`) |

### Text colors

| Level | Color |
|-------|-------|
| Title | `#1e1e1e` |
| Contract name | `#1e1e1e` |
| Subtitle / nSLOC | `#374151` |
| Body / annotation | `#6b7280` |

---

## Element Templates

**CRITICAL:** Every labeled shape requires TWO elements — a shape with `boundElements` and a separate text element with `containerId`. Text without `containerId` will float free and not move with its shape.

### Contract Rectangle + Label

```json
{
  "type": "rectangle",
  "id": "contract-Vault",
  "x": 100,
  "y": 100,
  "width": 200,
  "height": 80,
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
    { "id": "text-Vault", "type": "text" },
    { "id": "arrow-inherits-Vault-BaseVault", "type": "arrow" }
  ],
  "updated": 1,
  "link": null,
  "locked": false
},
{
  "type": "text",
  "id": "text-Vault",
  "x": 110,
  "y": 115,
  "width": 180,
  "height": 50,
  "text": "Vault [ERC-4626]\n(1,245 nSLOC)\nMain deposit/withdrawal entry",
  "originalText": "Vault [ERC-4626]\n(1,245 nSLOC)\nMain deposit/withdrawal entry",
  "fontSize": 16,
  "fontFamily": 2,
  "textAlign": "center",
  "verticalAlign": "middle",
  "containerId": "contract-Vault",
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

**Notes:**
- The rectangle's `boundElements` must list ALL elements bound to it (text + any arrows connecting to it)
- The text's `containerId` must match the rectangle's `id`
- `text` and `originalText` must be identical
- Include `autoResize: true` so text auto-fits
- Use `fontFamily: 2` (Helvetica) for all text — do NOT use 1 (Virgil/handwritten)

**Contract label format** — Build the label with up to 3 lines:
- With ERC: `"Vault [ERC-4626]\n(342 nSLOC)"`
- With ERC + purpose (from `overview.md`): `"Vault [ERC-4626]\n(342 nSLOC)\nMain deposit/withdrawal entry"`
- Without either: `"ContractName\n(342 nSLOC)"` (unchanged)

Keep purpose annotations to max 30 characters. Use the hero height (120px) to accommodate the extra line.

### Inheritance Arrow (solid, elbow)

```json
{
  "type": "arrow",
  "id": "arrow-inherits-Vault-BaseVault",
  "x": 200,
  "y": 180,
  "width": 0,
  "height": 100,
  "points": [[0, 0], [0, 100]],
  "strokeColor": "#6b7280",
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
  "seed": 100003,
  "version": 1,
  "versionNonce": 100003,
  "isDeleted": false,
  "boundElements": null,
  "updated": 1,
  "link": null,
  "locked": false,
  "startBinding": {
    "elementId": "contract-Vault",
    "focus": 0,
    "gap": 2,
    "fixedPoint": null
  },
  "endBinding": {
    "elementId": "contract-BaseVault",
    "focus": 0,
    "gap": 2,
    "fixedPoint": null
  },
  "startArrowhead": null,
  "endArrowhead": "triangle"
}
```

**Arrow rules:**
- `roughness: 0` + `roundness: null` + `elbowed: true` = clean 90-degree elbow arrows
- `points` array: first point is always `[0, 0]`, subsequent points are offsets from the arrow's `(x, y)`
- `width` and `height` must match the bounding box of the `points` array
- The arrow `(x, y)` is the starting point; set it to the source shape's edge
- Both the source and target shapes must include this arrow's ID in their `boundElements` array

### External Call Arrow (dashed)

Same structure as inheritance arrow, but with:
```json
"strokeStyle": "dashed",
"strokeColor": "#ef4444",
"endArrowhead": "arrow"
```

Color the stroke based on trust level from `external-calls.json`:
- trusted → `#3b82f6`
- semi-trusted → `#f59e0b`
- untrusted/external → `#ef4444`

### State Variable Reference Arrow (dotted, thin)

For each address-type state variable in `state-vars.json` where the type matches an in-scope contract name (or its interface), draw a thin dotted arrow from the holder to the referenced contract. **Only draw these if there isn't already an external call arrow between the same pair.**

Same structure as inheritance arrow, but with:
```json
"strokeStyle": "dotted",
"strokeColor": "#9ca3af",
"strokeWidth": 1,
"endArrowhead": "arrow"
```

### Role Badge (small labeled rectangle)

```json
{
  "type": "rectangle",
  "id": "role-anyone",
  "x": 120,
  "y": 200,
  "width": 100,
  "height": 30,
  "strokeColor": "#ef4444",
  "backgroundColor": "#fee2e2",
  "fillStyle": "solid",
  "strokeWidth": 1,
  "strokeStyle": "solid",
  "roughness": 0,
  "opacity": 100,
  "angle": 0,
  "groupIds": [],
  "frameId": null,
  "roundness": { "type": 3 },
  "seed": 100004,
  "version": 1,
  "versionNonce": 100004,
  "isDeleted": false,
  "boundElements": [
    { "id": "text-role-anyone", "type": "text" }
  ],
  "updated": 1,
  "link": null,
  "locked": false
},
{
  "type": "text",
  "id": "text-role-anyone",
  "x": 125,
  "y": 205,
  "width": 90,
  "height": 20,
  "text": "anyone",
  "originalText": "anyone",
  "fontSize": 12,
  "fontFamily": 2,
  "textAlign": "center",
  "verticalAlign": "middle",
  "containerId": "role-anyone",
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
  "seed": 100005,
  "version": 1,
  "versionNonce": 100005,
  "isDeleted": false,
  "boundElements": null,
  "updated": 1,
  "link": null,
  "locked": false
}
```

Connect role badges to their contracts with a thin dotted arrow (`strokeWidth: 1`, `strokeStyle: "dotted"`, `strokeColor: "#9ca3af"`).

### Cluster Boundary

```json
{
  "type": "rectangle",
  "id": "cluster-core",
  "x": 60,
  "y": 60,
  "width": 500,
  "height": 400,
  "strokeColor": "#cbd5e1",
  "backgroundColor": "#f8fafc",
  "fillStyle": "solid",
  "strokeWidth": 1,
  "strokeStyle": "dashed",
  "roughness": 0,
  "opacity": 100,
  "angle": 0,
  "groupIds": [],
  "frameId": null,
  "roundness": { "type": 3 },
  "seed": 100006,
  "version": 1,
  "versionNonce": 100006,
  "isDeleted": false,
  "boundElements": [
    { "id": "text-cluster-core", "type": "text" }
  ],
  "updated": 1,
  "link": null,
  "locked": false
}
```

Place cluster boundaries BEFORE the elements they contain in the `elements` array so they render behind.

### Arrow Edge Calculation

To position arrows, calculate shape edge midpoints:

| Edge | X | Y |
|------|---|---|
| Top center | `x + width/2` | `y` |
| Bottom center | `x + width/2` | `y + height` |
| Left center | `x` | `y + height/2` |
| Right center | `x + width` | `y + height/2` |

Set the arrow's `(x, y)` to the source edge point. Set the last point in `points` to the offset from `(x, y)` to the target edge point.

Example — arrow from bottom of A to top of B:
- A is at (100, 100) with size 200x80 → bottom center = (200, 180)
- B is at (100, 300) with size 200x80 → top center = (200, 300)
- Arrow: `x: 200, y: 180, points: [[0, 0], [0, 120]]`, `width: 0, height: 120`

---

## Scale Hierarchy

Size contracts by importance:

| Tier | Width | Height | When |
|------|-------|--------|------|
| Hero | 240 | 120 | Top 1-3 by nSLOC or connections |
| Primary | 200 | 80 | Standard contracts |
| Secondary | 160 | 60 | Libraries, small utilities |
| Interface | 160 | 50 | Interface contracts (thinner) |
| Role badge | 100 | 30 | Access control roles |

---

## Layout Algorithm

### Canvas grid

- Canvas starts at **(100, 100)**. Leave 60px margins from edges.
- Title element at **(100, 30)** with `fontSize: 28`.

### Cluster placement

- Arrange clusters in a grid: **up to 3 clusters per row**.
- Row spacing: **400px** between cluster rows.
- Column spacing: **40px** between clusters in the same row.
- Each cluster boundary has **40px padding** around its contained elements.

### Within a cluster

- **Inheritance trees**: vertical layout — base contract at top, derived contracts below.
- **Siblings**: horizontal layout — contracts at the same inheritance depth side by side.
- **Horizontal gap** between contracts: **60px**.
- **Vertical gap** between inheritance levels: **120px** (room for arrows + labels).
- **Interfaces**: left edge of cluster region.
- **Libraries**: right edge of cluster region.

### Role badge placement

- Place role badges **40px below** their most-connected contract in that cluster.
- If multiple roles connect to the same contract, arrange badges horizontally with 10px gap.

### Large diagrams (21+ contracts)

Generate the diagram cluster-by-cluster:
1. First pass: create the JSON wrapper, title, and all cluster boundaries
2. Then add one cluster's contents at a time (contracts, arrows, roles)
3. After all clusters: add cross-cluster arrows (external calls between clusters)

---

## Element ID Convention

Use descriptive string IDs. Never use UUIDs.

| Element | Pattern | Example |
|---------|---------|---------|
| Contract rectangle | `contract-<Name>` | `contract-Vault` |
| Contract label | `text-<Name>` | `text-Vault` |
| Inheritance arrow | `arrow-inherits-<Child>-<Parent>` | `arrow-inherits-Vault-BaseVault` |
| Call arrow | `arrow-calls-<Caller>-<Callee>` | `arrow-calls-Vault-Oracle` |
| Role badge | `role-<roleName>` | `role-anyone` |
| Role label | `text-role-<roleName>` | `text-role-anyone` |
| Role connector | `arrow-role-<role>-<Contract>` | `arrow-role-anyone-Vault` |
| State var ref arrow | `arrow-ref-<Holder>-<Referenced>` | `arrow-ref-Vault-Oracle` |
| Cluster boundary | `cluster-<id>` | `cluster-core` |
| Cluster title | `text-cluster-<id>` | `text-cluster-core` |
| Diagram title | `title` | `title` |

Use sequential integer seeds: namespace by section (cluster 1: 100xxx, cluster 2: 200xxx, etc.).

---

## Generation Procedure

1. **Read** all data files (deps, stats, access-control, external-calls, state-vars; optionally overview.md)
2. **Plan** the layout (Step 0). Output the plan in a code fence.
3. **Build the `elements` array** in this order:
   a. Title text element
   b. Cluster boundaries (rendered first = behind everything)
   c. Cluster title text elements
   d. Contract rectangles + labels (in topological order from `deps.json`)
   e. Inheritance arrows (from `deps.json.graph[contract].inherits`)
   f. External call arrows (from `external-calls.json.calls`, only where both caller and target are in-scope contracts)
   g. State variable reference arrows (from `state-vars.json`, only where no external call arrow already exists between the same pair)
   h. Role badges + labels + connector arrows (from `access-control.json.roles`)
4. **Assemble** the complete JSON:

```json
{
  "type": "excalidraw",
  "version": 2,
  "source": "solaudit",
  "elements": [ ... ],
  "appState": {
    "viewBackgroundColor": "#ffffff",
    "gridSize": 20
  },
  "files": {}
}
```

5. **Write** to `<output_dir>/diagram.excalidraw`

---

## Validation Checklist

After generating the file, verify each point before finishing:

- [ ] Every rectangle has a `boundElements` array listing its text element (and any connected arrows)
- [ ] Every text element inside a shape has `containerId` matching its parent shape's `id`
- [ ] `text` and `originalText` fields are identical on every text element
- [ ] Every arrow has a `points` array with at least 2 points (first is always `[0, 0]`)
- [ ] Arrow `width` and `height` match the bounding box of its `points` array
- [ ] Every arrow with bindings has `startBinding.elementId` and `endBinding.elementId` matching real element IDs
- [ ] Both source and target shapes list the arrow in their `boundElements`
- [ ] No duplicate element IDs
- [ ] No diamond shapes (they break in raw Excalidraw JSON)
- [ ] All coordinates are positive
- [ ] No overlapping contract rectangles
- [ ] Cluster boundaries fully contain their child elements (with 40px padding)
- [ ] Colors match the palette defined above
- [ ] All contracts from `deps.json.graph` appear in the diagram
- [ ] `strokeStyle` is `"solid"` for inheritance arrows, `"dashed"` for call arrows
- [ ] `roughness: 0`, `elbowed: true`, `roundness: null` on all arrows
- [ ] ERC labels match `erc_eip_usage` data where applicable
- [ ] State variable reference arrows don't duplicate existing external call arrows
- [ ] Contract annotations (if from overview.md) are max one line, no longer than 30 chars

---

## Dashboard Validation

After writing the file:

1. If the dashboard is running (`solaudit dashboard`), the diagram auto-refreshes via the file watcher
2. If not running, tell the user: "Start the dashboard with `solaudit dashboard` and check the Diagram tab"
3. Ask the user if the diagram looks correct

**Common issues to fix on iteration:**
- Text overflowing rectangles → increase rectangle width or decrease fontSize
- Arrows crossing through shapes → adjust layout positions or add intermediate points
- Overlapping labels → increase spacing between elements
- Missing elements → re-check data files for contracts/relationships not included
- Cluster boundary too small → recalculate to encompass all children + padding

Aim for 1-2 visual iteration passes.

---

## Output

Write valid Excalidraw JSON to `<output_dir>/diagram.excalidraw`. The JSON must be parseable by `@excalidraw/excalidraw` v0.17.x (the version used in the dashboard).
