// ---------------------------------------------------------------------------
// Profilo del customer Stripe costruito dai dati fiscali del tenant.
//
// Unica fonte per stripe-checkout (pre-fill al checkout) e
// update-billing-details (riallineamento quando i dati cambiano da
// Impostazioni): le due strade devono scrivere sul customer esattamente gli
// stessi valori, altrimenti fattura e anagrafica divergono.
//
// Il DB resta la fonte di verita'. Nessuna funzione qui logga valori fiscali:
// solo campo, lunghezza (clamp) o classe dell'errore Stripe (code, type, status).
// ---------------------------------------------------------------------------

import {
    clampForStripe,
    clampMetadata,
    STRIPE_CUSTOMER_DESCRIPTION_MAX,
    STRIPE_CUSTOMER_NAME_MAX
} from "./stripeLimits.ts";

export type TenantFiscal = {
    legal_entity_type?: string | null;
    legal_name?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    fiscal_code?: string | null;
    vat_number?: string | null;
    codice_destinatario?: string | null;
    pec?: string | null;
    address?: string | null;
    street_number?: string | null;
    postal_code?: string | null;
    city?: string | null;
    province?: string | null;
    country?: string | null;
};

/** Colonne `tenants` lette per costruire il profilo (select PostgREST). */
export const TENANT_FISCAL_COLUMNS =
    "legal_entity_type, legal_name, vat_number, first_name, last_name, fiscal_code, codice_destinatario, pec, address, street_number, postal_code, city, province, country";

/** Chiavi fiscali scritte in `customer.metadata` (oltre a `tenant_id`). */
export const FISCAL_METADATA_KEYS = [
    "legal_entity_type",
    "legal_name",
    "first_name",
    "last_name",
    "fiscal_code",
    "vat_number",
    "codice_destinatario",
    "pec"
] as const;

function clean(v: unknown): string {
    return typeof v === "string" ? v.trim() : "";
}

/** Customer name: legal_name, else "first last". Undefined when empty. */
export function buildCustomerName(t: TenantFiscal): string | undefined {
    const legal = clean(t.legal_name);
    if (legal) return legal;
    const full = `${clean(t.first_name)} ${clean(t.last_name)}`.trim();
    return full || undefined;
}

/** Customer address from tenant legal address. Undefined when nothing usable. */
export function buildCustomerAddress(t: TenantFiscal): Record<string, string> | undefined {
    const line1 = [clean(t.address), clean(t.street_number)].filter(Boolean).join(" ");
    const postalCode = clean(t.postal_code);
    const city = clean(t.city);
    const state = clean(t.province);
    const country = clean(t.country) || "IT";

    if (!line1 && !postalCode && !city && !state) return undefined;

    const address: Record<string, string> = { country };
    if (line1) address.line1 = line1;
    if (postalCode) address.postal_code = postalCode;
    if (city) address.city = city;
    if (state) address.state = state;
    return address;
}

/** EU VAT value: country-prefixed VAT (e.g. "IT01234567897"). Null when absent. */
export function buildEuVatValue(vat?: string | null, country?: string | null): string | null {
    const raw = clean(vat).toUpperCase().replace(/\s/g, "");
    if (!raw) return null;
    if (/^[A-Z]{2}/.test(raw)) return raw; // already country-prefixed
    const cc = (clean(country).toUpperCase() || "IT").slice(0, 2);
    return `${cc}${raw}`;
}

/** Stripe customer metadata from the tenant fiscal record. Empty keys omitted. */
export function buildCustomerMetadata(tenantId: string, t: TenantFiscal): Record<string, string> {
    const meta: Record<string, string> = { tenant_id: tenantId };
    for (const key of FISCAL_METADATA_KEYS) {
        const v = clean(t[key]);
        if (v) meta[key] = v;
    }
    return meta;
}

/** Human-readable customer description, e.g. "Trattoria Da Mario S.r.l. · Milano (societa)". */
export function buildCustomerDescription(t: TenantFiscal): string | undefined {
    const base = clean(t.legal_name) || `${clean(t.first_name)} ${clean(t.last_name)}`.trim();
    const city = clean(t.city);
    const type = clean(t.legal_entity_type);

    let desc = base;
    if (city) desc += `${desc ? " · " : ""}${city}`;
    if (type) desc += `${desc ? " " : ""}(${type})`;
    desc = desc.trim();
    return desc || undefined;
}

export type StripeCustomerProfile = {
    name?: string;
    address?: Record<string, string>;
    description?: string;
    metadata: Record<string, string>;
    euVatValue: string | null;
};

/**
 * Profilo completo gia' tagliato ai limiti Stripe: un campo fiscale troppo
 * lungo (ragione sociale incollata male) farebbe fallire create e update con 400.
 * Campi vuoti → undefined (create e update li lasciano come sono).
 */
export function buildStripeCustomerProfile(tenantId: string, t: TenantFiscal): StripeCustomerProfile {
    const name = buildCustomerName(t);
    const description = buildCustomerDescription(t);
    return {
        name: name ? clampForStripe(name, STRIPE_CUSTOMER_NAME_MAX, "customer.name") : undefined,
        address: buildCustomerAddress(t),
        description: description
            ? clampForStripe(description, STRIPE_CUSTOMER_DESCRIPTION_MAX, "customer.description")
            : undefined,
        metadata: clampMetadata(buildCustomerMetadata(tenantId, t)),
        euVatValue: buildEuVatValue(t.vat_number, t.country)
    };
}

/**
 * Parametri `customers.update` per riallineare il customer a un profilo
 * fiscale cambiato. A differenza del pre-fill di checkout, un campo svuotato
 * nel DB va svuotato anche su Stripe: stringa vuota = unset (name, address,
 * description, singola chiave metadata). Stripe fa merge dei metadata, quindi
 * `user_id` (scritto da checkout e transfer ownership) resta intatto.
 * NON contiene `email` ne' `metadata.user_id`: seguono l'owner, non i dati
 * fiscali, e chi modifica i dati fiscali puo' essere un admin.
 */
export function buildCustomerProfileUpdate(tenantId: string, t: TenantFiscal): {
    name: string;
    address: Record<string, string> | "";
    description: string;
    preferred_locales: string[];
    metadata: Record<string, string>;
} {
    const profile = buildStripeCustomerProfile(tenantId, t);
    const metadata: Record<string, string> = {};
    for (const key of FISCAL_METADATA_KEYS) metadata[key] = "";
    Object.assign(metadata, profile.metadata);
    return {
        name: profile.name ?? "",
        address: profile.address ?? "",
        description: profile.description ?? "",
        preferred_locales: ["it"],
        metadata
    };
}

// --- Stripe calls (best-effort, non-throwing) -------------------------------

/** Sottoinsieme strutturale del client Stripe usato qui (testabile senza SDK). */
export type StripeCustomersApi = {
    customers: {
        update(id: string, params: Record<string, unknown>): Promise<unknown>;
        listTaxIds(id: string, params: { limit: number }): Promise<{ data: Array<{ id: string; type?: string | null; value?: string | null }> }>;
        createTaxId(id: string, params: { type: string; value: string }): Promise<unknown>;
        deleteTaxId(id: string, taxId: string): Promise<unknown>;
    };
};

type StripeErrorClass = { code?: string; type?: string; statusCode?: number };

function errorClass(err: unknown): StripeErrorClass {
    const e = err as StripeErrorClass | null;
    return { code: e?.code, type: e?.type, statusCode: e?.statusCode };
}

export type SyncTaxIdResult = "unchanged" | "updated" | "removed" | "customer_missing" | "error";

/**
 * Porta i tax id `eu_vat` del customer a esattamente `value`:
 * crea il nuovo se manca, poi cancella ogni `eu_vat` diverso (Stripe copia in
 * fattura TUTTI i tax id del customer, quindi una P.IVA vecchia finirebbe sul
 * documento fiscale). `value` null → cancella tutti gli `eu_vat`.
 * I tax id di altro tipo non vengono toccati.
 *
 * Il create va prima del delete: se Stripe rifiuta il nuovo valore, i vecchi
 * vengono comunque rimossi (sono sbagliati), ma non si resta senza tax id per
 * un errore transitorio a meta' strada tra delete e create.
 *
 * Non lancia mai. Log con solo la classe dell'errore: i messaggi Stripe
 * echeggiano il valore inviato.
 */
export async function syncCustomerTaxId(
    stripe: StripeCustomersApi,
    customerId: string,
    value: string | null,
    context: Record<string, unknown> = {}
): Promise<SyncTaxIdResult> {
    const target = value ? value.toUpperCase() : null;
    let existing: Array<{ id: string; type?: string | null; value?: string | null }>;
    try {
        existing = (await stripe.customers.listTaxIds(customerId, { limit: 100 })).data;
    } catch (err) {
        const cls = errorClass(err);
        const missing = cls.code === "resource_missing";
        console.warn(JSON.stringify({
            event: missing ? "stripe_tax_id_sync_customer_missing" : "stripe_tax_id_sync_failed",
            step: "list",
            customer_id: customerId,
            ...cls,
            ...context
        }));
        return missing ? "customer_missing" : "error";
    }

    const euVat = existing.filter(t => t.type === "eu_vat");
    const stale = euVat.filter(t => clean(t.value).toUpperCase() !== target);
    const hasTarget = target !== null && euVat.some(t => clean(t.value).toUpperCase() === target);

    let failed = false;
    let changed = false;

    if (target !== null && !hasTarget) {
        try {
            await stripe.customers.createTaxId(customerId, { type: "eu_vat", value: target });
            changed = true;
        } catch (err) {
            failed = true;
            console.warn(JSON.stringify({
                event: "stripe_tax_id_sync_failed",
                step: "create",
                customer_id: customerId,
                ...errorClass(err),
                ...context
            }));
        }
    }

    for (const t of stale) {
        try {
            await stripe.customers.deleteTaxId(customerId, t.id);
            changed = true;
        } catch (err) {
            failed = true;
            console.warn(JSON.stringify({
                event: "stripe_tax_id_sync_failed",
                step: "delete",
                customer_id: customerId,
                ...errorClass(err),
                ...context
            }));
        }
    }

    if (failed) return "error";
    if (!changed) return "unchanged";
    return target === null ? "removed" : "updated";
}

export type SyncCustomerProfileResult = "updated" | "customer_missing" | "error";

/**
 * Riallinea name, address, description, locale, metadata fiscali e tax id del
 * customer al profilo fiscale del tenant. Non tocca email ne' metadata.user_id.
 * Non lancia mai: il salvataggio dei dati fiscali e' gia' avvenuto nel DB.
 */
export async function syncStripeCustomerProfile(
    stripe: StripeCustomersApi,
    customerId: string,
    tenantId: string,
    fiscal: TenantFiscal,
    context: Record<string, unknown> = {}
): Promise<SyncCustomerProfileResult> {
    let profileFailed = false;
    try {
        await stripe.customers.update(customerId, buildCustomerProfileUpdate(tenantId, fiscal));
    } catch (err) {
        const cls = errorClass(err);
        if (cls.code === "resource_missing") {
            console.warn(JSON.stringify({
                event: "stripe_customer_profile_sync_missing",
                customer_id: customerId,
                ...context
            }));
            return "customer_missing";
        }
        profileFailed = true;
        console.error(JSON.stringify({
            event: "stripe_customer_profile_sync_failed",
            customer_id: customerId,
            ...cls,
            ...context
        }));
    }

    const taxResult = await syncCustomerTaxId(
        stripe,
        customerId,
        buildEuVatValue(fiscal.vat_number, fiscal.country),
        context
    );
    if (taxResult === "customer_missing") return "customer_missing";
    if (profileFailed || taxResult === "error") return "error";
    return "updated";
}
