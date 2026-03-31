# Hex Design System & Style Guide

## Brand
- Product name: **Hex** (lowercase `hex` in CLI and code, title case `Hex` in docs)
- CLI command: `hex`
- Output directory: `.hex/`
- Dashboard package: `hex-dashboard`

## Typography
- **Font**: JetBrains Mono (Google Fonts) everywhere. No sans-serif.
- **Fallback stack**: `ui-monospace, 'Cascadia Code', 'SF Mono', monospace`
- **Scale**: display (32px/700), title (20px/600), heading (15px/500), body (13px/400), caption (11px/400)
- **Headers**: uppercase with wider letter-spacing for section/group labels
- **Tables**: body weight for data, medium weight for column headers

## Color Palette

### Dark Mode (default)
| Token | Value | Usage |
|-------|-------|-------|
| `--surface-0` | `#080808` | Page background |
| `--surface-1` | `#101010` | Cards, sidebar |
| `--surface-2` | `#181818` | Elevated surfaces, inputs |
| `--surface-3` | `#222222` | Hover states |
| `--text-primary` | `#aaaaaa` | Body text |
| `--text-secondary` | `#777777` | Secondary labels |
| `--text-tertiary` | `#555555` | Disabled, hints |
| `--accent` | `#00cc33` | Primary green (links, active states, borders) |
| `--accent-secondary` | `#00ff66` | Bright green (highlights, success confirmations) |
| `--accent-warm` | `#ffaa00` | Amber (warnings, secondary attention) |
| `--border-subtle` | `rgba(0,204,51,0.05)` | Faint dividers |
| `--border-default` | `rgba(0,204,51,0.15)` | Standard borders |
| `--border-emphasis` | `rgba(0,204,51,0.30)` | Active/focused borders |

### Severity Colors (both modes)
| Severity | Color | Hex |
|----------|-------|-----|
| Critical | Red | `#ff2200` |
| High | Amber | `#ffaa00` |
| Medium | Yellow | `#cccc00` |
| Low | Blue | `#0088cc` |
| Info | Gray | `#666666` |

### Light Mode (secondary)
Muted greens on off-white. `--accent: #008822`, surfaces start at `#f0f0f0`. Lower priority; dark mode is the primary experience.

## Layout Patterns

### Page Structure
Every data page follows this pattern:
1. **Page header**: title in heading size, optional description in text-secondary
2. **Summary cards row**: 3-5 KPI cards showing aggregated counts. Cards are clickable and act as filters for the table below.
3. **Detail table**: FilterableTable or SortableTable with the full dataset. Supports column sorting, filter pills, and expandable rows.

### Sidebar Navigation
- Fixed 200px width, `bg-surface-1`, right border `border-default`
- Groups labeled in uppercase caption text: RECON, ANALYSIS, REASONING, VISUAL, AI OPS, FINDINGS
- Active item: `border-l-2 border-l-accent bg-accent-subtle text-accent`
- Items prefixed with `>` on active/hover
- Footer: theme toggle + `Ctrl+K` command palette hint

### Cards
- Background: `bg-surface-1`
- Border: `border border-border-default`
- Border radius: `rounded-sm` (2px) for tight terminal feel
- Hover: `hex-glow` class (green box-shadow)
- Padding: `p-sp-4` standard

## Animations & Motion

### Principles
- Cinematic on first load, subtle after
- No persistent background effects (no scanlines, no matrix rain)
- All transitions: 200ms ease
- Prefer CSS-only animations

### Boot Sequence (first load)
- 4-second terminal typing animation
- Skippable (click/keypress)
- Respects `hex-boot-disabled` localStorage flag

### Micro-interactions
- `hex-glow`: green box-shadow on hover (`0 0 8px rgba(0,204,51,0.15)`)
- `hex-stagger`: children fade-in with 50ms staggered delay
- `hex-count-up`: KPI number scale-in animation
- Table rows: background transition on hover
- Page transitions: 200ms fade

## Component Conventions

### Tables
- Header row: uppercase, `text-text-tertiary`, wider letter-spacing
- Active filter pills: `bg-accent text-surface-0`
- Row hover: `bg-surface-3`
- Row dividers: `border-border-subtle`
- Expandable rows for detail content (no modal popups for inline data)

### Badges
- Severity badges use the severity color palette with `rounded-sm`
- Confidence badges: high/medium/low with color gradient
- All badges are compact: `px-1.5 py-0.5 text-caption`

### Code References
- Clickable `file:line` format
- Modal with dark terminal surface, green border
- Target lines highlighted with green tint
- Syntax highlighting via rehype-highlight

## Do NOT
- Use sans-serif fonts anywhere
- Use border-radius larger than 6px
- Add persistent animated backgrounds
- Use purple, pink, or pastel colors
- Default to light mode
- Add new pages without discussion (polish existing ones first)
- Use generic AI aesthetics (see banned patterns below)

### Banned Visual Patterns
- System font stacks (Arial, Inter, Roboto, Segoe UI)
- Purple gradients on white backgrounds
- Rounded pill buttons with gradient fills
- Drop shadows on white cards
- Generic blue accent colors
- Cookie-cutter card grid layouts without character
