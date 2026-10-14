/**
 * Interruttore della grafica nuova del back office, direzione D (VITE_BACKOFFICE_D).
 *
 * Deciso da Alex il 2026-10-14: acceso su staging, spento in produzione finché
 * non sono entrate tutte e cinque le PR della grafica; poi si toglie lo stile
 * vecchio. Letto in un posto solo: `main.tsx` mette `data-look="d"` sulla
 * radice e gli stili della D stanno dentro `@include look-d` (`_mixins.scss`).
 */
export const LOOK_D = import.meta.env.VITE_BACKOFFICE_D === "true";

/** Le due curve della D, per framer-motion (in CSS: `--d-ease`, `--d-ease-move`). */
export const D_EASE = [0.23, 1, 0.32, 1] as const;
/** La molla con un piccolo rimbalzo: per ciò che si sposta o compare. */
export const D_EASE_MOVE = [0.34, 1.45, 0.64, 1] as const;
