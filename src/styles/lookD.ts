/**
 * Interruttore della grafica nuova del back office, direzione D (VITE_BACKOFFICE_D).
 *
 * Deciso da Alex il 2026-10-14: acceso su staging, spento in produzione finché
 * non sono entrate tutte e cinque le PR della grafica; poi si toglie lo stile
 * vecchio. Letto in un posto solo: `main.tsx` mette `data-look="d"` sulla
 * radice e gli stili della D stanno dentro `@include look-d` (`_mixins.scss`).
 */
export const LOOK_D = import.meta.env.VITE_BACKOFFICE_D === "true";
