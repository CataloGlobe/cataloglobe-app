// =============================================================================
// metaLeadFields — un lead del modulo Meta, dai campi all'ingresso del CRM
// =============================================================================
//
// Codice puro senza import, condiviso FE↔Edge via alias `@shared/`:
//   * import CSV dal Centro lead (src/utils/crm/metaCsv.ts): le colonne del file;
//   * webhook in tempo reale (crm-meta-webhook): i campi della Graph API
//     (field_data + id, created_time, ad_id, ad_name, campaign_name, form_name).
// Le due strade passano dalla stessa mappatura, con le stesse chiavi: un lead
// arrivato dal webhook e poi reimportato dal CSV è lo stesso (source_ref =
// id del lead Meta).
//
// La normalizzazione del telefono resta fuori: ha una libreria con import
// diversi tra Vite e Deno (phoneNormalize.ts, ⚠️ SYNC).
// =============================================================================

/** Colonne di sistema di Meta: non sono risposte del modulo. */
export const META_FIXED_COLUMNS = new Set([
    "id",
    "created_time",
    "ad_id",
    "ad_name",
    "adset_id",
    "adset_name",
    "campaign_id",
    "campaign_name",
    "form_id",
    "form_name",
    "is_organic",
    "platform",
    "lead_status",
    "inbox_url"
]);

export const META_NAME_COLUMNS = ["full_name", "nome_e_cognome", "nome_completo", "nome"];
export const META_FIRST_NAME_COLUMNS = ["first_name", "nome"];
export const META_LAST_NAME_COLUMNS = ["last_name", "cognome"];
export const META_PHONE_COLUMNS = ["phone_number", "phone", "numero_di_telefono", "telefono"];
export const META_EMAIL_COLUMNS = ["email", "e-mail", "indirizzo_email"];
export const META_CITY_COLUMNS = ["city", "città", "citta"];

/** Domanda personalizzata sul nome del locale: si riconosce dal testo. */
const VENUE_PATTERN = /(company|business|locale|attivit|ristorante|nome_del|insegna)/;

/**
 * Colonne del contatto: hanno già i loro campi (nome, telefono), quindi non
 * finiscono tra le risposte del modulo, che la scheda mostrerebbe due volte.
 */
export const META_CONTACT_COLUMNS = new Set([
    ...META_NAME_COLUMNS,
    ...META_FIRST_NAME_COLUMNS,
    ...META_LAST_NAME_COLUMNS,
    ...META_PHONE_COLUMNS
]);

/** La domanda sul nome del locale, riconosciuta dal testo dell'intestazione. */
export function isMetaVenueColumn(header: string): boolean {
    return !META_FIXED_COLUMNS.has(header) && VENUE_PATTERN.test(header);
}

/** Intestazione o nome del campo in forma confrontabile ("Full Name" → "full_name"). */
export function normalizeMetaHeader(header: string): string {
    return header.trim().toLowerCase().replace(/\s+/g, "_");
}

/** Toglie i prefissi di Meta ("l:123", "p:+39…", "ag:…"). */
export function stripMetaPrefix(value: string): string {
    return value.trim().replace(/^[a-z]{1,3}:/, "").trim();
}

function pick(record: Map<string, string>, candidates: string[]): string {
    for (const key of candidates) {
        const value = record.get(key);
        if (value && value.trim()) return value.trim();
    }
    return "";
}

function toIsoOrNull(value: string): string | null {
    if (!value) return null;
    const time = Date.parse(value);
    return Number.isNaN(time) ? null : new Date(time).toISOString();
}

/** Un lead Meta pronto per `crm_ingest_lead`, tranne telefono e chiave. */
export interface MetaLeadFields {
    /** Id del lead Meta senza prefisso; vuoto se l'export non lo porta. */
    leadId: string;
    /** created_time com'è scritto, per la chiave dei lead senza id. */
    rawCreated: string;
    /** Telefono com'è scritto, da normalizzare. */
    rawPhone: string;
    name: string;
    /** Vuoto se il modulo non chiede il locale: il DB segna «Locale da completare». */
    venueName: string;
    email: string | null;
    city: string | null;
    formAnswers: Record<string, string>;
    adId: string | null;
    adName: string | null;
    campaign: string | null;
    consentAt: string | null;
    consentText: string;
    receivedAt: string | null;
}

// Limiti delle colonne di crm_leads / crm_contacts (CHECK in 20261001120000):
// un valore oltre il limite fa fallire crm_ingest_lead e, dal webhook, il lead
// non entrerebbe mai (Meta ritenta, sempre con lo stesso errore).
const MAX_AD_TEXT = 300;
const MAX_REF = 200;
const MAX_EMAIL = 254;

/** Testo libero (nome dell'annuncio, campagna): accorciato al limite. */
function clip(value: string, max: number): string | null {
    return value ? value.slice(0, max) : null;
}

/** Identificativi ed email: troncarli li renderebbe sbagliati, oltre il limite si scartano. */
function withinLimit(value: string, max: number): string | null {
    return value && value.length <= max ? value : null;
}

/**
 * I campi di un lead Meta. `record` ha le chiavi già normalizzate
 * (`normalizeMetaHeader`), `headers` le stesse chiavi nell'ordine del modulo.
 */
export function mapMetaLeadRecord(record: Map<string, string>, headers: string[]): MetaLeadFields {
    const venueColumn = headers.find(isMetaVenueColumn);
    const fullName =
        pick(record, META_NAME_COLUMNS) ||
        [pick(record, META_FIRST_NAME_COLUMNS), pick(record, META_LAST_NAME_COLUMNS)]
            .filter(Boolean)
            .join(" ");

    const formAnswers: Record<string, string> = {};
    for (const header of headers) {
        const value = (record.get(header) ?? "").trim();
        if (!value || META_FIXED_COLUMNS.has(header) || META_CONTACT_COLUMNS.has(header)) continue;
        if (header === venueColumn) continue;
        formAnswers[header] = value;
    }

    const createdAt = toIsoOrNull(record.get("created_time") ?? "");
    const formName = (record.get("form_name") ?? "").trim();

    return {
        leadId: stripMetaPrefix(record.get("id") ?? ""),
        rawCreated: (record.get("created_time") ?? "").trim(),
        rawPhone: stripMetaPrefix(pick(record, META_PHONE_COLUMNS)),
        name: fullName || "Senza nome",
        venueName: venueColumn ? (record.get(venueColumn) ?? "").trim() : "",
        email: withinLimit(pick(record, META_EMAIL_COLUMNS), MAX_EMAIL),
        city: pick(record, META_CITY_COLUMNS) || null,
        formAnswers,
        adId: withinLimit(stripMetaPrefix(record.get("ad_id") ?? ""), MAX_REF),
        adName: clip((record.get("ad_name") ?? "").trim(), MAX_AD_TEXT),
        campaign: clip((record.get("campaign_name") ?? "").trim(), MAX_AD_TEXT),
        consentAt: createdAt,
        consentText: formName ? `Modulo Meta «${formName}»` : "Modulo Meta",
        receivedAt: createdAt
    };
}
