import type { V2FeaturedContent } from "@/types/resolvedCollections";
import { safeHttpHref } from "@/utils/sanitizeUrl";

/** True se il pulsante è «Prenota»: apre il form di prenotazione della sede, non un link. */
export function isReservationCta(block: V2FeaturedContent): boolean {
    return block.cta_action === "reservation";
}

/**
 * True se il contenuto in evidenza ha un pulsante d'azione da mostrare.
 * «Prenota» si mostra solo se la sede ha le prenotazioni attive (`reservationsEnabled`);
 * un link si mostra solo con un URL http(s) sicuro.
 */
export function hasFeaturedCta(block: V2FeaturedContent, reservationsEnabled = false): boolean {
    if (!block.cta_text) return false;
    if (isReservationCta(block)) return reservationsEnabled;
    return Boolean(safeHttpHref(block.cta_url));
}
