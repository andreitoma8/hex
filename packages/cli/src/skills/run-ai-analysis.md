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
       { "name": "auditagent", "type": "cli", "invocation": "aa findings", "install_type": "manual", "output_format": "stdout", "enabled": true, "long_running": false, "requires_env": ["AUDIT_AGENT_API_KEY"], "dependencies": [{ "binary": "aa", "install_cmd": "pip install git+ssh://git@github.com/NethermindEth/auditagent-cli.git", "required": true }], "description": "Nethermind auditagent SaaS — links to an existing scan and pulls findings" },
       { "name": "solidity-auditor", "type": "skill", "invocation": "/solidity-auditor deep", "install_url": "https://github.com/pashov/skills", "install_type": "skill-file", "skill_path": "solidity-auditor", "output_format": "markdown", "enabled": true, "long_running": false, "description": "Pashov solidity-auditor Claude Code skill" },
       { "name": "sc-auditor", "type": "skill", "invocation": "/security-auditor src/", "install_url": "https://github.com/Archethect/sc-auditor", "install_type": "mcp-server", "output_format": "markdown", "enabled": true, "long_running": false, "requires_env": ["SOLODIT_API_KEY"], "dependencies": [{ "binary": "slither", "install_cmd": "pip install slither-analyzer", "required": false }, { "binary": "aderyn", "install_cmd": "cargo install aderyn", "required": false }, { "binary": "forge", "install_cmd": "curl -L https://foundry.paradigm.xyz | bash && foundryup", "required": false }], "description": "Archethect sc-auditor MCP server with Solodit integration" },
       { "name": "plamen", "type": "skill", "invocation": "/plamen core", "install_type": "manual", "output_format": "markdown", "enabled": true, "long_running": true, "dependencies": [{ "binary": "python3", "install_cmd": "Install Python 3.11-3.12 from https://python.org", "required": true }], "description": "Plamen autonomous security auditor — multi-agent analysis across 8 audit phases" }
     ]
     ```
   - **If `ai_tools` exists**: check for missing default tools. Compare tool names in config against the built-in defaults above. For any default tool NOT present in config by name, append it with `enabled: true`. If new tools were added, print: "Added N new default tool(s) to your config: <names>" and persist the updated list to `config.json`.

2. Use the **AskUserQuestion** tool to ask which tools to run. List each tool with a checkbox-style selection prompt. Example question:
   ```
   Which AI tools do you want to run?

   [ ] auditagent — Nethermind auditagent SaaS (pulls findings from an existing scan)
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

   #### `install_type: "manual"` (e.g. auditagent, plamen)

   Handle each manual tool individually:

   **auditagent:** Print manual install instructions (no auto-install):
   ```
   auditagent requires manual installation:
     pip install git+ssh://git@github.com/NethermindEth/auditagent-cli.git
   ```

   **plamen:** Check if Plamen is installed, and offer auto-install if missing:
   1. Check if `~/.plamen/` directory exists (repo cloned) AND `~/.claude/commands/plamen.md` exists (installer ran successfully)
   2. If **both exist**: Plamen is installed — proceed
   3. If `~/.plamen/` **is missing**: use **AskUserQuestion** to ask:
      ```
      Plamen is not installed. Would you like me to install it?
      This will clone the repo to ~/.plamen and run the installer (creates symlinks in ~/.claude/, builds RAG database).
      Reply "yes" to install, or "no" to skip plamen for this run.
      ```
      If user says yes, run:
      ```bash
      git clone https://github.com/PlamenTSV/plamen.git ~/.plamen
      cd ~/.plamen && python3 plamen.py install
      ```
   4. If `~/.plamen/` **exists** but `~/.claude/commands/plamen.md` **is missing** (cloned but installer not run): use **AskUserQuestion** to ask:
      ```
      Plamen repository found at ~/.plamen but the installer hasn't been run.
      Would you like me to run the installer now?
      Reply "yes" to install, or "no" to skip plamen for this run.
      ```
      If user says yes, run:
      ```bash
      cd ~/.plamen && python3 plamen.py install
      ```
   5. If user says no (or auto-install fails), skip plamen for this run

3. For all selected tools, also check:
   - **Env vars**: check `requires_env` vars exist (e.g. `SOLODIT_API_KEY`, `AUDIT_AGENT_API_KEY`). Print how to obtain & set them if missing.
   - **System dependencies**: for each entry in `dependencies` array:
     - Check if binary exists via `which <binary>` (e.g. `slither`, `aderyn`, `forge`, `aa`)
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
│ auditagent          │ No aa binary │ pip install git+ssh://...            │
└─────────────────────┴──────────────┴──────────────────────────────────────┘
```

5. **Pause** — if there are unresolved issues, present the summary and use **AskUserQuestion** to ask the user whether they've fixed the issues or which tools to skip. If all checks pass (including auto-installs), proceed immediately.

### Phase B — Run tools

Determine which categories of tools were selected:
- **External tools**: `type: "cli"` tools that pull from remote services (e.g. auditagent). These need NO local preparation — no context generation, no comment stripping, no scope files.
- **Local tools**: `type: "skill"` or `type: "mcp-server"` tools that analyze the local codebase (e.g. solidity-auditor, sc-auditor). These need context, scope, and comment stripping.

#### Step 6 — Run external tools first (no prep needed)

**auditagent** (and any other external CLI tools). If auditagent is enabled and passed preflight:
   - Use **AskUserQuestion** to ask:
     ```
     Paste the auditagent scan URL or ID.
     If you haven't started a scan yet, go to the auditagent webapp to create one for the full repository, then paste the URL here.
     ```
     Do NOT offer to start a scan via the CLI — per-contract scanning loses cross-contract context. The user must create the scan from the auditagent webapp.
   - When the user provides a URL or ID:
     a. Run `aa link <scan_id_or_url>` to link the CLI to the scan
     b. Run `aa findings` and capture stdout
     c. Save raw output to `<output_dir>/ai-results/auditagent/raw-output.md`
     d. Normalize findings into `<output_dir>/ai-results/auditagent/findings.json` using the `AiResultFile` format (see step 9 for schema)
     e. Write `<output_dir>/ai-results/auditagent/metadata.json`
     f. Add each finding to `tracking.json` with `status: "unverified"` and `source: "auditagent"`
     g. Update `<output_dir>/ai-status.json` with tool status: `"completed"` and findings count

**If no local tools are selected**, skip directly to Phase C (post-processing). Steps 7–10 are not needed.

#### Step 7 — Local tool preparation (only if local tools are selected)

7a. Run `npx solaudit context` once to generate codebase context (shared by all local tools).

7b. Read `config.json` → `project.scope` to get the list of in-scope files. This is the authoritative scope — every local tool must be constrained to these files.

7c. **Strip `@audit` comments** to prevent AI tools from being biased by the auditor's own notes.
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

#### Step 8 — Run local CLI tools

For each enabled `type: "cli"` local tool with `long_running: false` that passed preflight:
   - Run CLI command via bash, passing the scope files as arguments where the invocation template supports it
   - Same normalization flow as step 9

#### Step 9 — Run skill tools

For each enabled `type: "skill"` tool that passed preflight, **spawn a subagent** using the Agent tool. Each skill runs in its own subagent to isolate its large output from the orchestrator context:
    - **Record per-tool timing:** set `tool_start = Date.now()` BEFORE launching each subagent. After the subagent completes, set `tool_end = Date.now()` and compute `duration_seconds = Math.round((tool_end - tool_start) / 1000)`. Do NOT use a shared start time across tools — each tool must have its own independent start/end timestamps.
    - Give the subagent a clear prompt that **includes the scope**:
      ```
      You are running the <tool-name> AI audit tool.

      SCOPE — only audit these files:
      <list each file from config.json → project.scope>

      Read and follow the instructions in .claude/skills/<skill-name>/SKILL.md
      Focus your analysis exclusively on the in-scope files listed above.
      Ignore findings that only affect out-of-scope code (tests, mocks, dependencies).
      Save raw output to <output_dir>/ai-results/<tool-name>/raw-output.md when done.
      ```

    - **plamen-specific subagent prompt** — Plamen is invoked as a slash command (`/plamen`), not via a SKILL.md file. Use this prompt instead of the generic one above:
      ```
      You are running the plamen AI audit tool.

      SCOPE — only audit these files:
      <list each file from config.json → project.scope>

      STEP 1: Create a scope file at <output_dir>/ai-results/plamen/_scope.txt
      Write one file path per line (relative to project root), listing all in-scope files above.

      STEP 2: Run the Plamen audit
      Invoke: /plamen core --scope <output_dir>/ai-results/plamen/_scope.txt

      IMPORTANT:
      - Plamen spawns multiple sub-agents (25-45 in core mode). This is expected and will take time.
      - Do NOT interrupt or timeout the audit — let all phases complete.
      - Focus exclusively on the in-scope files listed above.

      STEP 3: Save the final report
      After Plamen finishes, copy its final audit report to:
        <output_dir>/ai-results/plamen/raw-output.md
      Look for AUDIT_REPORT.md or the final consolidated report in the project root or .plamen/scratchpad/.
      ```

    - Run skill subagents **sequentially** (not in parallel) — they share the filesystem and may both write to tracking.json
    - After each subagent completes, **in the orchestrator context**:
      a. Read `<output_dir>/ai-results/<tool-name>/raw-output.md`
      b. Parse and normalize findings into `<output_dir>/ai-results/<tool-name>/findings.json` using the `AiResultFile` format (use the per-tool `duration_seconds` computed above):
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
      d. Add each finding to `tracking.json` with `status: "unverified"` and `source: "<tool-name>"`
      e. Update `<output_dir>/ai-status.json` with tool status: `"completed"` and findings count

#### Step 10 — Restore comments (only if step 7c ran)

**Restore `@audit` comments.** Run `git checkout -- <scope-files>` to restore all in-scope files to their last committed state (which includes the `@audit` comments from the snapshot commit). Print: "Restored @audit comments via git checkout"

### Phase C — Post-processing

11. After all tools complete, run `/compare-findings` to:
    - Deduplicate AI findings against each other and against manual findings
    - Assess novelty of unique findings
    - Update `comparison.json`

12. Print a coverage gap summary:
    - "AI tools found N novel issues you didn't catch (M likely valid, K needs review)"
    - "You found X issues no AI tool caught"
    - Per-tool breakdown of findings by severity

13. Print final summary:
    - Total findings per tool
    - Duplicates detected
    - Novel findings requiring review
    - Any tools that were skipped

## Why Subagents?

Each AI audit skill (solidity-auditor, sc-auditor, plamen) generates tens of thousands of tokens of output. Running them all in the orchestrator's context would:
- Fill the context window, degrading quality of later steps
- Mix tool outputs, making normalization harder
- Risk losing context for the post-processing phase (compare-findings, gap analysis)

By isolating each tool in a subagent, the orchestrator only sees the final raw-output.md file — a clean handoff point.

## Severity Mapping

When normalizing findings, map tool-specific severity labels:
- "Critical", "High risk" → Critical
- "High", "Major" → High
- "Medium", "Moderate" → Medium
- "Low", "Minor", "Warning" → Low
- "Informational", "Info", "Gas", "Optimization" → Info

## ID Format

AI finding IDs follow the pattern: `<tool-name>-<NNN>` (e.g., `solidity-auditor-001`, `sc-auditor-012`, `auditagent-003`, `plamen-007`)
