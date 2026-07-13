# Product

## Register

product

## Users

Primary users are **restaurant and shop owners** — small-business operators, largely non-technical, often 40+, frequently working on a phone while standing in-store. They come to CataloGlobe to set up and maintain digital catalogs/menus and to run QR table-ordering, not to admire software. Their context is time-pressured and interruption-heavy: a quick edit between customers, a glance at the live orders board during service, an occasional deeper setup session (catalogs, styles, scheduling, team). Secondary users are managers/staff who live in the Orders board during a shift, so the operational surfaces must stay fast and glanceable even though the primary persona is the owner.

The job to be done: **publish and keep a catalog current, and see/act on table orders in real time** — with as little friction and as few decisions as possible.

## Product Purpose

CataloGlobe is a multi-tenant SaaS for building digital catalogs/menus and running QR-based table ordering. It is a **content-distribution engine**, not just a menu builder: catalogs, styles, and scheduling are decoupled so the same products can be published, restyled, and scheduled across locations. Owners manage products, catalogs, public pages, scheduling, and a live ordering workflow (customer scans QR → orders → admin dashboard updates live).

Success looks like: an owner sets up a catalog once and trusts it stays correct; a daily edit takes seconds and never risks the wrong thing; staff run a full service off the Orders board without confusion or missed comande. The interface earns trust by being calm, legible, and predictable — the tool disappears into the task.

## Brand Personality

**Calm, trustworthy, dependable** — quiet confidence over flash. The voice (Italian throughout) is clear and reassuring, never jargon-heavy or salesy. Restrained color with the indigo brand accent reserved for primary actions, current selection, and state — not decoration. Generous, legible layout in the Stripe-dashboard tradition: trustworthy data density without clutter. Delight is saved for small moments (a confirmed save, a smooth realtime update), never spread across the page. The interface should feel like a dependable business tool an owner can rely on mid-service without a second thought.

## Anti-references

- **Generic AI/SaaS template**: no gradient hero-metric cards, no purple-gradient decoration, no identical icon-card grids, no tiny tracked-uppercase eyebrows above every section. (See the skill's absolute bans — enforce them.)
- **Cluttered legacy POS**: no dense unlabeled toolbars, tiny fonts, gray-on-gray chrome, or 2010-era enterprise-dashboard heaviness. Density must stay legible and purposeful.
- **Over-animated**: no bouncy/elastic transitions, no decorative motion, no page-load choreography. Motion conveys state (150–250ms), nothing more.
- Not consumer/toy-like: this is a business tool, not a candy-colored app.

## Design Principles

1. **The tool disappears into the task.** Owners are mid-service; every screen serves the one job on it. Earned familiarity beats novelty — standard affordances, consistent vocabulary screen to screen.
2. **Calm by default, accent with intent.** Restrained neutrals carry the surface; the indigo brand color marks primary action, selection, and state only. No decorative saturation, no color on inactive states.
3. **Legible density.** Show what the owner/staff needs at a glance without clutter — Stripe-style trustworthy density, never POS crowding. Larger targets and body sizes because users are 40+ on phones in-store.
4. **Predictable, reversible, trustworthy.** Confirm destructive actions, reflect state honestly, never risk the wrong edit. Realtime updates must feel dependable, not jumpy.
5. **Motion is feedback, not decoration.** State changes get 150–250ms transitions; nothing choreographs the page. Every motion has a reduced-motion alternative.

## Accessibility & Inclusion

Target **WCAG AA, tuned for older eyes and in-store phone use**. Non-negotiables:
- Body text ≥4.5:1 contrast (large/bold text ≥3:1); placeholder text held to the same 4.5:1 — no washed-out muted gray. Verify against both light and dark themes.
- Comfortable body sizes and generous tap targets (≥44px) for a 40+ audience operating on phones during service.
- Visible focus rings and full keyboard navigation on every interactive control.
- `prefers-reduced-motion: reduce` honored on every animation (crossfade or instant fallback).
- Semantic state color paired with a non-color cue (icon/label) — don't rely on hue alone (amber/green/red states already in the theme).
