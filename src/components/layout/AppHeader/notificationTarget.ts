import type { Notification } from "@/services/supabase/notifications";

/**
 * Dove porta il click su una notifica.
 *
 * `reservation.new` (richiesta da gestire) e `reservation.auto_confirmed`
 * aprono le Prenotazioni **della sede** della prenotazione (§48.1): la coda
 * vive lì. La sede arriva da `data.activity_id` (la scrive `submit-reservation`);
 * senza, si ripiega su `/reservations`, che porta comunque dentro una sede.
 * Il deep link alla singola prenotazione è fuori: la coda la mostra in cima.
 */
export function resolveTargetPath(notification: Notification, fallbackTenantId: string | null): string | null {
    if (
        notification.event_type === "reservation.new" ||
        notification.event_type === "reservation.auto_confirmed"
    ) {
        const tenantId = notification.tenant_id ?? fallbackTenantId;
        if (!tenantId) return null;
        const activityId = notification.data?.activity_id;
        return typeof activityId === "string" && activityId.length > 0
            ? `/business/${tenantId}/locations/${activityId}/prenotazioni`
            : `/business/${tenantId}/reservations`;
    }
    // Risposta del supporto: qui il deep link al singolo thread serve davvero
    // — a differenza delle prenotazioni, la lista non mostra il contenuto, e
    // il messaggio da leggere è dentro la conversazione.
    if (notification.event_type === "support.reply") {
        const tenantId = notification.tenant_id ?? fallbackTenantId;
        const ticketId = notification.data?.ticket_id;
        if (tenantId && typeof ticketId === "string" && ticketId.length > 0) {
            return `/business/${tenantId}/support/${ticketId}`;
        }
        // `data` malformato o ticket_id assente: si ripiega sulla lista, che
        // è comunque il posto giusto. Meglio di un click che non fa nulla.
        if (tenantId) return `/business/${tenantId}/support`;
    }
    return null;
}
