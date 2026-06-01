---
description: "Generate the four LaTeX section files for the final audit report (Overleaf-ready)"
---

# Skill: Generate Overleaf

**Recommended model:** Sonnet

This skill produces the four LaTeX section files an auditor uploads into the Nethermind Overleaf template at the end of an engagement. It runs from the GitHub-synced issues (the report's source of truth), after findings have been pushed via /sync-issues.

## What it writes

Four `.txt` files in `<output_dir>/overleaf/`:

1. `executive_summary.txt` — `\section{Executive Summary}` body with project synopsis, severity histogram, status histogram, summary table of audit metadata.
2. `audited_files.txt` — `\section{Audited Files}` body with a LaTeX table of in-scope files (LoC, comments, ratio, blank, total).
3. `summary_of_findings.txt` — `\section{Summary of Issues}` body with hyperlinked finding rows.
4. `findings.txt` — `\section{Issues}` body with one `\subsection{[Sev] title}\label{issue:N}` per synced finding, including description, code blocks, recommendation, status, client update.

Output is plain `.txt` so the auditor pastes content into the matching Overleaf template slots. The skill does NOT compile LaTeX itself.

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

For each missing field, use **AskUserQuestion** to prompt the auditor. After collection, persist all values back to `config.json` under `settings.report.*` so re-runs don't re-prompt.

If `repository_url` is not set, also offer to derive it from the project's git remote (`git -C <project_dir> remote get-url origin`).

## Phase 0.5 — Require synced issues (GitHub is the source of truth)

The report is generated **only** from issues that are synced to GitHub (`tracking.status === "synced"`). GitHub is the single source of truth for finding content; the local Potential/Verified columns are a staging area.

Before doing anything else:
- If `settings.github.repo` is not set, **abort**: "The report is generated from GitHub-synced issues. Configure `settings.github.repo` (or pass `--github-repo` to `hex init`) and run `/sync-issues` first."
- If there are zero `synced` findings, **abort**: "No synced issues found. Verify findings, then run `/sync-issues` to push them to GitHub before generating the report."

## Phase 1 — Compute the histograms and counts

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

## Phase 2 — Build the protocol synopsis paragraph

Read `<output_dir>/overview.md`. Produce a roughly half-page (~120-180 words) plain-language summary of what the protocol does and the security-relevant mechanics. This becomes the second paragraph of `executive_summary.txt`. Match the tone of the Nethermind example:

- Open with one sentence on the project's purpose and the in-scope contract(s).
- Use a short `\begin{itemize}[leftmargin=*,itemsep=4pt] ... \end{itemize}` to list 2-3 of the security-relevant axes (e.g., access-control gates, asset-flow surfaces, upgradeability boundaries).
- Close with one or two sentences on any notable edge cases the auditor wants to flag generally (an entry point that bypasses a typical gate, a non-obvious permission, etc.).

Style hints:
- Refer to contracts as `\texttt{ContractName}`, role constants as `\texttt{ROLE\_NAME}`, function names as `\texttt{name(...)}`.
- Bold key terms with `\textbf{...}`.
- No code blocks in this paragraph — those belong in the per-finding sections.

## Phase 3 — Write `executive_summary.txt`

```latex
\pagebreak \vspace*{0cm}
\sectioncolor
\section{Executive Summary}
\black
This document presents the results of the security review conducted by \href{https://www.nethermind.io/smart-contract-audits}{Nethermind Security} for <PROJECT_NAME>'s <SCOPE_DESCRIPTION>.

<AI-GENERATED PROTOCOL SYNOPSIS PARAGRAPH FROM PHASE 2>

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
\end{longtable>
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

## Phase 4 — Write `audited_files.txt`

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

## Phase 5 — Write `summary_of_findings.txt`

For each synced finding in severity-sorted order (Critical → Info), assign a sequential `issue:N` label starting at `issue:0`. This same label is used in `findings.txt` for the `\hyperref`.

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
- `<I>` matches the `\label{issue:N}` index used in `findings.txt`.
- `<Severity-display>` maps `Info` → `Info`, others use their name as-is.
- `<Resolution-display>` maps the `resolution` field directly (`Fixed`, `Acknowledged`, `Mitigated`, `Not Fixed`); blank/`Unresolved` shows `Unresolved`.

## Phase 6 — Write `findings.txt`

For each synced finding in the same order (severity-sorted), render one subsection. Use the index `i` (0-based) matching `summary_of_findings.txt`.

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

The markdown-to-LaTeX logic matches the spirit of the Python script `create-section-findings.py` referenced by the auditor — port that semantically into the skill's instructions rather than calling it.

### Severity-display mapping
- `Critical` → `Critical`
- `High` → `High`
- `Medium` → `Medium`
- `Low` → `Low`
- `Info` → `Info` (the Nethermind template uses `Info` in the subsection headers and `Informational` in the histogram caption)

## Phase 7 — Final report

After writing all four files, print:

```
Wrote 4 LaTeX section files to <output_dir>/overleaf/:
  - executive_summary.txt     (<N> bytes)
  - audited_files.txt          (<N> bytes)
  - summary_of_findings.txt    (<N> bytes)
  - findings.txt               (<N> bytes)

Synced findings included: <count>
  Critical=<C> High=<H> Medium=<M> Low=<L> Info=<I>

Status distribution:
  Fixed=<F> Acknowledged=<A> Mitigated=<MI> Unresolved=<U>

Upload these into your Overleaf project's Section 1 / 2 / 3 / 6 slots respectively.
```

## What this skill does NOT do

- Does not compile LaTeX (no `pdflatex` invocation).
- Does not modify any file outside `<output_dir>/overleaf/` and (with permission) `config.json` under `settings.report.*`.
- Does not push to Overleaf, GitHub, or any remote — output is local plain-text.
- Does not include `rejected`, `duplicate`, `pending_validation`, `unverified`, or `verified`-but-not-yet-synced findings. Only `synced` (on GitHub) makes the cut.
