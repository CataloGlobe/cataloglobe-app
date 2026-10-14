---
name: CataloGlobe Admin (direction D)
description: Warm, friendly multi-tenant admin for digital catalogs and live QR table-ordering, on a lilac canvas with white cards.
colors:
  bg-lilac: "#f1effb"
  surface: "#ffffff"
  ink: "#1d1840"
  muted: "#59547c"
  side-muted: "#6d678f"
  brand: "#6a5cf5"
  brand-deep: "#3d2fc0"
  warm: "#ee5f3f"
  good: "#047857"
  focus: "#4a4de0"
  status-new: "#2f8fe0"
  status-work: "#e09a1a"
  status-ready: "#1f9d6b"
typography:
  page-title:
    fontFamily: "Bricolage Grotesque, Figtree, system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 700
    letterSpacing: "-0.015em"
  pane-title:
    fontFamily: "Bricolage Grotesque, Figtree, system-ui, sans-serif"
    fontSize: "18px"
    fontWeight: 700
  number:
    fontFamily: "Bricolage Grotesque, Figtree, system-ui, sans-serif"
    fontSize: "26px"
    fontWeight: 700
  body:
    fontFamily: "Figtree, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "13.5px"
    fontWeight: 500
    lineHeight: 1.45
  control:
    fontFamily: "Figtree, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "13px"
    fontWeight: 600
  label:
    fontFamily: "Figtree, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "10.5px"
    fontWeight: 700
    letterSpacing: "0.08em"
rounded:
  tag: "8px"
  control: "16px"
  side: "24px"
  card: "28px"
  pill: "999px"
components:
  button-primary:
    backgroundColor: "{colors.brand}"
    textColor: "#ffffff"
    rounded: "{rounded.pill}"
    height: "38px"
    typography: "{typography.control}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    height: "38px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.muted}"
    rounded: "{rounded.pill}"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    height: "38px"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
    padding: "22px"
  status-tag:
    rounded: "{rounded.tag}"
    padding: "2px 8px"
---

# Design System: CataloGlobe Admin (direction D)

> Scope: the **admin app** (register: product). The customer-facing public catalog uses its own per-tenant token system (`--pub-*`, `src/features/public/`). Nothing here describes the public page.

> Source of truth: the artifact «Back office, direzione D» v28 and the page «Le scelte della direzione D», approved by Alex on 2026-10-14. Direction D ships behind `VITE_BACKOFFICE_D` (`src/styles/lookD.ts`), five PRs. With the switch off the app keeps the previous system («The Quiet Operator»: slate neutrals, single indigo accent, Inter, light and dark themes), still in `_theme.scss`, until a separate PR removes it after PR 5.

## 1. Overview

**Creative North Star: "The Friendly Counter"**

The back office of a restaurant should feel like the counter of a good place: warm, tidy, quick to read between two customers. Its users are owners (often non-technical, often 40+, often on a phone) and staff during a shift. Direction D keeps the calm and the legibility of the old system but gives it a face: a lilac canvas, white cards with large radii and an indigo-tinted shadow, a display face for titles and numbers, one coral for what needs attention now. Every page answers a question in words first ("Ultimi 30 giorni: va meglio del mese prima"), then shows the numbers.

**Key Characteristics:**
- Lilac canvas (`#f1effb`), white cards at 28px radius, soft indigo shadow, no borders on cards.
- Two families: Bricolage Grotesque for titles and numbers, Figtree for everything else.
- One brand violet for action and selection; coral (`--d-warm`) only for "look at this now".
- Pills for controls (buttons 38px, 44px under 1024), 16px radius for fields.
- Motion with a small spring on entrances (`--d-ease-move`), quick and plain on exits; `prefers-reduced-motion` turns everything to 1ms.
- Light only: the dark theme is off in direction D (decided 2026-10-14).

## 2. Colors

All values live in `src/styles/_look-d.scss` (`--d-*`), the only place with hex values for D. The tokens of today (`--bg`, `--brand-primary`, `--radius-*`, `--shadow-*`, `--font-sans`…) are remapped there, so pages not yet redesigned already take the D family.

### Primary
- **Brand** (`#6a5cf5`): primary buttons, the selected segment, active states, chart accents.
- **Brand Deep** (`#3d2fc0`): text on soft fills (selected tab, current nav item, links), hover of the primary.
- **Soft / Soft 2** (brand at 10% / 18% on white): selected tab, highlighted rows, tag fills.

### Neutral
- **Background** (`#f1effb`) and **Side** (brand 9% on the background) for the sidebar card.
- **Surface** (`#ffffff`): cards, panes, menus, the selected nav item.
- **Ink** (`#1d1840`) for text, **Muted** (`#59547c`) for secondary text (4.5:1 on white and on the lilac), **Side Muted** (`#6d678f`) for sidebar labels.
- **Line** (muted at 16%) for dividers; **Field Line** (muted at 30%) for input strokes.

### Semantic
- **Warm** (`#ee5f3f`): the unread dot, a figure that got worse, destructive actions, "waiting" states.
- **Good** (`#047857`): a figure that got better.
- **Service states**, one color one meaning: new `#2f8fe0`, in progress `#e09a1a`, ready `#1f9d6b`, waiting ink `#b0391c`, old = muted 13%. Each has a soft fill and an ink (`--d-s-*-soft`, `--d-s-*-ink`).
- **Tints** for the five voices (Andamento, Com'è andata): `--d-tint-1…5`.

### Named Rules
**The One Warm Rule.** Coral is never decoration: it means "this needs you now". If everything is coral, nothing is.

**The No-Color-On-Inactive Rule.** Resting chrome is ink and muted; saturation marks action, selection and state.

## 3. Typography

**Display / Numbers:** Bricolage Grotesque (600/700/800, self-hosted in `public/fonts/app/`).
**Body / UI:** Figtree (400-700, `public/fonts/app-d.css`).

Sizes come from one scale, `src/styles/_d-type.scss`, used by role with `@include d-type(role)` inside `@include look-d`:
- **page-title** 20/700, display, -0.015em: the title in the title bar.
- **pane-title** 18/700: pane and dialog titles. **card-name** 15/700 display: names on cards.
- **nav** 13.5/500, **control** 13/600, **body-s** 13/500, **small** 12/500, **hint** 11.5/500.
- **label** 10.5/700, 0.08em uppercase; **head** 11/700, 0.06em uppercase: section labels in menus and panels.
- **Numbers** `--d-num-size` 26px (22px under 640), answers `--d-answer-size` 32px.

### Named Rules
**The Two Faces Rule.** Bricolage only for titles and numbers; any running text, label or control is Figtree.

## 4. Elevation

Cards float on the lilac with one indigo-tinted shadow; depth grows with layer distance.
- **Card** `--d-shadow`: `0 2px 0 rgba(61,47,192,.06), 0 18px 40px -18px rgba(61,47,192,.22)`.
- **Pop** `--d-shadow-pop` for menus and dropdowns; **Pane** `--d-shadow-pane` for the detail pane and drawers (from the left edge); **Modal** `--d-shadow-modal`.
- Veil under dialogs and drawers: `rgba(20,20,50,.34)`, no blur.

## 5. Components

### Buttons
- Pills. Primary: brand fill, white text. Secondary: white with a line border and the card shadow. Ghost: transparent, muted text. Icon buttons are round at the control height.
- Heights `--d-ctl` 38px and `--d-ctl-s` 32px; both 44px under 1024. `:active` scales to .97.

### Cards / Containers
- 28px radius, white, `--d-shadow`, no border, padding `--d-pad` 22px, gap `--d-gap` 18px. Never nest cards.

### Inputs, Select, Menu
- Fields 16px radius, field line stroke; focus: brand border plus a 4px soft ring.
- Menus: white, 16px radius, pop shadow, rows at 60% of the control radius; destructive item in coral. They enter with the spring.

### Segmented control and tabs
- Segmented: a white pill track with a sliding thumb (brand). Title-bar tabs: muted text, the selected one brand-deep on soft.

### Shell
- **Sidebar**: a lilac card 224 wide (rail 68), 12px from the window edges, 24px radius. Current item white with brand-deep text. A round 26px button on the card edge collapses it. In the rail, hovering a section opens a violet panel with its name and its parts.
- **Account**: at the bottom of the sidebar; the menu shows who you are with the role, the company card with «Cambia», the company pages filtered by permission, then «Tu» (account, support) and «Esci».
- **Title bar**: transparent on the lilac, page title, tabs, the location pill («Sede») and a round white bell with a coral dot.
- **Frame** (from 1024 up): as tall as the window; the title bar stays, only the content scrolls; the detail pane is a third column, 12px from top and bottom, `clamp(350px, 29%, 440px)`.
- **Phone** (under 861): the sidebar becomes a card at the top (logo, sections scrolling sideways, avatar); panes and drawers go full screen.

### Overlays
- Dialogs 400 wide, 28px radius. Drawers slide from the right with the spring, rounded on the left. Toasts: a dark indigo pill at the bottom centre, with «Annulla» when the action can be undone.

## 6. Do's and Don'ts

### Do:
- **Do** put every D style inside `@include look-d` and every hex value in `_look-d.scss`; the app with the switch off must stay identical.
- **Do** compare each PR side by side with the v28 artifact at 1440, 820 and 390 before calling it ready.
- **Do** answer in words before showing numbers; keep body text at 4.5:1 or better.
- **Do** keep tap targets at 44px under 1024 and respect `prefers-reduced-motion`.
- **Do** animate only `transform` and `opacity` (the design-system budget counts width, height, margin and padding transitions).
- **Do** put all CRUD in the right-side drawer.

### Don't:
- **Don't** add a top navbar on desktop: on the phone, direction D uses the top card of the v28.
- **Don't** use coral or the brand fill as decoration, or gradients on cards.
- **Don't** introduce a third font, or Bricolage in running text.
- **Don't** add a dark theme for D until it is designed.
- **Don't** write CSS inline: SCSS Modules only.
