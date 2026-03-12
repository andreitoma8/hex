# Skill: Generate System Diagram

**Recommended model:** Sonnet

## Context Assembly

Read these files from the output directory:
- `deps.json` — contract relationships, clusters, inheritance
- `access-control.json` — roles and function access
- `stats.json` — contract types, nSLOC, inheritance

## Task

Generate an Excalidraw JSON file that visualizes the system architecture.

### Elements to Include

1. **Contracts** — Rectangle for each contract
   - Blue fill (`#dbeafe`) for core contracts
   - Green fill (`#dcfce7`) for libraries
   - Gray fill (`#f3f4f6`) for interfaces
   - Include contract name and nSLOC count as text

2. **Inheritance** — Solid arrows (child → parent)
   - Arrow type: `arrow`
   - Stroke style: solid
   - Label: "inherits"

3. **External calls** — Dashed arrows (caller → callee)
   - Arrow type: `arrow`
   - Stroke style: dashed
   - Label: method name if available

4. **Roles** — Small rounded rectangles connected to functions
   - Red fill for "anyone" role
   - Yellow fill for low-confidence roles
   - Green fill for high-confidence roles

5. **Clusters** — Group related contracts visually using the cluster data from `deps.json`

### Layout Strategy
- Place clusters in separate areas
- Within a cluster, arrange inheritance trees vertically (base at top, derived below)
- Place interfaces on the left, libraries on the right
- Roles as small badges near their functions

## Excalidraw JSON Format

The output must be valid Excalidraw JSON with this structure:

```json
{
  "type": "excalidraw",
  "version": 2,
  "source": "solaudit",
  "elements": [
    {
      "type": "rectangle",
      "id": "<unique-id>",
      "x": 0, "y": 0,
      "width": 200, "height": 80,
      "strokeColor": "#1e1e1e",
      "backgroundColor": "#dbeafe",
      "fillStyle": "solid",
      "roundness": { "type": 3 }
    },
    {
      "type": "text",
      "id": "<unique-id>",
      "x": 10, "y": 10,
      "text": "ContractName\n(342 nSLOC)",
      "fontSize": 16,
      "fontFamily": 1
    },
    {
      "type": "arrow",
      "id": "<unique-id>",
      "x": 100, "y": 80,
      "width": 0, "height": 50,
      "startBinding": { "elementId": "<source-id>", "focus": 0, "gap": 1 },
      "endBinding": { "elementId": "<target-id>", "focus": 0, "gap": 1 },
      "strokeStyle": "solid"
    }
  ],
  "appState": {
    "viewBackgroundColor": "#ffffff",
    "gridSize": null
  }
}
```

### Element ID Convention
- Contracts: `contract-<name>`
- Texts: `text-<name>`
- Arrows: `arrow-<source>-<target>`
- Roles: `role-<name>`

## Output

Write valid Excalidraw JSON to `<output_dir>/diagram.excalidraw`.
