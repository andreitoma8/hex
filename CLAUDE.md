# Hex Design System & Style Guide

## Brand
- Product name: **Hex** (lowercase `hex` in CLI and code, title case `Hex` in docs)
- CLI command: `hex`
- Output directory: `.hex/`
- Dashboard package: `hex-dashboard`

## Principles: elegance through simplicity
The dashboard is a calm review workspace that sits next to the auditor's Claude Code session. Every
design decision follows from these:
- **One question, one action.** Every screen answers one question and has one obvious next action
  (Today: "what next?" → Continue; Review: "is this function safe?" → Clear; Model: "how does it
  hold value and power?" → Use in report). Only that action uses the accent fill.
- **Content first, chrome last.** No decoration, no nested cards, no badge clutter, no wide
  multi-column tables by default.
- **Progressive disclosure.** Lists show only what's needed to choose; everything else lives in the
  right-hand inspector (Mail/Xcode three-pane: source list | content | inspector). Rarely needed
  controls hide behind a toggle (e.g. the canvas Style panel).
- **One accent.** Indigo marks selection and the primary action, nothing else. No accent text for
  code, no accent chips, no accent banners.
- **Quiet severity and status.** A small colored dot plus a word, never a filled badge.
- **Typography and whitespace carry hierarchy** on an 8pt grid; hairline dividers instead of boxes.
- **Motion** is 200ms ease-out fades and short slides only.
- **Light and dark are equally polished** (dark is the default).
- **Keyboard-first.** `j`/`k` move, `r`/`q`/`c` mark read/questioned/cleared (Review), F12 / ⌥F12 /
  ⇧F12 go to definition / peek / callers, Alt+←/→ back and forward along the walked flow, `e` edit,
  `/` search, `⌘K` go to anything, `⌘\` toggle the sidebar, `Esc` close; every mutation toasts with
  Undo.
- **Empty states** are one sentence plus the single command that fills them (`hex facts`,
  `/init-audit`, `/generate-report`).

## Typography
- **Display/body**: Manrope (Google Fonts), variable weight 200-800
- **Code only**: JetBrains Mono (file paths, signatures, code snippets, code blocks)
- **Fallback (sans)**: `system-ui, -apple-system, sans-serif`
- **Fallback (mono)**: `ui-monospace, 'SF Mono', monospace`
- **Scale**: display (28px/600), title (20px/600), heading (15px/500), body (14px/400), caption (12px/400)
- **Section headers**: sentence case, medium weight, caption size and `text-tertiary` inside the
  inspector (not uppercase)

## Color Palette
OKLCH throughout for perceptual uniformity; surfaces are blue-tinted (hue 265), never pure black.
Tokens live in `dashboard/app/globals.css` and are exposed as Tailwind colors (`bg-surface-1`,
`text-text-secondary`, `border-border-subtle`, `bg-accent-subtle`, ...).

### Dark mode (default)
| Token | Value | Usage |
|-------|-------|-------|
| `--surface-0` | `oklch(0.13 0.005 265)` | Page, lists, content panes |
| `--surface-1` | `oklch(0.17 0.006 265)` | App sidebar, inspector, kanban cards |
| `--surface-2` | `oklch(0.21 0.006 265)` | Hover, inputs, segmented track |
| `--surface-3` | `oklch(0.26 0.006 265)` | Pressed / active toggle |
| `--text-primary` | `oklch(0.93 0.005 265)` | Body text |
| `--text-secondary` | `oklch(0.68 0.01 265)` | Secondary text |
| `--text-tertiary` | `oklch(0.52 0.008 265)` | Captions, hints, counts |
| `--accent` | `oklch(0.62 0.18 265)` | Selection, primary action |
| `--accent-subtle` | `oklch(0.62 0.18 265 / 0.14)` | Selected row / nav item |
| `--accent-secondary` | `oklch(0.72 0.13 265)` | Primary button hover |
| `--border-subtle` | `oklch(0.30 0.006 265 / 0.45)` | Hairlines between panes and rows |
| `--border-default` | `oklch(0.34 0.006 265 / 0.6)` | Inputs, secondary buttons |
| `--border-emphasis` | `oklch(0.44 0.01 265 / 0.7)` | Focused inputs, pressed toggles |

### Light mode
Page and content are near-white (`--surface-0: oklch(0.995 0.001 265)`); the sidebar and inspector
are a faint tint (`--surface-1: oklch(0.972 0.003 265)`), like a macOS source list. Accent shifts
to a deeper indigo (`oklch(0.50 0.21 265)`) for contrast. Check every screen in both modes.

### Severity and status colors (both modes)
| Meaning | Color | Value |
|---------|-------|-------|
| Critical / regressed / failing | Red | `oklch(0.58 0.22 25)` |
| High / modified / contested | Amber | `oklch(0.68 0.16 55)` |
| Medium / questioned / stale | Yellow | `oklch(0.72 0.14 85)` |
| Low | Blue | `oklch(0.58 0.14 250)` |
| Info / unverified / neutral | Gray | `oklch(0.55 0.01 265)` |
| Cleared / verified / passing / fixed | Green | `oklch(0.62 0.13 160)` |

Always rendered as an 8px dot plus a word (`SeverityDot`, `Dot`), never as a filled badge.

## Layout

### App shell
- Sidebar: 220px by default, drag its edge to resize (180-360px); collapses to a 60px icon rail
  with `⌘\`. `bg-surface-1`, hairline right border.
  Exactly six destinations: Today `/`, Model `/model`, Review `/review`, Changes `/changes` (diff
  mode, or once a fix review exists), Board `/issues`, Report `/report`. Active (including nested routes):
  `bg-accent-subtle text-accent`, no stripe. Footer: live status, `⌘K` hint, appearance toggle.
- Main area is exactly the viewport height; each pane scrolls on its own.

### Workspace pages (Model, Review, Changes, Board, Report)
`SplitView`: a slim `Toolbar` (title + one line of meta on the left, at most two actions on the
right), then source list | content | inspector. Panes are separated by hairlines. The inspector
appears only when something is selected; over a canvas it floats (`inspectorFloating`) so the
canvas keeps its size. Every pane edge (sidebar, list, inspector) is a `ResizeHandle`: drag to
resize, double-click to reset, arrow keys nudge; the hairline shows `border-emphasis` on hover.
Widths are CSS variables (`--w-<page>-list`, `--w-<page>-inspector`, `--w-sidebar`) remembered
per viewer and restored before first paint (`lib/pane-width.ts`).

### Document pages (Today, Changes overview)
One centered column, max 720-780px, generous top padding (56px), sections separated by whitespace
and hairline-bordered lists.

### Inspector
Eyebrow (caption: kind · context) → title (heading, semibold) → subtitle (signature in mono) →
actions (primary first) → sections, each a caption label over plain content, separated by a
hairline. Footer: the one-time "Claude can see your selection" hint.

## Components (`dashboard/components/ui/`)
- **Sidebar**, **SplitView** / **Toolbar** / **ScrollArea**, **Inspector** / **InspectorSection** /
  **InspectorField**
- **ListRow** / **ListGroupLabel**: 30-36px rows, leading glyph, title, optional caption line,
  trailing detail; selected = `bg-accent-subtle` + accent title; hover = `bg-surface-2`
- **SegmentedControl**: recessed `bg-surface-2` track, raised `bg-surface-0` segment with
  `shadow-sm` for the active one (not accent). At most one per view; filters are a search field plus
  one segmented control.
- **SearchField** (`/` focuses), **Button** (`primary` = accent fill, once per screen; `secondary`;
  `ghost`), **Kbd**, **Chip** (quiet; at most one per row), **SeverityDot** / **Dot**,
  **StateGlyph** (unread ○, read ◐, questioned ?, cleared ●), **RiskMeter**, **ProgressRing**,
  **EmptyState**, **Toast** (`useToast`, with Undo)
- **CodeViewer**: whole file, Solidity highlighting (`lib/solidity.ts`), selected range tinted
  with `--code-highlight`, line selection reported to the focus bridge. With `comments`
  (`useCodeComments`), a gutter `+` on hover and a "Comment on lines a-b" pill after a selection
  open an inline composer; comments render as hairline-bordered `bg-surface-1` bands under their
  code (sans text, one caption meta line, ghost actions: Edit, Write to source, Delete). **CodeReference**: clickable
  mono `file:line` that opens a code peek.
- **Code navigation** (Review code pane, backed by `.hex/xref.json` from `hex facts`): references
  are segments (`applyRefs`); holding Ctrl/⌘ underlines them. Ctrl/⌘-click or F12 goes to the
  definition (interface or virtual calls go where they run; several implementations open a small
  menu captioned override / same signature); Alt-click or ⌥F12 opens an inline **peek band**
  (`bg-surface-1`, `border-border-default`, header: name · file:line · via, then Open ↵ and Esc
  next to it, never right-aligned, since bands are as wide as the longest code line); on a
  declaration's own name, or ⇧F12, the **usages band** lists call sites or reads/writes, one row
  per line. A quiet **hover card** (450ms, no chips) shows signature, where it runs and NatSpec.
  Every jump is a browser history entry (`history.pushState` with our own state object, so Next
  syncs `useSearchParams`); the code header shows ← → and the walked **trail** (mono caption,
  chevrons, current step in `text-primary`). The landed line is tinted `--code-focus`.
- Kanban cards are the only bordered boxes: `bg-surface-1`, `border-border-subtle`,
  `rounded-lg`, title + one meta line (severity dot, id · source, at most one chip).
- Lists of prose items (Diane's open leads and questions) are rows split by hairlines
  (`divide-y`), each with a quiet dot, text clamped to three lines with Show more, and a caption
  line (source, actions on hover). Never a run-on block of paragraphs.
- Retired: FilterableTable, SortableTable, filled severity badges, KPI walls, Mermaid.

## Focus bridge
Selecting a function, card, diagram node, code range or invariant writes `.hex/focus.json`
(`POST /api/focus`, debounced via `lib/focus.ts`); the Claude Code session reads it with the Hex
MCP tool `hex_focus`. The watcher ignores `focus.json` so selection never triggers a refresh.

## Animations & Motion
- 200ms `--ease-out` fades/slides on interactive elements only (not universal)
- `.fade-in`, `.rise-in` (4px), `.slide-in` (8px, inspectors), `.stagger` (30ms steps)
- No persistent or looping animation, no background effects; respect `prefers-reduced-motion`

## Do NOT
- Use monospace fonts outside of code, file paths and signatures
- Use colored border-left/right stripes on cards or rows (>1px)
- Add gradient text
- Use bounce/elastic easing, pulsing or looping animation
- Use green (#00cc33) or neon accent colors
- Use glassmorphism/backdrop-blur decoratively
- Default to all-uppercase labels
- Nest cards, fill badges, or put more than one status chip on a row
- Use the accent for anything but selection and the primary action
- Add a second segmented control or a multi-column table to a primary view
