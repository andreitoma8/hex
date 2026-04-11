---
description: "Orchestrate all configured AI audit tools with preflight checks and result normalization"
---

# Skill: Run AI Analysis

**Recommended model:** Opus

## Context Assembly

Read these files from the output directory:
- `config.json` — project config including `settings.ai_tools` array
- `tracking.json` — current tracking state (if exists)
- `findings.json` — existing findings (if exists)

## Task

### Phase 0 — Tool Selection

1. Read `config.json` → `settings.ai_tools` for the list of AI tools.
   - **If `ai_tools` is missing** (pre-v0.2.0 config): use these defaults and offer to write them into `config.json`:
     ```json
     [
       { "name": "solidity-auditor", "type": "skill", "invocation": "/solidity-auditor deep", "install_url": "https://github.com/pashov/skills", "install_type": "skill-file", "skill_path": "solidity-auditor", "output_format": "markdown", "enabled": true, "long_running": false, "description": "Pashov solidity-auditor Claude Code skill" },
       { "name": "sc-auditor", "type": "skill", "invocation": "/security-auditor src/", "install_url": "https://github.com/Archethect/sc-auditor", "install_type": "mcp-server", "output_format": "markdown", "enabled": true, "long_running": false, "requires_env": ["SOLODIT_API_KEY"], "dependencies": [{ "binary": "slither", "install_cmd": "pip install slither-analyzer", "required": false }, { "binary": "aderyn", "install_cmd": "cargo install aderyn", "required": false }, { "binary": "forge", "install_cmd": "curl -L https://foundry.paradigm.xyz | bash && foundryup", "required": false }], "description": "Archethect sc-auditor MCP server with Solodit integration" },
       { "name": "plamen", "type": "skill", "invocation": "/plamen core", "install_type": "manual", "output_format": "markdown", "enabled": true, "long_running": true, "dependencies": [{ "binary": "python3", "install_cmd": "Install Python 3.11-3.12 from https://python.org", "required": true }], "description": "Plamen autonomous security auditor — multi-agent analysis across 8 audit phases" },
       { "name": "auditagent", "type": "cli", "invocation": "aa scan", "install_url": "https://github.com/NethermindEth/auditagent-cli", "install_type": "manual", "output_format": "markdown", "enabled": true, "long_running": true, "requires_env": ["AUDIT_AGENT_API_KEY"], "dependencies": [{ "binary": "aa", "install_cmd": "pip install git+https://github.com/NethermindEth/auditagent-cli.git", "required": true }], "description": "Nethermind auditagent — cloud-based AI security scanner (async, 30-60 min)" }
     ]
     ```
   - **If `ai_tools` exists**: check for missing default tools. Compare tool names in config against the built-in defaults above. For any default tool NOT present in config by name, append it with `enabled: true`. If new tools were added, print: "Added N new default tool(s) to your config: <names>" and persist the updated list to `config.json`.
   - **Legacy cleanup**: if `ai_tools` contains an entry named `auditagent` with a stale schema (no `install_type` field, or `type` is `"skill"` instead of `"cli"`), remove it and let the default-sync logic re-add the current version. Print: "Upgraded auditagent config entry to latest schema".

2. Use the **AskUserQuestion** tool to ask which tools to run. List each tool with a checkbox-style selection prompt. Example question:
   ```
   Which AI tools do you want to run?

   [ ] solidity-auditor — Pashov solidity-auditor Claude Code skill
   [ ] sc-auditor — Archethect sc-auditor MCP server with Solodit integration
   [ ] plamen — Plamen autonomous security auditor (deploys 25-45 agents in core mode)
   [ ] auditagent — Nethermind cloud AI scanner (async: triggers scan, collect results on next run)

   Reply with the tool names you want to run (comma-separated), or "all" to run everything.
   ```

3. Mark tools the user did NOT select as `enabled: false` for this run only (do not persist to config.json).

4. Only proceed to Phase A for the tools the user selected.

**Important:** Always use **AskUserQuestion** when you need user input — never just print a question as text and move on.

### Phase A — Preflight: dependency & environment checks

1. Create `ai-results/<tool>/` subdirectories for each selected tool if they don't exist.

2. For each selected tool, run a preflight check based on its `install_type`:

   #### `install_type: "skill-file"` (e.g. solidity-auditor)

   Check if `.claude/skills/<tool-name>/SKILL.md` exists. If missing and the tool has an `install_url`:
   ```bash
   git clone <install_url> /tmp/<tool-name>-install
   mkdir -p .claude/skills/<tool-name>
   cp /tmp/<tool-name>-install/<skill_path>/SKILL.md .claude/skills/<tool-name>/SKILL.md
   rm -rf /tmp/<tool-name>-install
   ```
   - `skill_path` is the subdirectory within the repo containing the SKILL.md file (e.g. `solidity-auditor` for pashov/skills)
   - If auto-install fails, fall back to printing manual install instructions

   #### `install_type: "mcp-server"` (e.g. sc-auditor)

   Check if `.claude/tools/<tool-name>/` exists and is built. If missing and the tool has an `install_url`:
   ```bash
   git clone <install_url> .claude/tools/<tool-name>
   cd .claude/tools/<tool-name> && npm install && npm run build
   ```
   Then register the MCP server in the project's `.mcp.json` (create or merge):
   ```json
   {
     "mcpServers": {
       "<tool-name>": {
         "type": "stdio",
         "command": "node",
         "args": [".claude/tools/<tool-name>/dist/mcp/main.js"]
       }
     }
   }
   ```
   - Requires Node.js >= 22. Check `node --version` before attempting install
   - If `.mcp.json` already exists, merge the new server entry (don't overwrite existing servers)
   - If auto-install fails, fall back to printing manual install instructions

   #### `install_type: "manual"` (e.g. plamen)

   **plamen:** Check if Plamen is installed, and auto-install if missing.
   The interactive installer (`plamen.py install`) uses InquirerPy menus that require a TTY — it cannot run in Claude Code's bash. Instead, replicate the install manually by copying files.

   1. Check if `~/.plamen/` directory exists (repo cloned) AND `~/.claude/commands/plamen.md` exists (files copied)
   2. If **both exist**: Plamen is installed — proceed
   3. If `~/.plamen/` **is missing**: use **AskUserQuestion** to ask if the user wants to install. If yes:
      ```bash
      git clone https://github.com/PlamenTSV/plamen.git ~/.plamen
      cd ~/.plamen && git submodule update --init --recursive
      ```
      Then continue to step 4.
   4. If `~/.claude/commands/plamen.md` **is missing** (repo exists but files not copied): copy plamen files into `~/.claude/`:
      ```bash
      # Detect Python: use python3 if available, fall back to python (Windows Store stub for python3 returns exit 49)
      python3 --version 2>/dev/null && PY=python3 || PY=python
      $PY -m pip install -r ~/.plamen/requirements.txt

      # Agent definitions
      mkdir -p ~/.claude/agents
      cp ~/.plamen/agents/*.md ~/.claude/agents/

      # Agent skills (directory tree)
      cp -r ~/.plamen/agents/skills ~/.claude/agents/skills

      # Slash command
      mkdir -p ~/.claude/commands
      cp ~/.plamen/commands/plamen.md ~/.claude/commands/plamen.md

      # Rules
      mkdir -p ~/.claude/rules
      cp ~/.plamen/rules/*.md ~/.claude/rules/

      # Prompts (directory tree)
      cp -r ~/.plamen/prompts ~/.claude/prompts
      ```
      Verify `~/.claude/commands/plamen.md` exists after copy. Print: "Plamen installed (agents, commands, rules, prompts, skills copied to ~/.claude/)"
   5. If user declines install or copy fails, skip plamen for this run

   > **Note:** This minimal install skips config merges (settings.json, mcp.json, CLAUDE.md), RAG database, and toolchain deps. For full setup including RAG and MCP servers, the user can run the interactive installer themselves: `! cd ~/.plamen && python3 plamen.py install`

   **auditagent:** Check if auditagent-cli is installed and configured.

   1. Check if `aa` binary exists: `which aa` (fallback: `which audit-agent`)
   2. If **missing**: use **AskUserQuestion** to ask if the user wants to install. If yes:
      ```bash
      pip install git+https://github.com/NethermindEth/auditagent-cli.git
      ```
      Verify `aa --version` succeeds after install. If install fails (private repo access, no pip), print manual install instructions and skip auditagent for this run.
   3. Check if `AUDIT_AGENT_API_KEY` env var is set. If not, print:
      ```
      AUDIT_AGENT_API_KEY is required. Get your key from:
      https://app.auditagent.nethermind.io/profile?tab=api-keys
      Then: export AUDIT_AGENT_API_KEY=<your-key>
      ```
      Mark auditagent as blocked.
   4. Check if `auditagent.toml` exists in the project root. If missing, run:
      ```bash
      aa init
      ```
      This creates the config with auto-detected project settings (Foundry/Hardhat/Truffle). Print: "Initialized auditagent.toml"
   5. Check `<output_dir>/ai-status.json` for an existing auditagent entry with `status: "pending_scan"` and a `scan_id`. If found, print:
      ```
      Found pending auditagent scan: <scan_id>
      Will check status and retrieve findings if complete.
      ```
   6. If user declines install or API key is missing, skip auditagent for this run

3. For all selected tools, also check:
   - **Env vars**: check `requires_env` vars exist (e.g. `SOLODIT_API_KEY`). Print how to obtain & set them if missing.
   - **System dependencies**: for each entry in `dependencies` array:
     - Check if binary exists via `which <binary>` (e.g. `slither`, `aderyn`, `forge`)
     - If missing and `required: true`, mark tool as blocked
     - If missing and `required: false`, note it as degraded but still runnable

4. Collect all issues into a summary table. Separate auto-resolved items from items requiring user action:

```
Auto-installed:
  ✓ solidity-auditor skill — cloned from pashov/skills, copied SKILL.md
  ✓ sc-auditor MCP server — cloned, built, registered in .mcp.json

Requires user action:
┌─────────────────────┬──────────────┬──────────────────────────────────────┐
│ Tool                │ Issue        │ Resolution                           │
├─────────────────────┼──────────────┼──────────────────────────────────────┤
│ sc-auditor          │ Missing env  │ export SOLODIT_API_KEY=<key>         │
│ sc-auditor          │ No slither   │ pip install slither-analyzer         │
└─────────────────────┴──────────────┴──────────────────────────────────────┘
```

5. **Pause** — if there are unresolved issues, present the summary and use **AskUserQuestion** to ask the user whether they've fixed the issues or which tools to skip. If all checks pass (including auto-installs), proceed immediately.

### Phase B — Run tools

All tools analyze the local codebase and need context generation and comment stripping before they run.

#### Step 6 — Tool preparation

6a. Run `npx hex context` once to generate codebase context (shared by all tools).

6b. Read `config.json` → `project.scope` to get the list of in-scope files. This is the authoritative scope — every tool must be constrained to these files.

6c. **Strip `@audit` comments** to prevent AI tools from being biased by the auditor's own notes.
   - Check if in-scope files have uncommitted changes: `git status --porcelain -- <scope-files>`
   - If there are uncommitted changes, commit them as a snapshot so they can be restored later:
     ```bash
     git add <scope-files>
     git commit -m "chore: snapshot before AI analysis"
     ```
     Do NOT push. Print: "Committed snapshot of N files before AI analysis"
   - Grep all in-scope files for lines containing `@audit` (this catches all variants: `// @audit`, `//@audit`, `// @audit-issue`, `// @audit-issue-verified`, etc.)
   - For each matched line:
     - If the line is **only** a comment (nothing but whitespace + `//` + `@audit...`), remove the entire line
     - If the line has code before the comment (e.g. `uint x = 1; // @audit rounding`), remove only the `// @audit...` portion, keeping the code
   - Print: "Stripped N @audit comments from M files (will restore via git checkout)"

#### Step 7 — Run CLI tools

##### Step 7a — Run auditagent (if selected)

auditagent is a cloud-based async scanner. Unlike all other tools, a single run of the skill cannot both trigger a scan and collect results. Execution follows a two-phase pattern across separate skill invocations.

1. Record `tool_start = Date.now()`
2. Update `<output_dir>/ai-status.json` setting auditagent's status to `"running"` with `started_at` set to the current ISO timestamp

3. **Check for existing scan state.** Read `<output_dir>/ai-status.json` → `tools.auditagent`:

   **Case A: `status: "pending_scan"` with a `scan_id`** — A scan was previously triggered. Check its status:
   ```bash
   aa scan --status <scan_id>
   ```
   - If scan is **complete**: proceed to step 5 (fetch findings)
   - If scan is **still running**: print "Auditagent scan `<scan_id>` is still in progress (started at `<started_at>`). Skipping — re-run /run-ai-analysis later to collect results." Update `ai-status.json` keeping `status: "pending_scan"` and the existing `scan_id`. **Skip auditagent for this run** — do NOT block other tools.
   - If scan **failed**: print the error. Update `ai-status.json` with `status: "failed"` and the error message. Use **AskUserQuestion** to ask if the user wants to retry (trigger a new scan) or skip.

   **Case B: No existing scan** (`status` is `"not_started"` or absent) — Use **AskUserQuestion** to ask:
   ```
   auditagent requires a cloud scan that takes 30-60+ minutes.

   Options:
   1. Start a new scan (will complete in background — re-run this skill to collect results)
   2. Enter an existing scan_id (if you already triggered one)
   3. Skip auditagent for this run

   Choose [1/2/3]:
   ```

   - If **option 1** (new scan):
     a. Get scope files from `config.json` → `project.scope` — these are the authoritative scope, not `auditagent.toml`
     b. Run: `aa scan --quality auditor <scope-files...>` (auditor-quality deep scan)
     c. Parse the `scan_id` from stdout (look for a UUID in the output)
     d. Update `<output_dir>/ai-status.json`:
        ```json
        { "auditagent": { "status": "pending_scan", "started_at": "<ISO timestamp>", "scan_id": "<scan_id>" } }
        ```
     e. Print: "Auditagent scan triggered: `<scan_id>`. This will take 30-60 minutes. Re-run /run-ai-analysis after the scan completes to collect findings."
     f. **Skip further auditagent processing** — proceed to other tools.

   - If **option 2** (existing scan_id):
     a. Use **AskUserQuestion** to get the scan_id from the user
     b. Run: `aa link <scan_id>`
     c. Run: `aa scan --status <scan_id>`
     d. If complete → proceed to step 5
     e. If still running → save to `ai-status.json` as `pending_scan` with the `scan_id` and skip
     f. If failed → report error and skip

   - If **option 3** (skip): skip auditagent entirely, proceed to next tool.

4. **If scan is not yet complete, skip to Step 7b.** Do not block other tools.

5. **Fetch findings from completed scan:**
   ```bash
   aa findings --all
   ```
   This outputs all findings with full descriptions and saves them as a markdown file in the `.auditagent/` folder.

6. **Save raw output:**
   Copy the saved markdown file from `.auditagent/` to `<output_dir>/ai-results/auditagent/raw-output.md`

7. **Normalize findings** into `<output_dir>/ai-results/auditagent/findings.json` using the `AiResultFile` format.

   Parse the markdown output: findings are grouped by severity headings. For each finding extract:
   - `id`: `auditagent-001`, `auditagent-002`, etc. (sequential)
   - `tool`: `"auditagent"`
   - `title`: finding title
   - `severity`: mapped from the severity group heading (Critical, High, Medium, Low, Info)
   - `description`: full finding description
   - `affected_code`: `[{ "file": "<file>", "snippet": "<relevant code>" }]` — extract file references from the finding body
   - `confidence`: default to `"medium"` (cloud AI analysis without local verification)
   - `category`: extract from finding type/category if available
   - `raw_category`: preserve original category label from auditagent

8. **Write metadata:**
   ```json
   { "ran_at": "<ISO timestamp>", "duration_seconds": <seconds>, "scan_id": "<scan_id>" }
   ```
   Note: `duration_seconds` should be calculated from the original `started_at` (when scan was triggered) to now, even if it spans multiple sessions.

9. **Update `ai-status.json`:**
   Set auditagent to `status: "completed"` with `findings_count` and `scan_id`.

10. Print: "Completed auditagent — N findings (scan `<scan_id>`)"

##### Step 7b — Run other CLI tools

For each enabled `type: "cli"` tool with `long_running: false` that passed preflight (excluding auditagent):
   - Run CLI command via bash, passing the scope files as arguments where the invocation template supports it
   - Same normalization flow as step 8

#### Step 8 — Run skill tools

Skill tools run in **two phases**: non-plamen tools first (sequentially), then long-running tools (plamen). All tools run directly in the orchestrator context so they have full access to permissions, MCP tools, and slash commands.

##### Step 8a — Run non-plamen skills SEQUENTIALLY in orchestrator

Group all enabled `type: "skill"` tools with `long_running: false` that passed preflight (e.g. solidity-auditor, sc-auditor).

For each tool in the group, run it **directly in this context** (NOT as a subagent). Subagents cannot surface permission prompts to the user, so Write and MCP tool calls silently fail in subagent contexts.

1. Record `tool_start = Date.now()`
2. Update `<output_dir>/ai-status.json` setting this tool's status to `"running"` with `started_at` set to the current ISO timestamp

3. Execute the tool based on its `install_type`:

   **For `install_type: "skill-file"`** (e.g. solidity-auditor):
   - Read `.claude/skills/<skill_path>/SKILL.md` in full before doing anything else
   - Read EVERY in-scope file from `config.json` → `project.scope` (do not skip or skim)
   - Follow the SKILL.md methodology completely: execute every phase/pass sequentially
   - Do not skip, merge, or abbreviate any phases
   - After completing each phase, write a brief checkpoint: "Phase N complete — found X issues"
   - For each finding, cite the specific file, function, and line range
   - A thorough audit should take 15-30 minutes. If finished in under 10 minutes, phases were likely skipped
   - Save the complete analysis to `<output_dir>/ai-results/<tool-name>/raw-output.md`

   **For `install_type: "mcp-server"`** (e.g. sc-auditor):
   - This tool is an MCP server. It does NOT have a SKILL.md file. Do NOT look for `.claude/skills/<tool-name>/SKILL.md`
   - Discover available MCP tools by searching for tools matching `mcp__<tool-name>__*` (e.g. use ToolSearch)
   - Read any README at `.claude/tools/<tool-name>/README.md` if it exists
   - Use the discovered MCP tools systematically on EVERY in-scope file:
     - Run static analysis tools (slither, aderyn) if available via MCP
     - Search for known vulnerability patterns (solodit) if available via MCP
     - Run the main audit/analyze function on each in-scope file
   - Do NOT fall back to manual code review. If an MCP tool call fails, log the error and try the next tool
   - Each finding must reference which MCP tool produced it
   - Aggregate all MCP tool outputs and save to `<output_dir>/ai-results/<tool-name>/raw-output.md`

   **For other `install_type` values** (fallback):
   - Follow the tool's `invocation` command/pattern
   - Save output to `<output_dir>/ai-results/<tool-name>/raw-output.md`

4. Record `tool_end = Date.now()` and compute `duration_seconds = Math.round((tool_end - tool_start) / 1000)`

5. **Normalize immediately** after this tool completes (before moving to the next tool):
   a. Read `<output_dir>/ai-results/<tool-name>/raw-output.md`
   b. Parse and normalize findings into `<output_dir>/ai-results/<tool-name>/findings.json` using the `AiResultFile` format:
      ```json
      {
        "tool": "<tool-name>",
        "ran_at": "<ISO timestamp>",
        "duration_seconds": <seconds>,
        "total_findings": <count>,
        "findings": [
          {
            "id": "<tool-name>-001",
            "tool": "<tool-name>",
            "title": "...",
            "severity": "Critical|High|Medium|Low|Info",
            "description": "...",
            "affected_code": [{ "file": "...", "snippet": "..." }],
            "confidence": "high|medium|low",
            "category": "...",
            "raw_category": "..."
          }
        ]
      }
      ```
   c. Write `<output_dir>/ai-results/<tool-name>/metadata.json`:
      ```json
      { "ran_at": "<ISO timestamp>", "duration_seconds": <seconds> }
      ```
   d. Update `<output_dir>/ai-status.json` setting this tool's status to `"completed"` with findings count

6. Print: "Completed <tool-name> — N findings in Xs" and proceed to the next tool.

##### Step 8b — Run plamen (if selected)

**plamen runs directly in the orchestrator context**, like all other tools. Invoke it via the Skill tool:

1. Record `tool_start = Date.now()`
2. Update `<output_dir>/ai-status.json` setting plamen's status to `"running"` with `started_at` set to the current ISO timestamp
3. Create a scope file at `<output_dir>/ai-results/plamen/_scope.txt` with one in-scope file path per line (relative to project root).
4. Invoke plamen directly via the **Skill tool**:
   ```
   Skill(skill="plamen", args="core <project-path> wrapper-launch scope: <output_dir>/ai-results/plamen/_scope.txt")
   ```
   The `wrapper-launch` flag skips all confirmation prompts. Plamen spawns its own sub-agents (25-45 in core mode) — these run in isolated contexts and don't pollute the orchestrator.
5. After plamen completes, record `tool_end = Date.now()` and compute `duration_seconds`.
6. Copy its final audit report to `<output_dir>/ai-results/plamen/raw-output.md`. Look for `AUDIT_REPORT.md` or the final consolidated report in the project root or `.plamen/scratchpad/`.
7. Normalize findings into `<output_dir>/ai-results/plamen/findings.json` using the same `AiResultFile` format as step 8a.
8. Write `<output_dir>/ai-results/plamen/metadata.json`.
9. Update `<output_dir>/ai-status.json` setting plamen's status to `"completed"` with findings count.

##### Step 8c — Batch tracking update

After ALL tools have completed and been normalized, write all findings to `tracking.json` in one operation:
- For each tool's `findings.json`, add each finding to `tracking.json` with `status: "unverified"` and `source: "<tool-name>"`
- This single batch write avoids any race conditions and keeps the tracking file consistent

#### Step 9 — Restore comments and undo snapshot commit (only if step 6c ran)

1. **Restore `@audit` comments.** Run `git checkout -- <scope-files>` to restore all in-scope files to their last committed state (which includes the `@audit` comments from the snapshot commit). Print: "Restored @audit comments via git checkout"

2. **Undo the snapshot commit.** If step 6c created a snapshot commit, remove it while keeping the files as they are:
   ```bash
   git reset --soft HEAD~1
   ```
   This removes the `chore: snapshot before AI analysis` commit but keeps all file contents (including the restored @audit comments) staged. The user's branch ends up exactly where it was before the analysis. Print: "Removed snapshot commit — working tree restored to pre-analysis state"

### Phase C — Post-processing

10. After all tools complete, run `/compare-findings` to:
    - Deduplicate AI findings against each other and against manual findings
    - Assess novelty of unique findings
    - Update `comparison.json`

11. Print a coverage gap summary:
    - "AI tools found N novel issues you didn't catch (M likely valid, K needs review)"
    - "You found X issues no AI tool caught"
    - Per-tool breakdown of findings by severity

12. Print final summary:
    - Total findings per tool
    - Duplicates detected
    - Novel findings requiring review
    - Any tools that were skipped
    - If auditagent scan was newly triggered: "auditagent: scan `<scan_id>` started — results available in ~30-60 min"
    - If auditagent scan is still pending: "auditagent: scan `<scan_id>` pending — re-run to collect results"

## Why Sequential Execution?

All tools run directly in the orchestrator context rather than in subagents. Subagents cannot surface permission prompts to the user, so Write, MCP, and other tool calls that need approval silently fail. This caused tools to produce shallow results (5-minute runs instead of 15-30 minute thorough analyses).

Sequential execution means tools run one at a time, but each tool has full access to permissions, MCP tools, and slash commands. After each tool completes, its output is normalized and saved to disk. The conversation compressor handles context window pressure between tools. Post-processing (compare-findings, gap analysis) only needs the normalized `findings.json` files, not the raw tool outputs still in context.

## Severity Mapping

When normalizing findings, map tool-specific severity labels:
- "Critical", "High risk" → Critical
- "High", "Major" → High
- "Medium", "Moderate" → Medium
- "Low", "Minor", "Warning" → Low
- "Informational", "Info", "Gas", "Optimization" → Info

## ID Format

AI finding IDs follow the pattern: `<tool-name>-<NNN>` (e.g., `solidity-auditor-001`, `sc-auditor-012`, `plamen-007`)
