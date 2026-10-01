import { fillWhatsappTemplate, whatsappUrl } from "@shared/crmWhatsapp";

/**
 * Link wa.me col messaggio pronto per un contatto. Va aperto SUBITO nel
 * gestore del clic (prima di ogni await), altrimenti Safari lo blocca come
 * popup; la registrazione del contatto segue.
 */
export function crmWhatsappLink(
    phoneE164: string,
    template: string | null,
    values: { contactName: string | null; venueName: string }
): string {
    return whatsappUrl(phoneE164, template ? fillWhatsappTemplate(template, values) : null);
}
