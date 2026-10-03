import type { CrmLead } from "@/types/crm";
import { META_CONTACT_COLUMNS, isMetaVenueColumn } from "@shared/metaLeadFields";
import { CRM_TECHNICAL_ANSWER_KEYS } from "@shared/crmTelegram";

/** Chiavi che hanno una riga loro, con un'etichetta italiana. */
const OWN_ROW_KEYS = new Set(["email", "phone_raw"]);

export interface LeadAnswerRow {
    label: string;
    value: string;
}

function humanize(key: string): string {
    const text = key.replace(/_/g, " ").trim();
    return text ? text.charAt(0).toUpperCase() + text.slice(1) : key;
}

/**
 * Cosa ha scritto la persona in una richiesta, nell'ordine utile a chi la
 * chiama: nome, locale, email, telefono scritto male, interessi, poi le
 * altre risposte del modulo. Niente campi tecnici (decisione di Alex del
 * 2026-10-02).
 */
export function leadAnswerRows(lead: CrmLead): LeadAnswerRow[] {
    const answers = lead.form_answers ?? {};
    const text = (value: unknown) => (value === null || value === undefined ? "" : String(value).trim());
    const rows: LeadAnswerRow[] = [];

    if (lead.contact_name_given) rows.push({ label: "Nome", value: lead.contact_name_given });
    if (lead.venue_name_given) {
        rows.push({ label: "Locale", value: lead.venue_name_given });
    } else if (lead.source === "meta_form") {
        rows.push({ label: "Locale", value: "Il modulo Meta non lo chiede" });
    }
    if (text(answers.email)) rows.push({ label: "Email", value: text(answers.email) });
    if (text(answers.phone_raw)) {
        rows.push({ label: "Telefono scritto (non valido)", value: text(answers.phone_raw) });
    }
    if (lead.interests.length > 0) rows.push({ label: "Interessi", value: lead.interests.join(", ") });

    // I lead Meta importati prima del 2026-10-02 hanno nome, telefono e locale
    // anche tra le risposte: stanno già sopra (il telefono nei Contatti).
    const isMeta = lead.source === "meta_form";
    for (const [key, value] of Object.entries(answers)) {
        if (CRM_TECHNICAL_ANSWER_KEYS.has(key) || OWN_ROW_KEYS.has(key) || !text(value)) continue;
        if (isMeta && (META_CONTACT_COLUMNS.has(key) || isMetaVenueColumn(key))) continue;
        rows.push({ label: humanize(key), value: text(value) });
    }
    return rows;
}
