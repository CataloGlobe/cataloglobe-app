// Versioni correnti dei documenti legali (privacy policy, termini di servizio).
//
// UN SOLO FILE, non una coppia ⚠️ SYNC: l'Edge lo importa come
// `../_shared/consentVersions.ts`, il frontend come `@shared/consentVersions`
// (via `src/config/consentVersions.ts`). Per restare importabile da entrambi
// il file non importa niente.
//
// Aggiornare qui quando privacy policy o termini di servizio vengono rivisti.
// La data corrisponde alla data di pubblicazione del documento su /legal/*.
// Cambiare `privacy` chiede di nuovo il consenso al sign-up e cambia la
// versione registrata sui contatti della landing (`submit-lead`).

export const CURRENT_CONSENT_VERSIONS = {
    privacy: '2026-06-19',
    terms: '2026-04-12',
} as const;
