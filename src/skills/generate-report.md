---
description: "Generate the LaTeX report sections for the final audit report (Overleaf-ready)"
---

# Skill: Generate Report

**Recommended model:** Sonnet

This skill produces the LaTeX section files an auditor assembles into the Nethermind Overleaf report template at the end of an engagement. It runs from the GitHub-synced issues (the report's source of truth), after findings have been pushed via /sync-issues, and reuses the analysis Hex already produced during /init-audit (`overview.md`, `stats.json`, `access-control.json`, `deps.json`).

## What it writes

Seven report sections in `<output_dir>/report/`, each emitted in **two forms** (see "Output convention"):

1. **Executive Summary** (§1) — project synopsis, severity histogram, status histogram, summary table of audit metadata.
2. **Audited Files** (§2) — a LaTeX table of in-scope files (LoC, comments, ratio, blank, total).
3. **Summary of Issues** (§3) — hyperlinked finding rows.
4. **System Overview** (§4) — descriptive protocol architecture: components, actors & roles, per-module or per-flow subsections. Built from `overview.md` + access-control/deps analysis.
5. **Issues** (§6) — one `\subsection{[Sev] title}\label{issue:N}` per synced finding, with description, code blocks, recommendation, status, client update.
6. **Documentation Evaluation** (§7) — a `tcolorbox` remarks paragraph about the client's documentation.
7. **Test Suite Evaluation** (§8) — coverage summary and automated-tooling note, generated from `stats.json.test_coverage`.

The skill does NOT compile LaTeX itself. Sections §5 (risk methodology) and §9 (conclusion) are static in the Overleaf template and are not generated here.

## Output convention

Every section is generated **once** as a LaTeX string, then written to two paths in `<output_dir>/report/`:

| Section | `.txt` (dashboard viewer / copy-paste) | `.tex` (`\input{}` into `main.tex`) |
|---|---|---|
| §1 Executive Summary | `executive_summary.txt` | `01-executive-summary.tex` |
| §2 Audited Files | `audited_files.txt` | `02-audited-files.tex` |
| §3 Summary of Issues | `summary_of_findings.txt` | `03-summary-of-findings.tex` |
| §4 System Overview | `system_overview.txt` | `04-system-overview.tex` |
| §6 Issues | `findings.txt` | `06-issues.tex` |
| §7 Documentation Evaluation | `documentation_eval.txt` | `07-documentation-eval.tex` |
| §8 Test Suite Evaluation | `test_suite.txt` | `08-test-suite.tex` |

The `.txt` and `.tex` bodies are byte-identical. The `.txt` copies power the dashboard `/report` viewer (with copy buttons); the `.tex` copies drop straight into an Overleaf `main.tex` that `\input`s the numbered files.

All prose written by this skill must follow the project writing style (no em dashes, "Consider..." recommendations, banned-word list in the project CLAUDE.md).

## Phase 0 — Gather report metadata

Read `<output_dir>/config.json`. Look under `settings.report.*` for:

- `repository_url` — e.g. `https://github.com/mellow-finance/flexible-vaults`. Required for hyperref links in the audited files table and per-finding file links.
- `initial_commit` — commit hash for the initial report scope.
- `final_commit` — commit hash after fixes (defaults to `initial_commit` if no remediation cycle).
- `initial_report_date` — date the initial report was delivered (e.g. `May 22, 2026`).
- `final_report_date` — date the final report was delivered (defaults to `initial_report_date`).
- `audit_type` — defaults to `Security Review`.
- `doc_assessment` — `High` / `Medium` / `Low`.
- `test_assessment` — `High` / `Medium` / `Low`.
- `kickoff_call` — optional focus note for the §7 kick-off sentence (e.g. "with a focus on the upgrade changes"). Empty means omit the kick-off sentence.
- `client_availability` — optional free-text for the §7 closing sentence. Empty falls back to the standard availability sentence.

For each missing field, use **AskUserQuestion** to prompt the auditor. After collection, persist all values back to `config.json` under `settings.report.*` so re-runs don't re-prompt.

If `repository_url` is not set, also offer to derive it from the project's git remote (`git -C <project_dir> remote get-url origin`).

## Phase 1 — Require synced issues (GitHub is the source of truth)

The report is generated **only** from issues that are synced to GitHub (`tracking.status === "synced"`). GitHub is the single source of truth for finding content; the local Potential/Verified columns are a staging area.

Before doing anything else:
- If `settings.github.repo` is not set, **abort**: "The report is generated from GitHub-synced issues. Configure `settings.github.repo` (or pass `--github-repo` to `hex init`) and run `/sync-issues` first."
- If there are zero `synced` findings, **abort**: "No synced issues found. Verify findings, then run `/sync-issues` to push them to GitHub before generating the report."

## Phase 2 — Compute the histograms and counts

Read `<output_dir>/findings.json` and `<output_dir>/tracking.json`.

**Report findings** are findings whose tracking entry has `status: "synced"`. These are the ones that go in the report. Sort by severity (Critical → High → Medium → Low → Info), then by id within each severity.

Severity histogram (count of synced findings per severity):
```
{ "Critical": N, "High": N, "Medium": N, "Low": N, "Undetermined": 0, "Info": N, "Best Practices": 0 }
```
(`Undetermined` and `Best Practices` are not currently in Hex's severity model — render them as 0 to match the Nethermind template.)

Resolution histogram (count of synced findings per `resolution` field):
```
{ "Fixed": N, "Acknowledged": N, "Mitigated": N, "Not Fixed": 0, "Unresolved": N }
```
Findings without a `resolution` field count as `Unresolved`.

## Phase 3 — Build the protocol synopsis paragraph

Read `<output_dir>/overview.md`. Produce a roughly half-page (~120-180 words) plain-language summary of what the protocol does and the security-relevant mechanics. This becomes the second paragraph of the Executive Summary. Match the tone of the Nethermind example:

- Open with one sentence on the project's purpose and the in-scope contract(s).
- Use a short `\begin{itemize}[leftmargin=*,itemsep=4pt] ... \end{itemize}` to list 2-3 of the security-relevant axes (e.g., access-control gates, asset-flow surfaces, upgradeability boundaries).
- Close with one or two sentences on any notable edge cases the auditor wants to flag generally (an entry point that bypasses a typical gate, a non-obvious permission, etc.).

Style hints:
- Refer to contracts as `\texttt{ContractName}`, role constants as `\texttt{ROLE\_NAME}`, function names as `\texttt{name(...)}`.
- Bold key terms with `\textbf{...}`.
- No code blocks in this paragraph — those belong in the per-finding sections.

## Phase 4 — Write the Executive Summary (§1)

Write to `executive_summary.txt` **and** `01-executive-summary.tex`.

```latex
\pagebreak \vspace*{0cm}
\sectioncolor
\section{Executive Summary}
\black
This document presents the results of the security review conducted by \href{https://www.nethermind.io/smart-contract-audits}{Nethermind Security} for <PROJECT_NAME>'s <SCOPE_DESCRIPTION>.

<AI-GENERATED PROTOCOL SYNOPSIS PARAGRAPH FROM PHASE 3>

\textbf{The audit comprises <TOTAL_NSLOC>} lines of Solidity code. \textbf{The audit was performed using} (a)~manual analysis of the codebase, and (b)~automated analysis tools.

\textbf{Along this document, we report} <ISSUE_COUNT_PHRASE>.
%
The issues are summarized in Fig.~1.

\textbf{This document is organized as follows.}
%
{Section~2} presents the files in the scope.
%
{Section~3} presents the summary of issues.
%
{Section~4} presents the System Overview.
%
{Section~5} discusses the risk rating methodology.
%
{Section~6} details the issues.
%
{Section~7} discusses the documentation provided by the client for this audit.
%
{Section~8} presents the test suite evaluation and automated tools used.
%
{Section~9} concludes the document.
\color{black}

\begin{figure}[H]
        \centering
        \subfigure[]
        {
            \includegraphics[trim=0cm 0cm 0cm 0cm, clip=true, width=0.45\textwidth]{img/Severity.pdf}
            \label{fig:severity}
        }
        \subfigure[]
        {
            \includegraphics[trim=0cm 0cm 0cm 0cm, clip=true, width=0.45\textwidth]{img/Status.pdf}
            \label{fig:status}
        }
        \label{fig:trapezio}
 \end{figure}
\begin{center}
    \begin{footnotesize}
        \textbf{Fig.~1: Distribution of issues:} \textbf{Critical}~(<C>), \textbf{High}~(<H>), \textbf{Medium}~(<M>), \textbf{Low}~(<L>), \textbf{Undetermined}~(0), \textbf{Informational}~(<I>), \textbf{Best Practices}~(0).\\
        \textbf{Distribution of status:} \textbf{Fixed}~(<F>), \textbf{Acknowledged}~(<A>), \textbf{Mitigated}~(<MI>), \textbf{Unresolved}~(<U>)
    \end{footnotesize}
\end{center}

\color{black}

\begin{longtable}[c]{ll}
\caption*{\textbf{Summary of the Audit}} \\ \hline
\textbf{Audit Type} & <AUDIT_TYPE> \\
\textbf{Initial Report} & <INITIAL_REPORT_DATE> \\
\textbf{Final Report} & <FINAL_REPORT_DATE> \\
\textbf{Initial Commit}  & \href{<REPOSITORY_URL>/blob/<INITIAL_COMMIT>/<FIRST_SCOPE_FILE>}{<INITIAL_COMMIT_SHORT>} \\
\textbf{Final Commit} & \href{<REPOSITORY_URL>/commit/<FINAL_COMMIT>}{<FINAL_COMMIT_SHORT>} \\
\textbf{Documentation Assessment} & <DOC_ASSESSMENT> \\
\textbf{Test Suite Assessment} & <TEST_ASSESSMENT> \\ \hline
\end{longtable}
\color{black}
```

Substitutions:
- `<PROJECT_NAME>` ← `config.json.project.name`.
- `<SCOPE_DESCRIPTION>` ← if a single in-scope file, `\texttt{<filename without extension>}` followed by a single-clause description from the overview; if many, `the contracts listed in Section~2`.
- `<TOTAL_NSLOC>` ← `stats.json.totals.nsloc`.
- `<ISSUE_COUNT_PHRASE>` ← something like "five points of attention, where one is classified as `\texttt{Low}`, and four are classified as `\texttt{Informational}` severity." Build dynamically from the severity histogram. If 0 synced findings: "no points of attention requiring remediation." If 1: "one point of attention, classified as `\texttt{<severity>}` severity." Pluralize properly.
- `<C><H><M><L><I>` ← severity histogram counts.
- `<F><A><MI><U>` ← resolution histogram counts.
- `<INITIAL_COMMIT_SHORT>` ← first 7 chars of the commit hash.
- `<FIRST_SCOPE_FILE>` ← relative path of the first file in `config.json.project.scope` (for the initial commit hyperref, which the template anchors to a specific file).

## Phase 5 — Write the Audited Files table (§2)

Write to `audited_files.txt` **and** `02-audited-files.tex`.

Compute per-file line counts from each scope file. For each in-scope file in `config.json.project.scope`:

- Read the file. Count:
  - `code` lines (non-blank, non-comment).
  - `comments` (lines starting with `//` or `#`, or any line inside a `/* ... */` block).
  - `blank` (empty after `.strip()`).
  - `total` = sum of the three.
- `ratio` = `round(comments * 100 / max(code, 1), 0)` followed by `\%`.

Render the table:

```latex
\pagebreak \vspace*{0cm}
%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
\sectioncolor
\section{Audited Files}
\black
%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

\begin{table}[H]
    \centering
    \begin{footnotesize}
    \begin{tabular}{|p{.5cm}|p{9cm}|p{1cm}|p{1.5cm}|p{1cm}|p{1cm}|p{1cm}|}
        \hline
        &\textbf{Contract} & \textbf{LoC} & \textbf{Comments} & \textbf{Ratio} & \textbf{Blank} & \textbf{Total} \\ \hline
            <N> & \href{<REPOSITORY_URL>/blob/<INITIAL_COMMIT>/<FILE_PATH>}{ \texttt{<FILENAME>}} & <code> & <comments> & <ratio>\% & <blank> & <total> \\ \hline
            ...
&            \textbf{Total} &             \textbf{<sum-code>} &             \textbf{<sum-comments>} &             \textbf{<aggregate-ratio>\%} &             \textbf{<sum-blank>} &             \textbf{<sum-total>}            \\ \hline
%%
        \end{tabular}
    \end{footnotesize}
\end{table}
```

- `<FILENAME>` is the basename, LaTeX-escaped (no extension processing — show e.g., `ThreeFModule.sol`).
- `<FILE_PATH>` is the path relative to the project root (`src/utils/ThreeFModule.sol`).
- Number rows sequentially `1, 2, 3 ...`.
- Aggregate ratio = `round(sum-comments * 100 / max(sum-code, 1), 0)`.

## Phase 6 — Write the Summary of Issues (§3)

Write to `summary_of_findings.txt` **and** `03-summary-of-findings.tex`.

For each synced finding in severity-sorted order (Critical → Info), assign a sequential `issue:N` label starting at `issue:0`. This same label is used in the Issues section for the `\hyperref`.

```latex
%\pagebreak \vspace*{0cm}

%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
%%%%%%%%%%%% H E A D E R 1 %%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
\sectioncolor
\section{Summary of Issues}
\black
%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
\begin{table}[H]
    \centering
    \begin{footnotesize}
    \begin{tabular}{|p{1cm}|p{11cm}|p{2.1cm}|p{2.1cm}|}
            \hline
             & \textbf{Finding} & \textbf{Severity} & \textbf{Update} \\ \hline
             <N>&\hyperref[issue:<I>]{<title-LaTeX-escaped>} &<Severity-display> & <Resolution-display>\\ \hline
            %
        \end{tabular}
        \end{footnotesize}
\end{table}
```

- `<N>` is the 1-based row counter.
- `<I>` matches the `\label{issue:N}` index used in the Issues section.
- `<Severity-display>` maps `Info` → `Info`, others use their name as-is.
- `<Resolution-display>` maps the `resolution` field directly (`Fixed`, `Acknowledged`, `Mitigated`, `Not Fixed`); blank/`Unresolved` shows `Unresolved`.

## Phase 7 — Write the System Overview (§4)

Write to `system_overview.txt` **and** `04-system-overview.tex`.

Primary source: `<output_dir>/overview.md` (produced by /init-audit — it already carries an intro, a `## Key Contracts` table, `## External Dependencies`, and `## Architecture Notes`). Enrich the actors/roles material from `<output_dir>/access-control.json` (roles, modifiers, gated functions) and cross-contract relationships from `<output_dir>/deps.json`.

**If `overview.md` is absent, abort**: "System Overview needs `<output_dir>/overview.md`. Run `/init-audit` first, then re-run `/generate-report`."

This section is descriptive only: no vulnerability observations (those live in Issues), no findings, no severities.

Structure the LaTeX:

```latex
\pagebreak \vspace*{0cm}
\sectioncolor
\section{System Overview}
\black

<intro paragraph(s): what the protocol does; if scope is a subset, focus on scope. State what each in-scope contract inherits from using \texttt{}.>

<a short paragraph or itemize listing the main components: one line each — \texttt{ContractName}: responsibility.>

\subsectioncolor
\subsection{Actors and Roles}
\black
<bullet list of actors, their permissions, the functions they can trigger, trust level. If there is a formal access-control system, name the library and explain the role model, using \texttt{ROLE\_NAME} for role constants.>

\subsectioncolor
\subsection{<Module or Flow Name>}
\black
<one subsection per module (Option A) or per flow (Option B). Choose per gauss's rule: if explaining each contract independently makes the system clear, use per-module; if the contracts only make sense together in motion, use per-flow. For each: entry points as a bullet list (functionName: one-line description), main internal flows, key state owned/mutated, how it interfaces with other modules. Use \begin{minted}[linenos]{solidity} ... \end{minted} for signature-only snippets when a flow depends on the parameters. Do not include full function bodies.>

... (repeat subsections) ...
```

Formatting rules (from gauss `to-latex.md`):
- Each `\subsection{}` is preceded by `\subsectioncolor` and followed by `\black`. Subsection titles use title case.
- Contract / function / variable / interface names in `\texttt{}`. Hex values and constants in `\texttt{}`. Standard identifiers (ERC-1271, UUPS, etc.) as-is.
- Do not start a subsection with a bullet list — add an introductory sentence first.
- For a genuinely central formula, use an `equation` block. Do not do this for every calculation.
- Keep it under ~1 page for simple systems, up to ~2 pages for complex ones.

Apply the markdown → LaTeX conversion rules (below) to any prose carried over from `overview.md`.

## Phase 8 — Write the Issues section (§6)

Write to `findings.txt` **and** `06-issues.tex`.

For each synced finding in the same order (severity-sorted), render one subsection. Use the index `i` (0-based) matching the Summary of Issues.

```latex
\pagebreak \vspace*{0cm}

\sectioncolor
\section{Issues}
\black
%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

<per-finding block>

<per-finding block>

...
```

Each per-finding block:

```latex
%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
%%%%%%%%%%%% H E A D E R 3 %%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
\subsubsectioncolor
\subsection{[<Severity-display>] <title-LaTeX-escaped>}\label{issue:<i>}
\begin{footnotesize} \black

 \textbf{File(s)}: \href{<REPOSITORY_URL>/blob/<INITIAL_COMMIT>/<FILE_PATH>}{ \texttt{<FILE_PATH>}}

 \textbf{Description}: <description converted from markdown to LaTeX>

<each code block from description rendered as \begin{minted}[linenos,firstnumber=1]{solidity} ... \end{minted}>

 \textbf{Recommendation(s)}: <recommendation converted from markdown to LaTeX>

 \textbf{Status}: <Resolution-display or "Unresolved">

 \textbf{Update from the client}: <update_from_client, LaTeX-escaped>

\end{footnotesize}

```

If the finding has multiple `root_cause.locations[]`, list them as `\href{...}{...}, \href{...}{...}` comma-separated.

### Markdown → LaTeX conversion rules

Apply to `description`, `recommendation`, and `update_from_client` (in that order, on non-code-block text only — first split out fenced code blocks, then convert the prose):

| Markdown | LaTeX |
|---|---|
| `` `text` `` | ` \texttt{text}` (leading space intentional, matches Nethermind template) |
| `**text**` | ` \textbf{text}` |
| `[label](url)` | ` \href{url}{label}` — if `label` contains `#`, replace with `/#` (anchors break in LaTeX otherwise) |
| `_` (literal underscore in prose) | `\_` |
| `^` | `\^{}` |
| `%` (only when no `](` was present on the line — to avoid mangling URLs) | `\%` |
| Numbered list `1. text` | `\begin{enumerate}\n \def\labelenumi{\arabic{enumi}.} \tightlist\n\item text;\n...\end{enumerate}` |
| Bulleted list `- text` | `\begin{itemize}\n\tightlist\n\item text;\n...\end{itemize}` |
| Fenced code block ` ```solidity ` | `\begin{minted}[linenos,firstnumber=1]{solidity}` ... `\end{minted}` — also support `python`, `typescript`, `javascript`, `cairo` (use `python` lexer), `diff`, `shell`, `rust` |

End list items with `;` (replace trailing `.` with `;`). Last item still ends with `;`.

These conversion rules match the spirit of the Python script `create-section-findings.py` referenced by the auditor — port that semantically into these instructions rather than calling it. The same rules apply to the System Overview prose in Phase 7.

### Severity-display mapping
- `Critical` → `Critical`
- `High` → `High`
- `Medium` → `Medium`
- `Low` → `Low`
- `Info` → `Info` (the Nethermind template uses `Info` in the subsection headers and `Informational` in the histogram caption)

## Phase 9 — Write the Documentation Evaluation (§7)

Write to `documentation_eval.txt` **and** `07-documentation-eval.tex`.

Determine what documentation was available:
- NatSpec presence: infer from `stats.json.totals.comment_lines` (a high comment ratio suggests NatSpec) and by skimming 2-3 in-scope files from `config.json.project.scope`.
- README / external docs: `config.json.project.docs_url` if set, and any README in the repo describing the in-scope system.
- Kick-off call: only if `settings.report.kickoff_call` is set (append its text as the focus).
- Client availability: `settings.report.client_availability` if set, otherwise the standard closing sentence.

Emit the exact `tcolorbox` wrapper (from gauss `documentation-eval.md`):

```latex
\pagebreak \vspace*{0cm}
\sectioncolor
\section{Documentation Evaluation}
\black

\begin{tcolorbox}[colback=blue!5,colframe=blue!50!black!70,title=Remarks about <CLIENT> <PRODUCT> documentation]
<one paragraph describing the documentation actually provided — NatSpec, README/docs, and what the README covers (high-level overview, objectives, architecture). Only mention what exists and is relevant to the code in scope.>
\vspace{0.3em}

<kick-off call sentence, only if settings.report.kickoff_call is set. Example: "Additionally, the <CLIENT> team provided a general overview of the system during the kick-off call <kickoff_call>.">
\vspace{0.3em}

<closing sentence on team availability. Use settings.report.client_availability if set, else: "Moreover, the team addressed all questions and concerns raised by the Nethermind Security team, providing valuable insights and a comprehensive understanding of the project's technical aspects.">
\end{tcolorbox}
```

- `<CLIENT>` ← client/org name (derive from `repository_url` org or `project.name`).
- `<PRODUCT>` ← `config.json.project.name`.
- Do not include full file paths when referring to a file — use the basename.
- Keep it factual: do not claim documentation exists that the analysis does not support.

## Phase 10 — Write the Test Suite Evaluation (§8)

Write to `test_suite.txt` **and** `08-test-suite.tex`.

Read `stats.json.test_coverage`.

If `test_coverage.status === "available"`:
- Report `overall_line_pct` and `overall_branch_pct`.
- Render a per-contract coverage table from `test_coverage.per_contract[]` (`contract`, `line_pct`, `branch_pct`).

If `test_coverage.status !== "available"` (`failed` / `skipped` / null):
- State plainly that automated coverage could not be collected (include `failure_reason` if present), and describe the test suite qualitatively, falling back to the `settings.report.test_assessment` grade.

Always close with an automated-tools paragraph: manual analysis plus automated tooling. If `config.json.settings.ai.auditagent_scan_id` is set, name Nethermind AuditAgent explicitly.

```latex
\pagebreak \vspace*{0cm}
\sectioncolor
\section{Test Suite Evaluation}
\black

<paragraph on the test suite: overall line/branch coverage, or the reason coverage is unavailable, plus a qualitative read tied to the Test Suite Assessment grade.>

\begin{table}[H]
    \centering
    \begin{footnotesize}
    \begin{tabular}{|p{9cm}|p{2cm}|p{2cm}|}
        \hline
        \textbf{Contract} & \textbf{Line \%} & \textbf{Branch \%} \\ \hline
        \texttt{<contract>} & <line_pct>\% & <branch_pct>\% \\ \hline
        ...
    \end{tabular}
    \end{footnotesize}
\end{table}

<automated-tools paragraph: manual review + automated analysis; name Nethermind AuditAgent if a scan id is configured.>
```

(Omit the coverage table entirely when coverage is unavailable.)

## Phase 11 — Final report

After writing all sections, print:

```
Wrote 7 report sections (14 files) to <output_dir>/report/:
  §1 Executive Summary       executive_summary.txt     01-executive-summary.tex
  §2 Audited Files           audited_files.txt         02-audited-files.tex
  §3 Summary of Issues       summary_of_findings.txt   03-summary-of-findings.tex
  §4 System Overview         system_overview.txt       04-system-overview.tex
  §6 Issues                  findings.txt              06-issues.tex
  §7 Documentation Eval      documentation_eval.txt    07-documentation-eval.tex
  §8 Test Suite Evaluation   test_suite.txt            08-test-suite.tex

Synced findings included: <count>
  Critical=<C> High=<H> Medium=<M> Low=<L> Info=<I>

Status distribution:
  Fixed=<F> Acknowledged=<A> Mitigated=<MI> Unresolved=<U>

Read the sections on the dashboard's /report page, or \input the NN-*.tex files into your
Nethermind Overleaf main.tex. Sections 5 (risk methodology) and 9 (conclusion) are template-static.
```

## What this skill does NOT do

- Does not compile LaTeX (no `pdflatex` invocation).
- Does not generate §5 (risk rating methodology) or §9 (conclusion) — those are static in the Overleaf template.
- Does not modify any file outside `<output_dir>/report/` and (with permission) `config.json` under `settings.report.*`.
- Does not push to Overleaf, GitHub, or any remote — output is local plain-text.
- Does not include `rejected`, `duplicate`, `pending_validation`, `unverified`, or `verified`-but-not-yet-synced findings. Only `synced` (on GitHub) makes the cut.
