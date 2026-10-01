// =============================================================================
// CRM interno: messaggio WhatsApp pronto e link firmato (puro, zero import)
// =============================================================================
//
// * `fillWhatsappTemplate`: il testo di crm_settings.whatsapp_template con
//   {nome} (solo il nome di battesimo) e {locale}.
// * `whatsappUrl`: link wa.me col testo. wa.me non sceglie il mittente: la
//   chat parte dall'account WhatsApp aperto sul dispositivo (numero dedicato
//   su WhatsApp Web o WhatsApp Business, wiki piano-costruzione).
// * `signWaLink` / `verifyWaLink`: il pulsante su Telegram passa dall'edge
//   `crm-wa`, che registra il contatto e poi rimanda a wa.me. Il link porta
//   lead, destinatario e scadenza firmati HMAC-SHA256 (CRM_WA_LINK_SECRET),
//   così nessuno può spostare carte indovinando un uuid.
//
// Usato da /admin (alias `@shared/`) e dalle edge. `crypto.subtle` è globale
// sia in Deno sia nei browser e in Node.
// =============================================================================

/** {nome} → primo nome della persona, {locale} → nome del locale. */
export function fillWhatsappTemplate(
    template: string,
    values: { contactName: string | null; venueName: string }
): string {
    const firstName = (values.contactName ?? "").trim().split(/\s+/)[0] ?? "";
    return template
        .replace(/\{nome\}/g, firstName)
        .replace(/\{locale\}/g, values.venueName.trim())
        .replace(/Ciao ,/g, "Ciao,");
}

export function whatsappUrl(phoneE164: string, text: string | null): string {
    const digits = phoneE164.replace(/[^0-9]/g, "");
    return text ? `https://wa.me/${digits}?text=${encodeURIComponent(text)}` : `https://wa.me/${digits}`;
}

// -----------------------------------------------------------------------------
// Firma del link
// -----------------------------------------------------------------------------
/** 30 giorni: il messaggio Telegram resta in chat a lungo. */
export const WA_LINK_TTL_SECONDS = 30 * 24 * 60 * 60;

function toBase64Url(bytes: Uint8Array): string {
    let binary = "";
    for (const b of bytes) binary += String.fromCharCode(b);
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hmac(secret: string, message: string): Promise<string> {
    const key = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
    );
    const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
    return toBase64Url(new Uint8Array(signature));
}

function payload(leadId: string, userId: string, expiresAt: number): string {
    return `crm-wa:${leadId}:${userId}:${expiresAt}`;
}

export interface WaLinkParams {
    l: string;
    u: string;
    e: string;
    s: string;
}

export async function signWaLink(
    secret: string,
    leadId: string,
    userId: string,
    nowSeconds: number
): Promise<WaLinkParams> {
    const expiresAt = nowSeconds + WA_LINK_TTL_SECONDS;
    return {
        l: leadId,
        u: userId,
        e: String(expiresAt),
        s: await hmac(secret, payload(leadId, userId, expiresAt))
    };
}

/** true solo se firma giusta e link non scaduto. Confronto a tempo costante. */
export async function verifyWaLink(
    secret: string,
    params: Partial<WaLinkParams>,
    nowSeconds: number
): Promise<boolean> {
    const { l, u, e, s } = params;
    if (!l || !u || !e || !s || !/^\d+$/.test(e)) return false;
    const expiresAt = Number(e);
    if (expiresAt < nowSeconds) return false;
    const expected = await hmac(secret, payload(l, u, expiresAt));
    if (expected.length !== s.length) return false;
    let diff = 0;
    for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ s.charCodeAt(i);
    return diff === 0;
}
