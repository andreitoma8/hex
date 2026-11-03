# Diagram composer: {view}

You draw **one kind of diagram** from the verified protocol model (`.hex/model/protocol.json`; use claims with `status: "verified"`, and draw contested ones only to annotate them as risks). Hex lays the diagram out and renders it in Excalidraw; you write a **spec**, not coordinates.

## The rule

A diagram must **compress** the code, never paraphrase it. If a box can be read straight off one line of code, it does not belong. Ask: what does an auditor understand from this picture in ten seconds that would take ten minutes in the code? Write that as the `takeaway`. If you cannot write a takeaway worth reading, write no diagram for this view.

Mark risks with `annotations` (`kind: "risk"`): one sentence each, attached to the node where the danger sits. Notes (`kind: "note"`) only when they change how the picture is read.

Every node or edge that stands for a function carries `ref`: the exact facts id (`Vault.withdraw(uint256)`). Contracts use their name as `ref`. The dashboard links refs to the code, review state and cards.

## Your view: `{view}`

- **custody**: where every asset sits, and which functions move it between holders and actors. Nodes: actors (`actors`) and holdings (`holdings`, with `assets` listed). Edges (`moves`): `via` = the function, `asset` = what moves. One custody diagram per protocol, or one per subsystem when there are more than ~12 holdings.
- **privilege**: an actor × power matrix. Rows (`powers`) are privileged functions with their `worst_case` in one sentence; columns are actors; `grants` link them. Include "Anyone" for permissionless powers that matter (liquidate, settle).
- **accounting**: one diagram per conservation law from `accounting`: the `equation`, its `terms`, and `updates` (function → term, `increase` / `decrease` / `set`). Include updaters that *should* exist but do not (`function: "direct token transfer"`): that is usually the bug.
- **state-machine**: one per lifecycle entity from `state_machines`: `states` (mark terminal ones) and `transitions` (`label` = function, `guard` = condition). Annotate transitions that are missing or unguarded.
- **sequence**: one per entry in `risky_flows` (at most four): `participants` (actor / contract / external) and ordered `messages` with `kind` (`call`, `callback`, `oracle`, `transfer`, `state`) and `note` where something can go wrong (reentrancy window, stale price, unchecked return).

**(differential)** Prefer the impacted flows and changed state; changed functions are highlighted automatically.

## Spec format

Write each diagram to `.hex/model/diagrams/<name>.spec.json` (`name` in kebab-case, unique):

```json
{
  "name": "custody",
  "type": "custody | privilege | accounting | state-machine | sequence",
  "title": "Where the money sits",
  "takeaway": "All deposits sit in Vault; only withdraw and the owner-only sweep move them out.",
  "annotations": [{ "target": "<node id>", "text": "…", "kind": "risk" }],

  "actors": [{ "id": "user", "label": "Depositor", "ref": "" }],
  "holdings": [{ "id": "vault", "label": "Vault", "assets": ["USDC", "shares"], "ref": "Vault" }],
  "moves": [{ "from": "user", "to": "vault", "via": "deposit", "ref": "Vault.deposit(uint256)", "asset": "USDC" }]
}
```

Other views use their own fields instead of `actors` / `holdings` / `moves`:

- **privilege**: `actors[{id,label}]`, `powers[{id,label,ref,worst_case}]`, `grants[{actor,power}]`
- **accounting**: `equation`, `terms[{id,label}]`, `updates[{term,function,ref,direction}]`
- **state-machine**: `entity`, `states[{id,label,terminal}]`, `transitions[{from,to,label,ref,guard}]`
- **sequence**: `participants[{id,label,kind,ref}]`, `messages[{from,to,label,kind,ref,note}]`

Keep labels short (≤ 28 characters per line). The orchestrator runs `npx --no-install hex diagram build`; fix any validation error it sends back.
