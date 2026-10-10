// Versioni correnti dei documenti legali (privacy policy, termini di servizio).
//
// UN SOLO FILE, non una coppia ⚠️ SYNC: l'Edge lo importa come
// `../_shared/consentVersions.ts`, il frontend come `@shared/consentVersions`
// (via `src/config/consentVersions.ts`). Per restare importabile da entrambi
// il file non importa niente.
//
// Aggiornare qui quando privacy policy o termini di servizio vengono rivisti.
// La data corrisponde alla data di pubblicazione del documento su /legal/*.
// Cambiare `privacy` chiede di nuovo il consenso al sign-up.

export const CURRENT_CONSENT_VERSIONS = {
    privacy: '2026-06-19',
    terms: '2026-04-12',
} as const;

// Data di pubblicazione del testo di /legal/privacy («Ultimo aggiornamento»).
// Può essere più recente di CURRENT_CONSENT_VERSIONS.privacy: una revisione
// che non chiede di nuovo il consenso al sign-up cambia solo questa. È la
// versione registrata sui contatti della landing (`submit-lead`), perché è il
// testo che il form linka.
export const PRIVACY_PUBLISHED_AT = '2026-10-10';
