// =============================================================================
// metaWebhook — webhook `leadgen` di Meta (puro, zero import)
// =============================================================================
//
// Usato da crm-meta-webhook e provato in metaWebhook.test.ts (Vitest).
// `crypto.subtle` è globale sia in Deno sia nel browser e in Node.
//
//   * verifyMetaSignature: Meta firma il corpo grezzo della POST con l'app
//     secret, header `X-Hub-Signature-256: sha256=<hex>`. Si confronta a tempo
//     costante, sui byte ricevuti (mai sul JSON riserializzato).
//   * extractLeadgenEvents: dal corpo, gli id dei lead da leggere. Il webhook
//     porta solo gli id: i dati si chiedono alla Graph API.
//   * graphLeadToRecord: il lead della Graph API nella stessa forma di una
//     riga del CSV, così passa da `mapMetaLeadRecord` come l'import.
//   * appSecretProof: `appsecret_proof` delle chiamate Graph (HMAC del token
//     con l'app secret), richiesto se l'app ha «Require App Secret».
// =============================================================================

async function hmacSha256Hex(secret: string, message: Uint8Array | string): Promise<string> {
    const key = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
    );
    const data = typeof message === "string" ? new TextEncoder().encode(message) : message;
    const signature = await crypto.subtle.sign("HMAC", key, data);
    return Array.from(new Uint8Array(signature), byte => byte.toString(16).padStart(2, "0")).join("");
}

/** Firma di Meta sul corpo grezzo; false anche con header assente o malformato. */
export async function verifyMetaSignature(
    rawBody: Uint8Array,
    header: string | null,
    appSecret: string
): Promise<boolean> {
    if (!header || !appSecret) return false;
    const received = header.trim().toLowerCase();
    if (!/^sha256=[0-9a-f]{64}$/.test(received)) return false;
    const expected = `sha256=${await hmacSha256Hex(appSecret, rawBody)}`;
    let diff = 0;
    for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ received.charCodeAt(i);
    return diff === 0;
}

export function appSecretProof(accessToken: string, appSecret: string): Promise<string> {
    return hmacSha256Hex(appSecret, accessToken);
}

/** Un lead annunciato dal webhook. */
export interface LeadgenEvent {
    leadgenId: string;
    formId: string | null;
    pageId: string | null;
    adId: string | null;
}

function idOrNull(value: unknown): string | null {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
    return null;
}

/**
 * Gli eventi `leadgen` del corpo (`object: "page"`), senza doppioni. Gli
 * altri campi della Pagina, se mai iscritti, si ignorano.
 */
export function extractLeadgenEvents(payload: unknown): LeadgenEvent[] {
    if (!payload || typeof payload !== "object") return [];
    const body = payload as { object?: unknown; entry?: unknown };
    if (body.object !== "page" || !Array.isArray(body.entry)) return [];

    const events: LeadgenEvent[] = [];
    const seen = new Set<string>();
    for (const entry of body.entry) {
        const changes = (entry as { changes?: unknown })?.changes;
        if (!Array.isArray(changes)) continue;
        for (const change of changes) {
            const { field, value } = (change ?? {}) as { field?: unknown; value?: Record<string, unknown> };
            if (field !== "leadgen" || !value || typeof value !== "object") continue;
            const leadgenId = idOrNull(value.leadgen_id);
            if (!leadgenId || seen.has(leadgenId)) continue;
            seen.add(leadgenId);
            events.push({
                leadgenId,
                formId: idOrNull(value.form_id),
                pageId: idOrNull(value.page_id),
                adId: idOrNull(value.ad_id)
            });
        }
    }
    return events;
}

/** Campi del lead chiesti alla Graph API. */
export const GRAPH_LEAD_FIELDS = [
    "id",
    "created_time",
    "field_data",
    "ad_id",
    "ad_name",
    "adset_id",
    "adset_name",
    "campaign_id",
    "campaign_name",
    "form_id",
    "is_organic",
    "platform"
].join(",");

const GRAPH_SYSTEM_KEYS = GRAPH_LEAD_FIELDS.split(",").filter(key => key !== "field_data");

/**
 * Il lead della Graph API come riga del CSV: chiavi normalizzate come le
 * intestazioni (minuscole, spazi in `_`), risposte a più valori unite con
 * «, », `form_name` dal modulo. Le intestazioni seguono l'ordine del modulo.
 */
export function graphLeadToRecord(
    lead: unknown,
    formName: string | null
): { record: Map<string, string>; headers: string[] } {
    const record = new Map<string, string>();
    const headers: string[] = [];
    const set = (rawKey: string, value: string) => {
        const key = rawKey.trim().toLowerCase().replace(/\s+/g, "_");
        if (!key || record.has(key)) return;
        record.set(key, value);
        headers.push(key);
    };

    const source = (lead && typeof lead === "object" ? lead : {}) as Record<string, unknown>;
    for (const key of GRAPH_SYSTEM_KEYS) {
        const value = source[key];
        if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
            set(key, String(value));
        }
    }
    if (formName) set("form_name", formName);

    const fieldData = Array.isArray(source.field_data) ? source.field_data : [];
    for (const field of fieldData) {
        const { name, values } = (field ?? {}) as { name?: unknown; values?: unknown };
        if (typeof name !== "string") continue;
        const parts = Array.isArray(values)
            ? values.filter((v): v is string | number => typeof v === "string" || typeof v === "number").map(String)
            : [];
        set(name, parts.map(part => part.trim()).filter(Boolean).join(", "));
    }
    return { record, headers };
}
