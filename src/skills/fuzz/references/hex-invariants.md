# Hex invariants and fuzz properties

Hex-only reference (not in upstream fizz). Read by `/fuzz` (Steps 3, 9 and 12), its Synthesizer, `/fuzz-sync` and `/fuzz-convert`.

Always call the CLI as `npx --no-install hex …`. Never `npx hex …`: an unrelated npm package named `hex` exists, and `npx` would download and run it.

## Where the inputs come from

| Input | Command / file | Used for |
|---|---|---|
| Accepted invariants | `npx --no-install hex invariant list --status accepted --json` (saved to `{META_DIR}/hex-invariants.json` in Step 3) | The property list: one property per accepted invariant |
| All invariants | `.hex/model/invariants.json` (`npx --no-install hex invariant list --json`) | Deduplicating proposals, the next free id |
| Protocol model | `.hex/model/protocol.json` (`npx --no-install hex model show [section]`) | Actors, assets, privileges, accounting equations, state machines, risky flows |
| Exact facts | `npx --no-install hex facts query <callers\|callees\|readers\|writers\|layout\|linearization\|entry-points\|reach\|function> [ref]` | Entry points, who writes a variable, storage layout, exact function ids |

An invariant entry:

```json
{
  "id": "INV-003",
  "statement": "The vault's token balance is always at least totalAssets()",
  "kind": "accounting",
  "scope": { "contracts": ["Vault"], "functions": ["Vault.withdraw(uint256,address,address)"] },
  "evidence": [{ "file": "src/Vault.sol", "line_start": 120, "line_end": 134 }],
  "on_chain_enforced": false,
  "status": "accepted",
  "test": { "tool": "fizz", "property_id": "GL-01", "file": "test/fizz/Properties.sol", "status": "passing" },
  "issue_id": "H-012"
}
```

`test` and `issue_id` are optional. `kind` is one of `accounting`, `access`, `bound`, `monotonic`, `state-machine`, `liveness`, `economic`.

## The tag in PROPERTIES.md

`.hex/fuzz/PROPERTIES.md` keeps upstream's line format, with the invariant's id in parentheses right after the bold Spec ID:

```markdown
- [ ] **GL-01** (INV-003) — Solvency: the vault's token balance is always at least `vault.totalAssets()`. (Category: HIGH_LEVEL; Guarantee: SHOULD-HOLD — …; Priority: HIGH; Sources: CON-01)
- [x] **SP-02** (INV-007) — After `vault_deposit`, `vault.totalSupply()` strictly increases. (Category: STATE_TRANSITION; Guarantee: EXPLORATORY; After: `vault_deposit`; Priority: HIGH; Sources: ST-01)
```

Rules:

- Each Spec ID maps to exactly one invariant, and each accepted invariant gets one entry.
- Never put anything between `- [ ] ` and `**GL-NN**`: `fizz_sync.js` and `/fuzz-convert` parse that prefix.
- Anyone who edits a line (implementers flipping `[ ]` → `[x]`, `/fuzz-sync` flipping `[x]` → `[~]`) keeps the `(INV-NNN)` tag as it is.
- An entry without a tag is fuzzed but not tracked in Hex. `hex invariant sync-fuzz` lists it as unmapped.

Record each mapping when the entry is written:

```bash
npx --no-install hex invariant set-test INV-003 --tool fizz --property GL-01 --file test/fizz/Properties.sol --status not_written
```

`--file` is the file that holds the property function: `{SUITE_DIR}/Properties.sol` for both `GL-*` and `SP-*`.

## Proposing an invariant

Discovery agents find properties the auditor did not accept. Those are **proposals**. They are never fuzzed in the current run and never written to `PROPERTIES.md` or `property-plan.md`. They go to the auditor as proposed Hex invariants:

1. Read the whole `.hex/model/invariants.json`: `{ "updated_at": "…", "invariants": [ … ] }`. If it does not exist, start from `{ "updated_at": "", "invariants": [] }`.
2. Skip a candidate that restates an existing invariant of any status, rejected ones included (the auditor already ruled on those).
3. Give each new entry the next free id: the highest `INV-NNN` number in the file plus one, zero-padded to three digits (`INV-014`), counting up for each further entry.
4. Fill the entry:
   - `statement`: one sentence, a property of the protocol and not of the harness ("users can always withdraw their full balance when not paused", not "property_x returns true").
   - `kind`: map from fizz's discovery. Conservation and sum-of-parts are `accounting`. Bounds and rounding direction are `bound`. Monotonicity is `monotonic`. State validity and state transitions are `state-machine`. DoS, "can always withdraw" and liveness are `liveness`. Value extraction and profit are `economic`. Who may call what is `access`.
   - `scope.contracts`: contract names. `scope.functions`: exact facts function ids (`Contract.fn(type,…)`, from `npx --no-install hex facts query function <name>`), or `[]` when unsure. A wrong id fails validation.
   - `evidence`: `[{ "file": "src/…", "line_start": N, "line_end": M }]`, project-relative, pointing at the code that makes the property matter.
   - `on_chain_enforced`: `true` only if a `require`/`assert`/`revert` in the code enforces it.
   - `status`: `"proposed"`. Never `accepted`: only the auditor accepts.
   - `rationale`: `"Proposed by /fuzz (<discovery source ids>): <why it should hold, or the doc/identity behind it>"`.
5. Append the entries and write the whole file back. Keep every existing entry as it was and set `updated_at` to the current ISO time.
6. Run `npx --no-install hex model validate` and fix what it reports.

The auditor reviews proposals with `npx --no-install hex invariant list --status proposed` (or on the dashboard's Model page) and accepts with `npx --no-install hex invariant accept INV-014 …`. `/fuzz-convert` then adds properties for the newly accepted ones.

## After every campaign: `hex invariant sync-fuzz`

```bash
cd {PROJECT_ROOT} && npx --no-install hex invariant sync-fuzz
```

It reads:

- `.hex/fuzz/PROPERTIES.md`: Spec IDs, checkboxes and `(INV-NNN)` tags. An invariant whose `test.property_id` names the Spec ID is matched too.
- The `/// @notice GL-NN:` doctags under the suite (`test/fizz/Properties.sol`, `test/fizz/handlers/*.sol`) to find each property's function. It takes the suite dir from `{META_DIR}/last-run.json` when that file exists.
- The latest campaign logs: `{META_DIR}/corpus_medusa/medusa-run.log` (`run_medusa.js`), the newest file in `{META_DIR}/logs_medusa/` (a bare `medusa fuzz`), and `{META_DIR}/corpus_echidna/echidna-run.log` (`run_echidna.js`). Newer logs win.
- `test_repro_<propertyFunction>` tests in `test/fizz/FoundryTester.sol`. A repro whose body still holds the `TODO: manual repro needed` marker does not count.

It sets each mapped invariant's `test` (`tool: fizz`, `property_id`, `file`, `status`, `runs`, `last_run_at`, `repro_file`):

| Status | When |
|---|---|
| `failing` | A repro exists, or the property's own test failed in the latest log that ran it |
| `broken` | `[~]` (quarantined by `/fuzz-sync`), `[x]` with no tagged function, a quarantined function body, or the fuzzer could not evaluate it |
| `passing` | `[x]`, it ran (its own test, or for `SP-*` the handlers that call it), and nothing failed |
| `not_written` | `[ ]` or `[-]` |

For each `failing` invariant that has a repro and no `issue_id`, it opens a High card (`Invariant broken: <statement>`, source `invariant`) and links it. It does not do this for rejected invariants. Running it again opens no duplicate cards.

When an `SP-*` property's handler failed but no repro names the property, it reports the violation as **unattributed** and leaves the status unchanged, because several assertions can share a handler. Write `test_repro_<property>` to attribute it. Pass `--json` for the full summary.
