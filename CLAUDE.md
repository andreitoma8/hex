# Hex Design System & Style Guide

## Brand
- Product name: **Hex** (lowercase `hex` in CLI and code, title case `Hex` in docs)
- CLI command: `hex`
- Output directory: `.hex/`
- Dashboard package: `hex-dashboard`

## Typography
- **Display/body**: Manrope (Google Fonts), variable weight 200-800
- **Code only**: JetBrains Mono (file paths, code snippets, code blocks)
- **Fallback (sans)**: `system-ui, -apple-system, sans-serif`
- **Fallback (mono)**: `ui-monospace, 'SF Mono', monospace`
- **Scale**: display (28px/600), title (20px/600), heading (15px/500), body (14px/400), caption (12px/400)
- **Section headers**: sentence case, medium weight (not uppercase)

## Color Palette

### Dark Mode (primary)
Surfaces are blue-tinted (hue 265), not pure black. Built with OKLCH for perceptual uniformity.

| Token | Value | Usage |
|-------|-------|-------|
| `--surface-0` | `oklch(0.13 0.005 265)` | Page background |
| `--surface-1` | `oklch(0.17 0.006 265)` | Cards, sidebar |
| `--surface-2` | `oklch(0.21 0.006 265)` | Elevated surfaces, inputs |
| `--surface-3` | `oklch(0.26 0.006 265)` | Hover states |
| `--text-primary` | `oklch(0.93 0.005 265)` | Body text |
| `--text-secondary` | `oklch(0.65 0.01 265)` | Secondary labels |
| `--text-tertiary` | `oklch(0.48 0.008 265)` | Disabled, hints |
| `--accent` | `oklch(0.58 0.19 265)` | Indigo (links, active states) |
| `--accent-subtle` | `oklch(0.58 0.19 265 / 0.10)` | Hover tint |
| `--accent-secondary` | `oklch(0.68 0.14 265)` | Lighter indigo |
| `--border-subtle` | `oklch(0.25 0.005 265 / 0.5)` | Faint dividers |
| `--border-default` | `oklch(0.30 0.006 265 / 0.6)` | Standard borders |
| `--border-emphasis` | `oklch(0.40 0.01 265 / 0.7)` | Active borders |

### Severity Colors (both modes)
| Severity | Color | Value |
|----------|-------|-------|
| Critical | Red | `oklch(0.58 0.22 25)` |
| High | Amber | `oklch(0.68 0.16 55)` |
| Medium | Yellow | `oklch(0.72 0.14 85)` |
| Low | Blue | `oklch(0.58 0.14 250)` |
| Info | Gray | `oklch(0.55 0.01 265)` |

### Light Mode (secondary)
Surfaces start at near-white. Accent shifts to deeper indigo for contrast. Lower priority; dark mode is the primary experience.

## Layout Patterns

### Page Structure
1. **Page title**: title size, semibold
2. **Summary metrics** (where applicable): grid of stat cards
3. **Detail table**: FilterableTable or SortableTable with the full dataset

### Sidebar Navigation
- Fixed 220px width, `bg-surface-1`, right border `border-subtle`
- Groups labeled in sentence case, caption size
- Active item: `bg-accent-subtle text-accent` (no border-left stripe)
- Footer: theme toggle + `⌘K` hint

### Cards
- Background: `bg-surface-1`
- Border: `border border-border-subtle`
- Border radius: `rounded-lg` (12px)
- Hover: `border-border-default bg-surface-2`
- Padding: `p-4` to `p-6`

## Animations & Motion

### Principles
- Subtle, functional, not decorative
- All transitions: 200ms ease on interactive elements only (not universal)
- No persistent background effects

### Utilities
- `.stagger`: children fade-in with 30ms staggered delay
- `.scale-in`: KPI number scale animation (0.92 to 1, 350ms)

## Component Conventions

### Tables
- Header row: caption size, text-tertiary
- Row hover: `bg-surface-3`
- Row dividers: `border-border-subtle`
- Filter pills: rounded-md, `bg-accent text-surface-0` when active

### Badges
- Severity badges use the severity color palette
- All badges: `rounded-md`, `px-2.5 py-1 text-caption`

### Code References
- Clickable `file:line` format in monospace
- Modal with clean surface, subtle shadow
- Highlighted lines: `bg-accent/10`

## Do NOT
- Use monospace fonts outside of code blocks
- Use colored border-left/right stripes on cards (>1px)
- Add gradient text
- Use bounce/elastic easing
- Use green (#00cc33) or neon accent colors
- Use glassmorphism/backdrop-blur decoratively
- Default to all-uppercase labels
