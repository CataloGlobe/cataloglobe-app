import type { CrmLead } from "@/types/crm";

/**
 * Il lead da decidere: l'ultimo tornato con un altro nome del locale, senza
 * scelta o con «Decido dopo», arrivato dopo l'ultimo «È lo stesso locale»
 * (quella scelta chiude anche le richieste prima). Null se non ce n'è.
 */
export function leadToVerify(leads: CrmLead[]): CrmLead | null {
    const lastSame = leads
        .filter(l => l.venue_name_check === "same")
        .reduce<string>((max, l) => (l.received_at > max ? l.received_at : max), "");
    const open = leads
        .filter(
            l =>
                (l.venue_name_match === "typo" || l.venue_name_match === "other") &&
                l.venue_name_check !== "same" &&
                l.venue_name_given &&
                l.received_at > lastSame
        )
        .sort((a, b) => b.received_at.localeCompare(a.received_at));
    return open[0] ?? null;
}
