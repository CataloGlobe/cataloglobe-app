// Conservazione dei contatti della landing (`public.leads`), logica pura.
//
// ⚠️ SYNC: l'informativa privacy (src/pages/Legal/PrivacyPolicyPage.tsx,
// Sezioni 02 e 05) dichiara «12 mesi dall'invio per chi non diventa cliente».
// Cambiare qui significa cambiare lì.

export const LEAD_RETENTION_MONTHS = 12;

/** Status che NON si cancella: chi è diventato cliente. */
export const LEAD_KEPT_STATUS = "won";

/**
 * Soglia: i contatti creati prima di questo istante vanno cancellati.
 * Mesi di calendario in UTC; su un giorno che il mese d'arrivo non ha
 * (29 febbraio) JavaScript scivola al primo del mese dopo, cioè si conserva
 * un giorno in più, mai uno in meno.
 */
export function leadRetentionCutoff(now: Date, months: number = LEAD_RETENTION_MONTHS): Date {
    const cutoff = new Date(now.getTime());
    cutoff.setUTCMonth(cutoff.getUTCMonth() - months);
    return cutoff;
}
