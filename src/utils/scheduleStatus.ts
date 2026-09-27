/**
 * Stato di una regola di Programmazione: cinque stati, stessa priorità
 * ovunque venga mostrato (lista Programmazione, drawer di eliminazione
 * stile, altri call site futuri). Estratto dal blocco di classificazione
 * di Programming.tsx (una sola volta, non una derivazione per pagina).
 *
 * Ordine di valutazione — identico al blocco originale:
 * 1. disabilitata + config incompleta (isConfigDraft) → bozza
 * 2. disabilitata (senza altro motivo) → disabilitata
 * 3. abilitata ma portata zero (isZeroReach, vedi scheduleReach.ts) → bozza
 * 4. scaduta (endAt nel passato) → scaduta
 * 5. in finestra adesso → attiva, anche se un'altra regola più specifica la
 *    sovrascrive (§34.4: «Adesso» è la finestra, non la vittoria; chi perde
 *    lo dice la riga, «Sovrascritta da …»)
 * 6. altrimenti → programmata, cioè «non ancora»
 *
 * isActiveNow resta responsabilità del chiamante: è la finestra temporale
 * della regola stessa (vedi isRuleCurrentlyActive in ruleHelpers.ts).
 */

export type ScheduleStatus = "draft" | "active" | "scheduled" | "expired" | "disabled";

export interface ScheduleStatusInput {
    enabled: boolean;
    endAt: string | null;
    /** Config incompleta secondo la definizione del chiamante (es. nessun
     *  target, o payload di tipo mancante — vedi isLayoutRuleDraft). */
    isConfigDraft: boolean;
    /** Portata zero (Passo 4): target presente ma che non raggiunge nessuna
     *  sede reale in questo momento — vedi ruleReachesAnyActivity. */
    isZeroReach: boolean;
    isActiveNow: boolean;
    now?: Date;
}

export function deriveScheduleStatus(input: ScheduleStatusInput): ScheduleStatus {
    const now = input.now ?? new Date();

    if (!input.enabled) {
        return input.isConfigDraft ? "draft" : "disabled";
    }
    if (input.isZeroReach) return "draft";
    if (input.endAt && new Date(input.endAt) <= now) return "expired";
    if (input.isActiveNow) return "active";
    return "scheduled";
}
