// ⚠️ SYNC: questo file è duplicato. L'altra copia è in
// src/utils/leadValidation.ts. Le due copie devono restare
// identiche sotto questa intestazione (lo verifica src/tests/leadValidation.test.ts).

// Validazione del contatto dal form «Richiedi una demo» (landing di campagna).
// PURA e senza import: il telefono si normalizza con la funzione passata dal
// chiamante (`normalizePhoneToE164`, che esiste già nelle due copie FE ed
// Edge). Stesse regole nel form (messaggi inline) e nell'edge `submit-lead`
// (ultimo cancello, mai fidarsi del client).

export const LEAD_INTERESTS = ["menu", "prenotazioni", "ordini"] as const;
export type LeadInterest = (typeof LEAD_INTERESTS)[number];

export const LEAD_LIMITS = {
    name: 120,
    venueName: 160,
    phoneRaw: 40,
    email: 254,
    meta: 200,
    referrer: 500
} as const;

export type LeadField = "name" | "venueName" | "phone" | "email" | "consent" | "interests";

/** Codice d'errore per campo: il testo in italiano lo sceglie la UI. */
export type LeadFieldError = "required" | "too_long" | "invalid";

export type LeadInput = {
    name?: unknown;
    venueName?: unknown;
    phone?: unknown;
    email?: unknown;
    consent?: unknown;
    interests?: unknown;
};

export type LeadData = {
    name: string;
    venueName: string;
    /** E.164 (+39…). */
    phone: string;
    email: string | null;
    interests: LeadInterest[];
};

export type LeadValidation =
    | { ok: true; value: LeadData }
    | { ok: false; errors: Partial<Record<LeadField, LeadFieldError>> };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const asText = (v: unknown): string => (typeof v === "string" ? v.trim().replace(/\s+/g, " ") : "");

export function validateLead(
    input: LeadInput,
    normalizePhone: (raw: string) => string | null
): LeadValidation {
    const errors: Partial<Record<LeadField, LeadFieldError>> = {};

    const name = asText(input.name);
    if (!name) errors.name = "required";
    else if (name.length > LEAD_LIMITS.name) errors.name = "too_long";

    const venueName = asText(input.venueName);
    if (!venueName) errors.venueName = "required";
    else if (venueName.length > LEAD_LIMITS.venueName) errors.venueName = "too_long";

    const phoneRaw = asText(input.phone);
    let phone: string | null = null;
    if (!phoneRaw) errors.phone = "required";
    else if (phoneRaw.length > LEAD_LIMITS.phoneRaw) errors.phone = "too_long";
    else {
        phone = normalizePhone(phoneRaw);
        if (!phone) errors.phone = "invalid";
    }

    const emailRaw = asText(input.email).toLowerCase();
    if (emailRaw.length > LEAD_LIMITS.email) errors.email = "too_long";
    else if (emailRaw && !EMAIL_RE.test(emailRaw)) errors.email = "invalid";

    if (input.consent !== true) errors.consent = "required";

    let interests: LeadInterest[] = [];
    if (input.interests !== undefined && input.interests !== null) {
        const list = Array.isArray(input.interests) ? input.interests : null;
        if (!list || !list.every((i) => typeof i === "string" && (LEAD_INTERESTS as readonly string[]).includes(i))) {
            errors.interests = "invalid";
        } else {
            interests = LEAD_INTERESTS.filter((i) => list.includes(i));
        }
    }

    if (Object.keys(errors).length > 0 || !phone) return { ok: false, errors };
    return { ok: true, value: { name, venueName, phone, email: emailRaw || null, interests } };
}

/** Campo di contesto (utm, percorso, referrer): stringa accorciata o null. */
export function cleanLeadMeta(value: unknown, max: number = LEAD_LIMITS.meta): string | null {
    const text = asText(value);
    return text ? text.slice(0, max) : null;
}
