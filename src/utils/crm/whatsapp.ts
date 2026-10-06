import { fillWhatsappTemplate, whatsappUrl } from "@shared/crmWhatsapp";
import type { CrmTeamMember } from "@/types/crm";

/** {mittente}: il nome di chi è collegato, dal team del CRM (null se non c'è). */
export function crmSenderName(team: CrmTeamMember[], userId: string | null | undefined): string | null {
    return team.find(m => m.user_id === userId)?.display_name ?? null;
}

/**
 * Link wa.me col messaggio pronto per un contatto. Va aperto SUBITO nel
 * gestore del clic (prima di ogni await), altrimenti Safari lo blocca come
 * popup; la registrazione del contatto segue.
 */
export function crmWhatsappLink(
    phoneE164: string,
    template: string | null,
    values: { contactName: string | null; venueName: string | null; senderName: string | null }
): string {
    return whatsappUrl(phoneE164, template ? fillWhatsappTemplate(template, values) : null);
}
