import type { V2ReservationGuestNote } from "@/types/reservationGuest";

/**
 * Etichette per ospite viste dall'elenco rubrica: l'unione dei tag di tutte
 * le sedi che chi guarda può leggere (FASE 5.3: i tag sono per sede,
 * l'elenco è dell'azienda). Senza doppioni, nell'ordine in cui compaiono.
 * Puro: nessuna rete, testabile.
 */
export function mergeGuestTags(notes: readonly V2ReservationGuestNote[]): ReadonlyMap<string, string[]> {
    const out = new Map<string, string[]>();
    for (const n of notes) {
        const cur = out.get(n.guest_id) ?? [];
        for (const t of n.tags) if (!cur.includes(t)) cur.push(t);
        if (cur.length > 0) out.set(n.guest_id, cur);
    }
    return out;
}
