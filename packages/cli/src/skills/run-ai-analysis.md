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
       { "name": "plamen", "type": "skill", "invocation": "/plamen core", "install_type": "manual", "output_format": "markdown", "enabled": true, "long_running": true, "dependencies": [{ "binary": "python3", "install_cmd": "Install Python 3.11-3.12 from https://python.org", "required": true }], "description": "Plamen autonomous security auditor — multi-agent analysis across 8 audit phases" }
     ]
     ```
   - **If `ai_tools` exists**: check for missing default tools. Compare tool names in config against the built-in defaults above. For any default tool NOT present in config by name, append it with `enabled: true`. If new tools were added, print: "Added N new default tool(s) to your config: <names>" and persist the updated list to `config.json`.
   - **Legacy cleanup**: if `ai_tools` contains an entry named `auditagent`, remove it and persist the updated list to `config.json`. Print: "Removed auditagent (no longer supported)".

2. Use the **AskUserQuestion** tool to ask which tools to run. List each tool with a checkbox-style selection prompt. Example question:
   ```
   Which AI tools do you want to run?

   [ ] solidity-auditor — Pashov solidity-auditor Claude Code skill
   [ ] sc-auditor — Archethect sc-auditor MCP server with Solodit integration
   [ ] plamen — Plamen autonomous security auditor (deploys 25-45 agents in core mode)

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

6a. Run `npx solaudit context` once to generate codebase context (shared by all tools).

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

#### Step 7 — Run local CLI tools

For each enabled `type: "cli"` tool with `long_running: false` that passed preflight:
   - Run CLI command via bash, passing the scope files as arguments where the invocation template supports it
   - Same normalization flow as step 8

#### Step 8 — Run skill tools

Skill tools run in **two phases**: fast tools in parallel first, then long-running tools (plamen). This maximizes parallelism while respecting the constraint that plamen must run in the orchestrator context.

##### Step 8a — Launch non-plamen skills IN PARALLEL

Group all enabled `type: "skill"` tools with `long_running: false` that passed preflight (e.g. solidity-auditor, sc-auditor).

For each tool in the group:
- Record `tool_start = Date.now()`
- Update `<output_dir>/ai-status.json` setting this tool's status to `"running"` with `started_at` set to the current ISO timestamp

Launch ALL grouped tools as **parallel Agent calls in a single message**. Each skill runs in its own subagent to isolate its large output from the orchestrator context. Give each subagent a clear prompt that **includes the scope**:
```
You are running the <tool-name> AI audit tool.

SCOPE — only audit these files:
<list each file from config.json → project.scope>

Read and follow the instructions in .claude/skills/<skill-name>/SKILL.md
Focus your analysis exclusively on the in-scope files listed above.
Ignore findings that only affect out-of-scope code (tests, mocks, dependencies).
Save raw output to <output_dir>/ai-results/<tool-name>/raw-output.md when done.
```

Wait for ALL parallel subagents to complete. Record `tool_end = Date.now()` and compute `duration_seconds = Math.round((tool_end - tool_start) / 1000)` for each.

##### Step 8b — Normalize non-plamen results

For each completed tool from step 8a, **in the orchestrator context**:
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

##### Step 8c — Run plamen (if selected)

**plamen runs in the orchestrator, NOT a subagent.** Slash commands from `~/.claude/commands/` are only available at the top-level conversation, not inside Agent-spawned subagents. So plamen must run directly in the orchestrator context:

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
7. Normalize findings into `<output_dir>/ai-results/plamen/findings.json` using the same `AiResultFile` format as step 8b.
8. Write `<output_dir>/ai-results/plamen/metadata.json`.
9. Update `<output_dir>/ai-status.json` setting plamen's status to `"completed"` with findings count.

##### Step 8d — Batch tracking update

After ALL tools have completed and been normalized, write all findings to `tracking.json` in one operation:
- For each tool's `findings.json`, add each finding to `tracking.json` with `status: "unverified"` and `source: "<tool-name>"`
- This single batch write avoids any race conditions and keeps the tracking file consistent

#### Step 9 — Restore comments (only if step 6c ran)

**Restore `@audit` comments.** Run `git checkout -- <scope-files>` to restore all in-scope files to their last committed state (which includes the `@audit` comments from the snapshot commit). Print: "Restored @audit comments via git checkout"

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

## Why Subagents & Parallel Execution?

Each AI audit skill (solidity-auditor, sc-auditor) generates tens of thousands of tokens of output. Running them all in the orchestrator's context would:
- Fill the context window, degrading quality of later steps
- Mix tool outputs, making normalization harder
- Risk losing context for the post-processing phase (compare-findings, gap analysis)

By isolating each tool in a subagent, the orchestrator only sees the final raw-output.md file — a clean handoff point.

**Parallel execution is safe** because each subagent writes only to its own `ai-results/<tool>/` directory. Source files are read-only during analysis. `tracking.json` and `ai-status.json` are written exclusively by the orchestrator after subagents complete — there are no shared-write conflicts.

**Plamen is the exception** — it must run in the orchestrator context because it uses slash commands (`/plamen`) which are only available at the top level. Non-plamen skills run first in parallel so their results appear in the dashboard while plamen is still running.

## Severity Mapping

When normalizing findings, map tool-specific severity labels:
- "Critical", "High risk" → Critical
- "High", "Major" → High
- "Medium", "Moderate" → Medium
- "Low", "Minor", "Warning" → Low
- "Informational", "Info", "Gas", "Optimization" → Info

## ID Format

AI finding IDs follow the pattern: `<tool-name>-<NNN>` (e.g., `solidity-auditor-001`, `sc-auditor-012`, `plamen-007`)
