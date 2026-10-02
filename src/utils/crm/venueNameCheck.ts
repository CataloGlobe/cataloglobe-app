import type { CrmEvent, CrmLead } from "@/types/crm";

/**
 * Il lead da decidere: l'ultimo tornato con un altro nome del locale, senza
 * scelta o con «Decido dopo», arrivato dopo l'ultimo «È lo stesso locale»
 * (quella scelta chiude anche le richieste prima) ed entrato dopo l'ultima
 * rinomina del locale (chi ha rinominato ha già deciso). Null se non ce n'è.
 *
 * ⚠️ SYNC con `crm_resolve_venue_name` (migration 20261002150000), che con la
 * stessa regola scrive l'etichetta `crm_venues.name_to_verify`.
 */
export function leadToVerify(leads: CrmLead[], events: CrmEvent[] = []): CrmLead | null {
    const lastSame = leads
        .filter(l => l.venue_name_check === "same")
        .reduce<string>((max, l) => (l.received_at > max ? l.received_at : max), "");
    const lastRename = events
        .filter(e => e.type === "venue_renamed")
        .reduce<string>((max, e) => (e.created_at > max ? e.created_at : max), "");
    const open = leads
        .filter(
            l =>
                (l.venue_name_match === "typo" || l.venue_name_match === "other") &&
                l.venue_name_check !== "same" &&
                l.venue_name_given &&
                l.received_at > lastSame &&
                l.created_at > lastRename
        )
        .sort(
            (a, b) =>
                b.received_at.localeCompare(a.received_at) || b.created_at.localeCompare(a.created_at)
        );
    return open[0] ?? null;
}
