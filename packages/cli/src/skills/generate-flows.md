# Skill: Generate Flow Charts

**Recommended model:** Opus

## Context Assembly

Run: `npx solaudit context` to get the full codebase.

Read these files from the output directory:
- `access-control.json` — role → function mapping
- `external-calls.json` — external call surface
- `state-vars.json` — state variable inventory
- `stats.json` — contract overview

## Task

Create Excalidraw flow charts for every significant flow in the protocol.

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

- Start with the entry point (external function call)
- Trace through all internal calls, state changes, and external calls
- End at the exit point (return, transfer, or revert)
- Mark where value (tokens/ETH) enters or leaves the system with a red border
- Mark where important state variables are modified with a yellow highlight
- Show revert conditions as red diamond decision nodes

### Layout

Use swim lanes to separate contracts:
- Each contract gets a vertical column
- Function calls between contracts are horizontal arrows
- State changes are annotated inline
- External calls (to out-of-scope contracts) go to a separate "External" lane

### Visual Conventions

| Element | Shape | Color |
|---------|-------|-------|
| Entry point (external function) | Rounded rectangle | Green fill (#dcfce7) |
| Internal function call | Rectangle | White fill |
| State change | Rectangle with dashed border | Yellow fill (#fef9c3) |
| External call | Rectangle with bold border | Red fill (#fee2e2) |
| Decision / require | Diamond | White fill |
| Value transfer | Arrow with "$" label | Red stroke |
| Return / revert | Rounded rectangle | Gray fill |

## Output

Write valid Excalidraw JSON to `<output_dir>/flows.excalidraw`.

The JSON format follows the same schema as `generate-diagram.md`. Use the swim lane layout:
- Y-axis: flow progression (top to bottom)
- X-axis: contract separation (left to right)
- Group related flows vertically with section headers
