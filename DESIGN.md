---
name: CataloGlobe Admin
description: Calm, trustworthy multi-tenant admin for digital catalogs and live QR table-ordering.
colors:
  indigo-primary: "#6366f1"
  indigo-primary-hover: "#4648c6"
  slate-bg: "#f8fafc"
  surface: "#ffffff"
  border: "#e2e8f0"
  hover-bg: "#f1f5f9"
  ink: "#0f172a"
  neutral-secondary: "#e6ebf0"
  amber-warning: "#f59e0b"
  emerald-success: "#10b981"
  red-danger: "#dc2626"
typography:
  display:
    fontFamily: "Inter, system-ui, Avenir, Helvetica, Arial, sans-serif"
    fontSize: "3rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "normal"
  headline:
    fontFamily: "Inter, system-ui, Avenir, Helvetica, Arial, sans-serif"
    fontSize: "1.75rem"
    fontWeight: 600
    lineHeight: 1.2
  title:
    fontFamily: "Inter, system-ui, Avenir, Helvetica, Arial, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: 1.3
  body:
    fontFamily: "Inter, system-ui, Avenir, Helvetica, Arial, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "Inter, system-ui, Avenir, Helvetica, Arial, sans-serif"
    fontSize: "0.85rem"
    fontWeight: 500
    lineHeight: 1
    letterSpacing: "0.05em"
rounded:
  badge: "3px"
  sm: "6px"
  md: "8px"
  lg: "12px"
  pill: "999px"
components:
  button-primary:
    backgroundColor: "{colors.indigo-primary}"
    textColor: "#ffffff"
    rounded: "{rounded.md}"
    padding: "0.55rem 0.9rem"
    typography: "{typography.label}"
  button-primary-hover:
    backgroundColor: "{colors.indigo-primary-hover}"
    textColor: "#ffffff"
  button-secondary:
    backgroundColor: "{colors.neutral-secondary}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "0.55rem 0.9rem"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "0.55rem 0.9rem"
  button-danger:
    backgroundColor: "{colors.red-danger}"
    textColor: "#ffffff"
    rounded: "{rounded.md}"
    padding: "0.55rem 0.9rem"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "0.62rem 0.85rem"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "1.5rem"
  badge:
    backgroundColor: "{colors.neutral-secondary}"
    textColor: "{colors.ink}"
    rounded: "{rounded.badge}"
    padding: "2px 6px"
  status-badge:
    rounded: "{rounded.pill}"
    padding: "4px 10px"
    typography: "{typography.label}"
  datatable-row:
    height: "56px"
    padding: "12px 24px"
---

# Design System: CataloGlobe Admin

> Scope: the **admin app** (register: product). The customer-facing public catalog uses a separate, per-tenant configurable token system (`--pub-*`, `src/features/public/`) documented elsewhere. Nothing here describes the public page.

## 1. Overview

**Creative North Star: "The Quiet Operator"**

CataloGlobe Admin is a dependable business tool that disappears into the task. Its users are restaurant and shop owners — largely non-technical, often 40+, frequently on a phone in-store between customers — plus staff who live in the live Orders board during a shift. The interface earns trust by being calm, legible, and predictable: neutrals carry the surface, the indigo brand color appears only where action, selection, or state actually happen. Nothing shouts. The tool is the servant, not the show.

The system runs on a **slate-neutral base** (`#f8fafc` light, `#0f172a` dark) with a single **indigo accent** (`#6366f1` light, `#2563eb` dark). It is fully theme-aware: every token has a light and dark value, both AA-legible. Density is Stripe-dashboard density — trustworthy information at a glance, never legacy-POS crowding. Type is one family (Inter) tuned across a fixed rem scale, not fluid clamps. Motion is short (150–250ms) and conveys state only; there is no page-load choreography.

This system explicitly rejects the **generic AI/SaaS template** (gradient hero-metric cards, purple-gradient decoration, identical icon-card grids, tiny tracked-uppercase eyebrows), the **cluttered legacy POS** (gray-on-gray chrome, unlabeled dense toolbars, 2010-era enterprise heaviness), and **over-animation** (bouncy/elastic transitions, decorative motion). It is a business tool, never toy-like.

**Key Characteristics:**
- Slate neutrals carry the surface; indigo marks action/selection/state only.
- One type family (Inter), fixed rem scale, no fluid heading clamps.
- Theme-aware: light + dark, both AA, tuned for older eyes on phones.
- Soft, shallow elevation; depth grows with layer distance from the page.
- Motion is feedback (150–250ms), never decoration or choreography.

## 2. Colors

A restrained slate palette with a single indigo accent and a conventional amber/emerald/red semantic set. Both themes are canonical; the frontmatter carries light values, and each token below lists its dark counterpart.

### Primary
- **Indigo Action** (`#6366f1` light / `#2563eb` dark): The one brand accent. Reserved for primary buttons, the current selection, active nav, focus rings, and state indicators. Never decoration.
- **Indigo Action Hover** (`#4648c6` light / `#1d4ed8` dark): Hover/pressed state of the indigo action. This is the canonical hover — it is the `--brand-primary-hover` theme token. *(Known drift: `Button.module.scss` currently hardcodes `#4f46e5` for its own hover; align it to this token.)*
- **Indigo Soft** (`rgba(99,102,241,0.1)` light / `rgba(37,99,235,0.18)` dark): Tinted fill for selected rows, soft badges, and quiet emphasis surfaces.

### Neutral
- **Slate Background** (`#f8fafc` light / `#0f172a` dark): The page canvas — the second neutral layer beneath content surfaces.
- **Surface** (`#ffffff` light / `#1e293b` dark): Cards, drawers, tables, panels — the content plane that sits above the background.
- **Border** (`#e2e8f0` light / `#1f2a3a` dark): Hairline dividers, card and input strokes. Always 1px unless a control specifies otherwise.
- **Hover Background** (`#f1f5f9` light / `#334155` dark): Row and control hover fill; also the DataTable header band.
- **Ink** (`#0f172a` light / `#f9fafb` dark): Primary text. Base document color is `#212529`; headings deepen toward ink.
- **Neutral Secondary** (`#e6ebf0`): Secondary-button and neutral-badge fill. *(Hardcoded, not a theme token — documented as the real value in use.)*

### Semantic
- **Amber Warning** (`#f59e0b`, ramp `#fffbeb → #b45309`): Warnings, pending/suspended states.
- **Emerald Success** (`#10b981`, StatusBadge `#D1FAE5` / `#065F46`): Success, published/active states.
- **Red Danger** (`#dc2626`, focus ring `rgba(220,38,38,0.2)`): Destructive actions, errors, danger buttons.

### Named Rules
**The One Accent Rule.** Indigo is the *only* accent. It marks action, current selection, and state — nothing decorative. On any given screen it should touch ≤10% of the surface. Everything else is slate.

**The No-Color-On-Inactive Rule.** Inactive, disabled, and resting elements are neutral. Saturation is a signal; spending it on idle chrome makes the real signals unreadable.

## 3. Typography

**Display / Body Font:** Inter (with `system-ui, Avenir, Helvetica, Arial, sans-serif`)
**Label Font:** Inter (same family, weight + tracking shift)

**Character:** One well-tuned humanist sans carries every role — headings, titles, labels, body, and dense table data. Product UI does not need display/body pairing; a single family keeps the surface calm and consistent screen to screen. *(Note: Sora is loaded in `index.html` but not applied anywhere in the admin; `_typography.scss` heading rules fall back to an unloaded "Outfit" — both are drift to clean up. Inter is the real, canonical admin face.)*

### Hierarchy
- **Display** (700, 3rem desktop / 2rem mobile, lh 1.2): Rare — page-level hero numerals or the largest overview figure. Not a per-section reflex.
- **Headline** (600, 1.75rem, lh 1.2): Page titles in the PageHeader.
- **Title** (600, 1.5rem / 1.25rem, lh 1.3): Section and card headings.
- **Body** (400, 1rem, lh 1.6): Default reading text. Cap prose at 65–75ch; table data may run denser.
- **Body Small** (400, 0.875rem, lh 1.5): Secondary text, helper copy, dense panels.
- **Label** (500, 0.85rem, letter-spacing 0.05em): Buttons and control labels. DataTable column headers run 12px/600, tracking 0.04em, uppercase, opacity 0.72.

### Named Rules
**The One Family Rule.** Inter does everything. Do not introduce a second UI face for "display" flavor — no serif headings, no Sora/Outfit in labels or data. Contrast comes from weight and size, not from a second family.

**The Fixed-Scale Rule.** Headings use fixed rem steps, never fluid `clamp()`. Users view at consistent DPI; a heading that shrinks inside a sidebar looks worse, not better.

## 4. Elevation

Soft, shallow, and purposeful. Surfaces are near-flat at rest — a card carries only a whisper of shadow (`0 2px 6px rgba(0,0,0,0.03)`). Depth is a function of **layer distance from the page**: a card barely lifts, a dropdown lifts more, a drawer more still, a modal most. Shadows convey layering and state (hover, focus, floating), never decoration. In dark mode, shadows deepen toward pure black (`.4`–`.55` alpha) because tinted shadows disappear on dark surfaces.

### Shadow Vocabulary
- **Card rest** (`0 2px 6px rgba(0,0,0,0.03)`) → **hover** (`0 4px 10px rgba(0,0,0,0.08)`): Content surfaces; hover adds a `translateY(-2px)` lift.
- **Focus ring** (`0 0 0 3px rgba(99,102,241,0.25)`; danger `0 0 0 3px rgba(220,38,38,0.2)`): Keyboard focus and active input. Always visible, never removed.
- **Menu / dropdown** (`0 10px 38px -10px rgba(22,23,24,.35), 0 10px 20px -15px rgba(22,23,24,.2)`): Floating popovers.
- **Tooltip** (`0 4px 16px rgba(0,0,0,0.12)`) · **Toast** (`0 8px 24px rgba(0,0,0,0.15)`).
- **Drawer** (`-4px 0 24px -4px rgba(0,0,0,0.1)`) · **Modal** (`0 20px 60px rgba(0,0,0,.18), 0 2px 6px rgba(0,0,0,.05)`).

### Named Rules
**The Flat-At-Rest Rule.** Surfaces are flat (or near-flat) at rest. Elevation is a response to layering and state — hover, focus, floating — not a default decoration on every card.

## 5. Components

Familiar, consistent, state-complete. Every interactive component ships default, hover, focus, active, disabled — no half sets. The same button shape and form-control vocabulary repeat screen to screen; consistency is the virtue, delight is saved for moments.

### Buttons
- **Shape:** Gently rounded (8px). Weight 500, line-height 1, no fixed height — vertical rhythm comes from padding (sm `.4rem/.65rem` @.8rem · md `.55rem/.9rem` @.9rem · lg `.7rem/1.1rem` @1rem).
- **Primary:** `var(--brand-primary)` fill, white text; hover → `#4648c6` (theme token). Transition 0.2s ease on background/color/box-shadow/border-color.
- **Secondary:** `#e6ebf0` fill, ink text (hover `#dbe2e8`). **Outline:** 1px brand border, transparent fill. **Ghost:** transparent, ink text. **Danger:** `#dc2626` fill, white text.
- **Focus:** `0 0 0 3px rgba(99,102,241,0.25)` ring. **Disabled:** opacity 0.6, `pointer-events: none`.

### Cards / Containers
- **Corner:** 12px. **Background:** surface (`--card-bg`). **Border:** 1px `--border`. **Padding:** 1.5rem.
- **Shadow:** rest `0 2px 6px rgba(0,0,0,0.03)`; hover `0 4px 10px rgba(0,0,0,0.08)` + `translateY(-2px)`. Never nest cards.

### Inputs / Fields
- **Text input:** 8px radius, **1.5px** `--border` stroke, surface fill, padding `.62rem/.85rem`, font `.95rem`. **Select:** same but **1px** stroke, right padding 2rem for the chevron.
- **Focus:** brand border + `0 0 0 3px rgba(99,102,241,0.25)` ring. **Disabled:** opacity 0.6, hover-bg fill. **Error:** `#dc2626` border/text.

### Badges
- **Badge:** 3px radius, `2px/6px` padding; brand / `#e6ebf0` / success / danger / warning fills.
- **StatusBadge:** 999px pill, `4px/10px`, 12px/500, 6px status dot. Semantic pairs — success `#D1FAE5`/`#065F46`, neutral `#F3F4F6`/`#6B7280`, warning amber, info indigo-soft, pending amber-50. Color is always paired with a dot + label, never hue alone.

### DataTable
- **Header:** sticky, `--hover-bg` band, min-height 44px, labels 12px/600, tracking 0.04em, uppercase, opacity 0.72.
- **Row:** cell min-height 56px, padding `12px/24px`, 1px bottom border, hover `--hover-bg`, transition 0.18s. Table wrapper 1px border, 12px radius; footer min-height 48px.

### Navigation & Drawers
- **Sidebar** is the only nav chrome — no top navbar (see PROIBITO). Active item uses indigo/indigo-soft; rest is neutral.
- **SystemDrawer** (right-side, all CRUD): default 520px, mobile 100%, shadow `-4px 0 24px -4px rgba(0,0,0,0.1)`, slide `cubic-bezier(0.4,0,0.2,1)`. Base `Drawer` default 420px. All CRUD is a right-side drawer — never a centered modal.

## 6. Do's and Don'ts

### Do:
- **Do** carry surfaces on slate neutrals and spend indigo only on action, current selection, and state (≤10% of a screen).
- **Do** keep body text ≥4.5:1 (large/bold ≥3:1) in **both** themes; hold placeholder text to the same 4.5:1 — no washed-out muted gray.
- **Do** size for older eyes on phones: comfortable body sizes, tap targets ≥44px.
- **Do** use one family (Inter) at fixed rem steps; get contrast from weight and size.
- **Do** keep motion to 150–250ms state feedback, with a `prefers-reduced-motion` crossfade/instant fallback on every animation.
- **Do** pair every semantic color with a non-color cue (dot, icon, label).
- **Do** put all CRUD in a right-side SystemDrawer; ship every control with default/hover/focus/active/disabled states.

### Don't:
- **Don't** ship the **generic AI/SaaS template**: no gradient hero-metric cards, no purple-gradient decoration, no identical icon-card grids, no tiny tracked-uppercase eyebrows above sections.
- **Don't** drift toward the **cluttered legacy POS**: no gray-on-gray chrome, unlabeled dense toolbars, or 2010-era enterprise heaviness.
- **Don't** **over-animate**: no bouncy/elastic easing, no decorative motion, no page-load choreography.
- **Don't** use `background-clip: text` gradient text, `border-left/right` > 1px colored side-stripes, or glassmorphism as a default surface. (Absolute bans.)
- **Don't** introduce a second UI font (no Sora/Outfit/serif in labels or data), a fluid `clamp()` heading, or a color not already in this palette.
- **Don't** put color or full-saturation accents on inactive/disabled states.
- **Don't** use a centered modal for CRUD, add a top navbar, or write CSS inline — use SCSS Modules and the right-side drawer.
