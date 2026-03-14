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
  - `erc_eip_usage`: Detected ERC/EIP standards
- **`external-calls.json`** — External call surface with trust levels
  - `calls`: Array of `{ contract, function, target, method, trust_level: { value: "trusted"|"semi-trusted"|"untrusted"|"external" }, call_type }`
- **`overview.md`** (optional) — AI-generated protocol overview. Extract per-contract purpose descriptions for annotations.
- **`state-vars.json`** — State variable inventory
  - Look for address-type variables (`address`, `IERC20`, `IStrategy`, etc.) referencing other in-scope contracts — these are architectural dependencies that may not appear in `external-calls.json`.

## Step 0: Plan Before Drawing

Before generating any JSON, analyze the data and plan the layout.

1. **Size tier:** Small (1-8) = one pass; Medium (9-20) = one pass, plan carefully; Large (21+) = cluster-by-cluster
2. **Hero contracts:** Top 1-3 by nSLOC or connection count — get larger rectangles
3. **ERC mapping:** From `stats.json.per_contract.inherits`, label contracts like `[ERC-4626]`
4. **Cluster grid:** Assign each cluster to a canvas region. Output plan in a code fence:

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

### Contract fills (by type from `stats.json`)

| Type | Fill | Stroke |
|------|------|--------|
| Core contract | `#dbeafe` | `#3b82f6` |
| Library | `#dcfce7` | `#22c55e` |
| Interface | `#f3f4f6` | `#9ca3af` |
| Abstract contract | `#fef3c7` | `#f59e0b` |

### Other elements

| Element | Fill | Stroke | Notes |
|---------|------|--------|-------|
| Cluster boundary | `#f8fafc` | `#cbd5e1` | `strokeStyle: "dashed"` |
| Role badge (anyone/unrestricted) | `#fee2e2` | `#ef4444` | |
| Role badge (low confidence) | `#fef9c3` | `#eab308` | |
| Role badge (high/medium) | `#dcfce7` | `#22c55e` | |

### Arrow strokes

| Relationship | Color | Style |
|--------------|-------|-------|
| Inheritance | `#6b7280` | solid |
| External call (trusted) | `#3b82f6` | dashed |
| External call (semi-trusted) | `#f59e0b` | dashed |
| External call (untrusted/external) | `#ef4444` | dashed |
| Role → contract | `#9ca3af` | dotted |
| State var reference | `#9ca3af` | dotted, `strokeWidth: 1` |

### Text colors

| Level | Color |
|-------|-------|
| Title / contract name | `#1e1e1e` |
| Subtitle / nSLOC | `#374151` |
| Annotation | `#6b7280` |

---

## Scale Hierarchy

| Tier | Width | Height | When |
|------|-------|--------|------|
| Hero | 240 | 120 | Top 1-3 by nSLOC or connections |
| Primary | 200 | 80 | Standard contracts |
| Secondary | 160 | 60 | Libraries, small utilities |
| Interface | 160 | 50 | Interface contracts |
| Role badge | 100 | 30 | Access control roles |

---

## Layout Algorithm

- Canvas starts at **(100, 100)**, 60px margins. Title at (100, 30), fontSize 28.
- Up to **3 clusters per row**, 400px row spacing, 40px column spacing, 40px padding inside clusters.
- **Inheritance trees:** vertical (base on top). Siblings: horizontal. 60px horizontal gap, 120px vertical gap.
- Interfaces at left edge of cluster, libraries at right edge.
- Role badges 40px below their most-connected contract; multiple badges side by side with 10px gap.
- **Large diagrams (21+):** generate cluster-by-cluster — wrapper + boundaries first, then one cluster at a time, then cross-cluster arrows last.

---

## Element ID Convention

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

Use sequential integer seeds, namespaced by cluster (cluster 1: 100xxx, cluster 2: 200xxx, etc.).

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
6. Cluster/group boundaries go BEFORE contained elements in the array (renders behind)

### Arrow rules

1. Always elbowed: `roughness: 0` + `roundness: null` + `elbowed: true`
2. `points[0]` is always `[0, 0]`; subsequent points are offsets from arrow's `(x, y)`
3. `width`/`height` = bounding box of the `points` array
4. Both source and target shapes must list the arrow in their `boundElements`
5. `startBinding.elementId` / `endBinding.elementId` must reference real element IDs
6. Arrow `(x, y)` = source shape's edge midpoint

### Edge midpoint calculation

| Edge | X | Y |
|------|---|---|
| Top | `x + width/2` | `y` |
| Bottom | `x + width/2` | `y + height` |
| Left | `x` | `y + height/2` |
| Right | `x + width` | `y + height/2` |

### Contract label format

- With ERC + purpose: `"Vault [ERC-4626]\n(342 nSLOC)\nMain deposit/withdrawal entry"`
- With ERC only: `"Vault [ERC-4626]\n(342 nSLOC)"`
- Plain: `"ContractName\n(342 nSLOC)"`

Keep purpose annotations ≤ 30 characters. Use hero height (120px) for 3-line labels.

### State variable reference arrows

For address-type state variables pointing to in-scope contracts, draw thin dotted arrows (`strokeWidth: 1`, `strokeStyle: "dotted"`, `strokeColor: "#9ca3af"`). **Only draw if no external call arrow already exists between the same pair.**

---

## Generation Procedure

1. **Read** all data files (deps, stats, access-control, external-calls, state-vars; optionally overview.md)
2. **Plan** the layout (Step 0). Output the plan in a code fence.
3. **Build the `elements` array** in this order:
   a. Title text element
   b. Cluster boundaries (rendered first = behind everything)
   c. Cluster title text elements
   d. Contract rectangles + labels (in topological order from `deps.json`)
   e. Inheritance arrows
   f. External call arrows (only where both caller and target are in-scope)
   g. State variable reference arrows (only where no external call arrow exists for the same pair)
   h. Role badges + labels + connector arrows
4. **Assemble** the complete JSON:

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

5. **Write** to `<output_dir>/diagram.excalidraw`

---

## Validation Checklist

- [ ] Every shape has `boundElements` listing its text (and connected arrows)
- [ ] Every bound text has `containerId` matching its parent shape's `id`
- [ ] `text` === `originalText` on every text element
- [ ] `fontFamily: 2` everywhere, never `1`
- [ ] `roughness: 0` + `elbowed: true` + `roundness: null` on all arrows
- [ ] Arrow `points[0]` is `[0, 0]`; `width`/`height` match points bounding box
- [ ] Both source and target shapes list each arrow in `boundElements`
- [ ] No diamond shapes
- [ ] No duplicate element IDs
- [ ] All contracts from `deps.json.graph` appear in the diagram

---

## Output

Write valid Excalidraw JSON to `<output_dir>/diagram.excalidraw`. The JSON must be parseable by `@excalidraw/excalidraw` v0.17.x (the version used in the dashboard).

After writing, tell the user to check the Diagram tab in the dashboard (`solaudit dashboard`).
