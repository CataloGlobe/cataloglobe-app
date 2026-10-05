/**
 * I gesti della lista lead al telefono (canvas U8b): verso destra si invia la
 * bozza dell'agente, verso sinistra si rimanda a domani. Sempre con «Annulla»
 * per 5 secondi. Puro.
 */
import type { CrmAgentDraftRow, CrmNextStep } from "@/types/crm";

export type LeadSwipe = "send" | "snooze";

/** Il tempo per «Annulla» prima che il gesto parta davvero. */
export const SWIPE_UNDO_MS = 5000;

/** Quanto trascinare perché il gesto valga: un terzo della riga, almeno 80 px. */
export function swipeThreshold(width: number): number {
    return Math.max(80, width / 3);
}

/** Il gesto alla fine del trascinamento; verso destra solo se c'è una bozza. */
export function swipeOutcome(dx: number, width: number, canSend: boolean): LeadSwipe | null {
    const limit = swipeThreshold(width);
    if (dx >= limit && canSend) return "send";
    if (dx <= -limit) return "snooze";
    return null;
}

/** La bozza aperta di ogni locale (la più vecchia, come in Home). */
export function openDraftByVenue(drafts: CrmAgentDraftRow[]): Map<string, string> {
    const out = new Map<string, string>();
    const pending = drafts.filter(d => d.status === "pending").sort((a, b) => a.created_at.localeCompare(b.created_at));
    for (const d of pending) if (!out.has(d.venue_id)) out.set(d.venue_id, d.id);
    return out;
}

/**
 * I locali rimandati col gesto: il passo è un rimando e scade dopo oggi.
 * Tornano in «Da lavorare» il giorno del passo. Un passo scritto dalla scheda
 * non nasconde niente.
 */
export function snoozedVenueIds(steps: CrmNextStep[], todayKey: string): Set<string> {
    return new Set(steps.filter(s => s.snoozed && s.due_on !== null && s.due_on > todayKey).map(s => s.venue_id));
}

/**
 * La scadenza del rimando: domani, o quella del passo se è più in là. Così il
 * gesto non anticipa la scadenza scelta da un altro; il passo resta di chi
 * lo aveva.
 */
export function snoozeDueOn(existing: CrmNextStep | undefined, tomorrowKey: string): string {
    return existing?.due_on && existing.due_on > tomorrowKey ? existing.due_on : tomorrowKey;
}

/** Il passo scritto dal gesto: quello che c'era, o «Riprendere il lead». */
export function snoozeStepText(existing: CrmNextStep | undefined): string {
    return existing?.step.trim() || "Riprendere il lead";
}
