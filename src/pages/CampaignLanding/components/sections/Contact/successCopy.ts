import { CONTACT } from "@/pages/CampaignLanding/content/landing";

/**
 * Testi della conferma dopo l'invio. Il nome è la prima parola del campo,
 * il telefono resta come l'ha scritto l'utente (solo trim, niente E.164).
 */
export type LeadSuccessCopy = { title: string; phone: string | null };

export function leadSuccessCopy(name: string, phone: string): LeadSuccessCopy {
    const firstName = name.trim().split(/\s+/)[0] ?? "";
    const typedPhone = phone.trim();
    return {
        title: firstName ? CONTACT.success.titleNamed(firstName) : CONTACT.success.title,
        phone: typedPhone || null
    };
}
