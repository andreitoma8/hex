# Hex Demo Guide

Step-by-step demo of Hex's audit workflow using Claude Code.

## Setup

1. Pick any Foundry project with Solidity contracts. If you don't have one handy:

   ```bash
   git clone https://github.com/transmissions11/solmate.git
   cd solmate
   ```

2. Install skills (works before init — no config required):

   ```bash
   hex claude
   ```

3. Open Claude Code:
   ```bash
   claude
   ```

## Demo flow (all inside Claude Code)

### Phase 1 — One-shot pre-review (`/init-audit`)

Switch your Claude Code model to **Opus** for this one — it does all of the reasoning-heavy pre-review work in a single skill.

```
/init-audit
```

It asks for scope, commit, chain, and docs URL. For solmate something like `--scope "src/**/*.sol"` works. Then the skill runs end-to-end:

1. **Dependency safety audit** — checks `package.json` install hooks, Foundry `lib/` submodules, `foundry.toml` (FFI, fs_permissions, remappings), plaintext secrets in `.env*`, suspicious VS Code extensions. Stops before compilation if anything looks risky.
2. **`hex init` + `hex analyze`** — runs the seven deterministic analyses (stats, deps, access, state, calls, patterns, constraints) in parallel, plus surface last. Slither and forge flatten results are cached across commands.
3. **Protocol overview** — writes a 2-3 paragraph `overview.md` (key contracts table, external deps, architecture notes).
4. **System diagram** — `.hex/diagrams/diagram.mmd` Mermaid architecture with trust zones and semantic symbols. Split into multiple files if >15 nodes.
5. **Flow charts** — `.hex/diagrams/flow-*.mmd` per archetype (deposit/withdraw, governance, liquidation, etc.) with distinct shapes per node role and explicit success+revert branches on every decision.
6. **Spec conformance** — cross-references docs, NatSpec, interfaces, and ERC/EIPs (fetches canonical specs from `eips.ethereum.org`). Writes `spec-conformance.json`.
7. **Materialize conformance items to the board** — every DEVIATES/PARTIAL spec item becomes a Potential card in `tracking.json` (source `conformance`).

If anything fails, `hex doctor` prints a labelled preflight table (node, forge, slither, solc, Claude Code, output dir, `.hex/config.json`) with one-line install hints.

### Dashboard opens automatically

The last step of `/init-audit` launches `hex dashboard` in the background, so `http://localhost:3000` opens in your browser when the pipeline finishes. Live-refreshes on every `.hex/` change. If you ever need to start it manually, run `hex dashboard` in a second terminal.

Key pages:

- `/progress` — Weighted progress bar (70% nSLOC reviewed, 20% audit steps, 10% findings triage), contract review checklist.
- `/stats` — KPI cards, ERC badges, per-contract metrics, coverage, dependencies.
- `/access` — Role → function matrix with "Show unprotected only" and "Show inferred / unknown modifiers" toggles.
- `/state` — State variable inventory with reader/writer tracking and storage-collision warnings.
- `/calls` — External call surface with filterable Trust column.
- `/functions` — Aggregated function view.
- `/diagram` and `/flows` — Full-bleed Mermaid canvas with auto-fit zoom and legend overlay.
- `/conformance` — Conformance check results, deviations first, clickable spec links.
- `/issues` — **The board.** Five columns: Potential / Verified / Synced / Invalid / Duplicate. Uniform `H-NNN` ids with a source badge. Drag cards between the editable columns; click to edit, or copy as HackMD. The **Synced** column is reached only via `/sync-issues` and is read-only (edit on GitHub).
- `/overleaf` — The four LaTeX report sections from `/generate-overleaf`, each with a copy button. Only populated after you run the skill.

### Phase 2 — Manual review + `/write-finding`

Read the code in your editor. Leave `// @audit-issue ...` comments above anything suspicious.

When you have something concrete, point Claude at it:

```
/write-finding for the rounding error in src/Vault.sol
```

`/write-finding` records the finding to `findings.json` and adds a tracking entry with status `pending_validation` and source `manual` — it shows up on the **Potential** column of the board. (No more "born verified" findings — every issue is validated explicitly.)

### Phase 3 — Validate, ingest AI, sync GitHub

#### `/validate-issue` for any potential issue

`/validate-issue` is source-agnostic. Pass a uniform id (`H-003`) or a free-text reference:

```
/validate-issue H-003
/validate-issue for the rounding issue
```

To validate the whole Potential backlog in one interactive pass, run `/validate-all-findings`.

Claude traces the attack path in the code, writes a validation memo (always), and asks per-issue whether you want a PoC or memo-only. On valid → tracking entry promotes to `verified` and the card moves to Verified on the board. On invalid → tracking entry becomes `rejected` and the card moves to Invalid.

#### `/ingest-aa-report` — Nethermind AuditAgent only

Hex only integrates with **AuditAgent** (Nethermind's cloud scanner). You start a scan separately (Nethermind portal or `aa scan ...`) and paste the scan ID into Hex:

```
/ingest-aa-report <scan-id>
```

The skill checks status via `aa scan --status`. If the scan is still running it prints a status line and exits — you come back later. Run `hex ai-status --watch` in another terminal to be notified when the scan finishes.

When complete, the skill fetches findings, materializes them as Potential cards (`source: "auditagent"`), and runs **inline dedup** against existing entries. Auditagent findings that match a manual or conformance issue are flipped to `duplicate` and surface in the Duplicate column with `match_signals` (contract / function / root_cause / attack_vector).

#### `/sync-issues` — team mode via GitHub Issues

If a repo is configured (`hex init --github-repo <owner/repo>`, or `settings.github.repo`) and `gh auth login` has been run:

```
/sync-issues
```

GitHub is the source of truth; **identity is the issue number `#N`** (no hidden footer). One run does both directions:

- **Pulls every issue** in the repo (no label filter). Title + the five-field body are parsed back into the local finding; issues already linked by `#N` are refreshed, new ones become local findings. All land in the **Synced** column (read-only).
- **Pushes** verified findings not yet on GitHub. Body is exactly the five fields (no labels, no footer). The returned `#N` is stored, locking the card into Synced.

Once synced, edit on GitHub and re-run `/sync-issues` to pull changes back. GitHub-sync state shows as a chip on each verified/synced card.

### Phase 4 — Final deliverable (`/generate-overleaf`)

```
/generate-overleaf
```

Writes four `.txt` LaTeX section files to `.hex/overleaf/`:

1. `executive_summary.txt` — `\section{Executive Summary}` with project synopsis, severity histogram, status histogram, summary table.
2. `audited_files.txt` — `\section{Audited Files}` table of in-scope files (LoC, comments, ratio, blank, total).
3. `summary_of_findings.txt` — `\section{Summary of Issues}` table linking to per-finding subsections.
4. `findings.txt` — `\section{Issues}` with one `\subsection{[Sev] title}\label{issue:N}` per verified finding (description, code blocks via minted, recommendation, status, client update).

The skill prompts once for any missing report metadata (initial/final commit, dates, doc/test assessment) and persists them under `settings.report.*` so reruns don't re-prompt. Read the four sections on the dashboard's `/overleaf` page and copy each into your Nethermind Overleaf template's matching slot (or grab the files directly from `.hex/overleaf/`).

Only `verified` findings make the cut. Duplicates, rejected, and pending entries are skipped.

## Key points

- `/init-audit` is now a single skill that runs everything pre-manual-review.
- The board (`/issues`) is the only findings page. Cards are interactive: drag to change column, click to edit.
- `/write-finding` records Potential issues (uniform `H-NNN` ids, no in-code comments) — promote via `/validate-issue`, `/validate-all-findings`, or by dragging on the board.
- `/ingest-aa-report` takes a scan ID, never starts a scan.
- `/sync-issues` treats GitHub as the source of truth — synced issues are read-only in Hex and identified by issue number; `/generate-overleaf` reports only from synced issues.
- `/generate-overleaf` is the final handoff to the LaTeX report.
- `hex update` upgrades the package and prompts to re-sync skills in one shot; `hex update-skills` re-syncs skills only.
