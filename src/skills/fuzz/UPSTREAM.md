# Upstream

`/fuzz`, `/fuzz-sync` and `/fuzz-convert` are a fork of **pashov's `fizz` skill** (`VERSION` 1):

- Repository: https://github.com/pashov/skills (`fizz/`)
- Commit: `c577eb7799c349de0acb187ba00ca98e14e436fd` (2026-07-09, "fizz: remove shipped self-test and de-hardcode eval paths (#39)")
- License: MIT (see `LICENSE` in this directory, copied from the upstream repository root at that commit)

The pipeline, the 5 discovery agents, the Synthesizer, the 2 implementers, the report writer, the references, the Solidity templates and the scripts are upstream's work. Hex keeps them as close to upstream's wording as possible. To merge a future upstream release, re-apply the changes below.

## Layout

| Upstream | Hex |
|---|---|
| `fizz/SKILL.md`, `agents/`, `references/`, `scripts/`, `templates/` | `src/skills/fuzz/` |
| `fizz/skills/fizz-sync/SKILL.md` | `src/skills/fuzz-sync/SKILL.md` (top level: Claude Code only discovers top-level skills) |
| `fizz/skills/fizz-convert/SKILL.md` | `src/skills/fuzz-convert/SKILL.md` |
| `fizz/README.md`, `fizz/VERSION`, `fizz/evals/` | not shipped (Hex ships the skill inside `hex-audit`; update with `npx --no-install hex update`) |

Where things land in an audited project:

| Upstream | Hex |
|---|---|
| `PROPERTIES.md` (project root) | `.hex/fuzz/PROPERTIES.md` |
| `fizz_data/` (ABIs, selection, property plan, corpora, logs, `report.md`, `last-run.json`) | `.hex/fuzz/fizz_data/` |
| `test/fizz/` (the Solidity suite) | unchanged: it must compile with the project |
| `echidna.yaml`, `medusa.json` (project root) | unchanged |

## Hex changes

### Mechanical

Re-apply with sed after pulling a new upstream version. Apply to the markdown files: the three `SKILL.md` files, `agents/` and `references/`.

| Upstream | Hex |
|---|---|
| `{PROJECT_ROOT}/PROPERTIES.md` | `{PROJECT_ROOT}/.hex/fuzz/PROPERTIES.md` |
| `` `PROPERTIES.md` (project root) `` | `` `.hex/fuzz/PROPERTIES.md` `` |
| `/fizz-sync`, `fizz-sync` | `/fuzz-sync`, `fuzz-sync` |
| `/fizz-convert`, `fizz-convert` | `/fuzz-convert`, `fuzz-convert` |
| `` `fizz` skill ``, `the Fizz skill`, `**Fizz** skill`, `Fizz skill's`, `Fizz harness`, `Fizz pipeline` | `` `fuzz` skill ``, `the fuzz skill`, `**fuzz** skill`, `fuzz skill's`, `fuzz harness`, `fuzz pipeline` |
| ``run `fizz` first``, ``last `fizz` run``, ``since `fizz` last ran``, ``re-run `fizz` Step 7``, ``main `fizz` skill`` | the same with `` `/fuzz` `` (or `` `fuzz` skill ``) |
| `{SKILL_PATH}/../../scripts/` (sub-skills) | `{FUZZ_SKILL_PATH}/scripts/` |

In the scripts, the default meta dir changes from `let metaRelDir = 'fizz_data';` to `'.hex/fuzz/fizz_data'`, and the usage comments follow. This applies to `extract_abis.js`, `select_functions.js`, `estimate_cost.js`, `generate_suite.js`, `generate_handlers.js`, `run_medusa.js`, `run_echidna.js` and `fizz_sync.js` (`metaRelDir:` in its options object).

`templates/` is unchanged. `medusa.json`, `echidna.yaml` and `README.md` keep upstream's `fizz_data` placeholder, and `generate_suite.js` rewrites it to the meta dir. The script's `!== 'fizz_data'` checks compare against that placeholder, not the default, so they stay; a comment there says so.

### By hand

- `scripts/fizz_sync.js`: `propertiesMdPath` is `.hex/fuzz/PROPERTIES.md`, and the `--init` hint compares against the new default meta dir.
- `scripts/estimate_cost.js`: the two strings that mention x-ray name the Hex protocol model instead.
- `SKILL.md`:
  - `name: fuzz`, a Hex description, and a "Hex fork" note. A one-line Hex banner replaces the PASHOV SKILLS ASCII art.
  - Workflow rules: files go under `.hex/fuzz/`, and the CLI is always `npx --no-install hex` (an unrelated npm package named `hex` exists).
  - Parameters:
    - `PROJECT_ROOT` is the directory that holds `.hex/`.
    - `SKILL_PATH` comes from Claude Code's `Base directory for this skill`. The fallback is a Glob of exactly `.claude/skills/fuzz/SKILL.md`, never a broad `**/` Glob that could match an installed upstream fizz.
    - `META_DIR` is `.hex/fuzz/fizz_data`.
  - Step 1:
    - New item 0 stops early when no invariant is accepted.
    - The missing-tool messages are actionable: exact install commands for Foundry, Medusa and Echidna, the `crytic-compile`/Slither prerequisites, and "re-run `/fuzz`". The skill never installs anything.
  - Step 3: upstream's **x-ray Acquisition Protocol** is removed. That covers the `Skill('x-ray')` invocation, the `git clone` of pashov/skills into `~/.claude/skills`, and the `/tmp/x-ray-attempts.md` gate. "Hex inputs" replaces it:
    - Accepted invariants come from `npx --no-install hex invariant list --status accepted --json` and are saved to `{META_DIR}/hex-invariants.json`. If there are none, the skill stops and tells the auditor to accept some.
    - `.hex/model/protocol.json` is the primary source, with a section-by-section guide.
    - Exact facts come from `npx --no-install hex facts query …`.
    - The Protocol Analyzer fallback runs only when `protocol.json` is missing.
  - Step 4: the preselection comes from `hex facts query entry-points` / `callers` and the model's `actors` / `privileges`, not the x-ray entry-point map.
  - Step 9a:
    - `INVARIANT_CONTEXT` opens with an "Accepted invariants (the property list)" block. Discovery agents tag checks with `INV-NNN`, and everything else they find is a candidate.
    - The model's accounting, state machine and risky flow sections replace x-ray's notes.
    - Facts `layout` / `writers` help find aggregate variables.
  - Step 9c:
    - The Synthesizer also gets `{SKILL_PATH}`.
    - A "Hex mapping" block checks one tagged entry per accepted invariant, records each with `hex invariant set-test … --tool fizz --property GL-NN --file {SUITE_DIR}/Properties.sol --status not_written`, and runs `hex model validate` after proposals.
    - The summary counts the proposed invariants, and the guided pause keeps the tags.
  - Step 10: violations name their `INV-NNN`; the sync runs right after the campaign; Campaign Iteration writes repros and syncs again.
  - Step 11: `test_repro_<propertyFunction>` must use the property function's exact name, which is how the sync attributes violations.
  - New **Step 12**: `npx --no-install hex invariant sync-fuzz`, and what to tell the auditor.
- `agents/invariant-discovery/synthesizer.md`:
  - Reads `hex-invariants.json` and `references/hex-invariants.md`.
  - New Step 0: accepted invariants are the property list, one property each, tagged `(INV-NNN)`. An infeasible one is still written, as `[-]`. Every other discovery property is appended to `.hex/model/invariants.json` as `status: "proposed"` and is not fuzzed. Upstream's non-mergeable and `[MANDATORY]` properties become standalone proposals.
  - The PROPERTIES.md entry description, header note and example lines carry the tag, and the return line reports proposals.
- `agents/protocol-analyzer.md`: it is spawned when the Hex model is missing, not when x-ray is. It reads the accepted invariants and uses facts queries.
- `agents/report-writer.md`: takes the project name from `.hex/config.json` / `protocol.json` when `protocol-understanding.md` is absent. A violation names its Spec ID and `INV-NNN`.
- `agents/implementers/*.md`: one sentence: keep the `(INV-NNN)` tag when flipping a checkbox.
- `references/template-map.md`: `.hex/fuzz/` paths, rows for `hex-invariants.json` and `PROPERTIES.md`, and the Hex model instead of x-ray.
- New: `references/hex-invariants.md`, covering:
  - the inputs
  - the `(INV-NNN)` tag rule
  - `set-test`
  - how to propose an invariant: read, append, write `invariants.json`, next free `INV-NNN`, field rules
  - what `sync-fuzz` reads and decides
- `fuzz-sync/SKILL.md`:
  - A Hex description and fork note.
  - The `META_DIR` default, and where `PROPERTIES.md` lives.
  - `FUZZ_SKILL_PATH`: the base directory, then `../fuzz`. The fallback is a Glob of exactly `.claude/skills/fuzz/scripts/<script>.js`.
  - The `(INV-NNN)` tag stays on `[~]` lines.
  - Step 8 runs `hex invariant sync-fuzz` after an applied sync.
- `fuzz-convert/SKILL.md`:
  - A Hex description and fork note, and the parameters (`META_DIR`, `PROPERTIES.md`, `FUZZ_SKILL_PATH`, `npx --no-install hex`).
  - New STEP 0 adds entries and `set-test` mappings for invariants accepted after `/fuzz` ran, and proposes hand-written untagged entries as invariants.
  - The format shows the tag, and the template map is read from `{FUZZ_SKILL_PATH}`.
  - The summary lists `INV-NNN`s and how to run a campaign and sync.

Untouched: the five discovery agents, `references/` other than `template-map.md`, `templates/`, `scripts/lib/log-viewer.js`, `ensure_foundry.sh`, `setup_fuzz_profile.sh`, and the logic of every script.

## Coupled Hex code

`src/core/fuzz-sync.ts` (`npx --no-install hex invariant sync-fuzz`) parses these upstream formats:

- the PROPERTIES.md line (`- [x] **GL-01** …`) and its checkbox states `[ ]` / `[x]` / `[~]` / `[-]`
- the `/// @notice GL-NN:` doctag
- `test_repro_<property>` and the `TODO: manual repro needed` placeholder in `FoundryTester.sol`
- `suiteDir` in `last-run.json`
- the log paths written by `run_medusa.js` / `run_echidna.js` and Medusa's `logDirectory`
- Medusa's `[PASSED]`/`[FAILED] … Test:` lines and Echidna's text output

If a new upstream release changes any of these, update `fuzz-sync.ts` and its fixtures in `fuzz-sync.test.ts` too.
