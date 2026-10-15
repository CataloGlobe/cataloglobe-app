/**
 * Interruttore della grafica nuova del back office, direzione D (VITE_BACKOFFICE_D).
 *
 * Deciso da Alex il 2026-10-14: acceso su staging, spento in produzione finché
 * non sono entrate tutte le PR della grafica. Dal Visual Redesign 2, PR 12, è
 * acceso di suo: si spegne solo con `VITE_BACKOFFICE_D=false`. Lo stile
 * vecchio si toglie con una PR a parte. Letto in un posto solo: `main.tsx` mette `data-look="d"` sulla
 * radice e gli stili della D stanno dentro `@include look-d` (`_mixins.scss`).
 */
export const LOOK_D = import.meta.env.VITE_BACKOFFICE_D !== "false";

/**
 * Le pagine del back office, le sole con la grafica D. Le pagine dei clienti
 * (menù pubblico, prenotazioni, landing, stato, legali) restano fuori: la D ha
 * regole globali (carattere, sfondo, movimento ridotto) che non sono loro.
 */
const BACK_OFFICE = /^\/(admin|business|check-email|dashboard|dev|email-confirmed|forgot-password|invite|login|onboarding|reset-password|select-business|sign-up|verify-otp|workspace)(\/|$)/;

export const lookDOn = (path: string) => LOOK_D && BACK_OFFICE.test(path);

/** Le due curve della D, per framer-motion (in CSS: `--d-ease`, `--d-ease-move`). */
export const D_EASE = [0.23, 1, 0.32, 1] as const;
/** La molla con un piccolo rimbalzo: per ciò che si sposta o compare. */
export const D_EASE_MOVE = [0.34, 1.45, 0.64, 1] as const;
