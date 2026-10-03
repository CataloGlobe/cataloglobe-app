/**
 * Dove portano gli avvisi operativi (`OperationalAlerts`) e quando tacciono.
 * Puro: niente router, niente DB.
 *
 * Due avvisi, due viste della sede da cui vengono:
 * - `tables` (cameriere, conto): la vista dei tavoli, che li mostra già sulla
 *   tessera;
 * - `orders` (nuove comande): la board di Comande.
 *
 * L'avviso tace solo se quella vista è in primo piano **sulla stessa sede**:
 * chi guarda i tavoli di Garbagnate deve sentire il conto chiesto a Varedo.
 */
export type AlertView = "tables" | "orders";

function sedeBase(businessId: string, activityId: string): string {
    return `/business/${businessId}/locations/${activityId}`;
}

/** Il «Vai» del toast. Senza sede nota, la rotta d'azienda porta all'ultima usata. */
export function alertTarget(businessId: string, activityId: string | null | undefined, view: AlertView): string {
    if (!activityId) {
        return view === "tables" ? `/business/${businessId}/orders?tab=tavoli` : `/business/${businessId}/orders`;
    }
    const base = sedeBase(businessId, activityId);
    return view === "tables" ? `${base}/comande?tab=tavoli` : `${base}/comande`;
}

/** `true` se chi guarda ha già davanti la vista che mostra l'avviso. */
export function isAlertViewOpen(
    pathname: string,
    search: string,
    businessId: string,
    activityId: string | null | undefined,
    view: AlertView
): boolean {
    if (!activityId) return false;
    if (pathname.replace(/\/$/, "") !== `${sedeBase(businessId, activityId)}/comande`) return false;
    // Comande senza `?tab=` è la board.
    const tab = new URLSearchParams(search).get("tab") ?? "comande";
    return view === "tables" ? tab === "tavoli" : tab === "comande";
}
