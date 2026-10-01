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
//   così nessuno può spostare carte indovinando un uuid. Vale 7 giorni
//   (decisione di Alex, 2026-10-01); scaduto ma firmato bene, crm-wa
//   rimanda alla scheda in /admin, dove il pulsante funziona sempre.
//
// Usato da /admin (alias `@shared/`) e dalle edge. `crypto.subtle` è globale
// sia in Deno sia nei browser e in Node.
// =============================================================================

/**
 * Testo predefinito, approvato da Alex il 2026-10-01 (call con Ferdinando):
 * breve, niente funzioni né domande, che Alex fa in chiamata. Non usa
 * {locale} perché il form Meta non chiede il nome del locale.
 * ⚠️ SYNC con la migration 20261001170000 (crm_settings.whatsapp_template).
 */
export const DEFAULT_WHATSAPP_TEMPLATE =
    "Ciao {nome}, sono Alessandro di CataloGlobe. Ho visto che hai lasciato i contatti per il tuo locale. Quando hai 10 minuti per sentirci al telefono?";

/** {locale} quando il locale è ancora da completare (crm_venues.name_pending). */
export const PENDING_VENUE_PLACEHOLDER = "il tuo locale";

/**
 * {nome} → primo nome della persona, {locale} → nome del locale.
 * `venueName` null = locale da completare: la carta porta il nome della
 * persona, che nel testo non va.
 */
export function fillWhatsappTemplate(
    template: string,
    values: { contactName: string | null; venueName: string | null }
): string {
    const firstName = (values.contactName ?? "").trim().split(/\s+/)[0] ?? "";
    const venueName = values.venueName?.trim() || PENDING_VENUE_PLACEHOLDER;
    // Sostituzione con funzione: un «$&» nel nome (dal form pubblico) resta testo.
    return template
        .replace(/\{nome\}/g, () => firstName)
        .replace(/\{locale\}/g, () => venueName)
        .replace(/Ciao ,/g, "Ciao,");
}

export function whatsappUrl(phoneE164: string, text: string | null): string {
    const digits = phoneE164.replace(/[^0-9]/g, "");
    return text ? `https://wa.me/${digits}?text=${encodeURIComponent(text)}` : `https://wa.me/${digits}`;
}

// -----------------------------------------------------------------------------
// Firma del link
// -----------------------------------------------------------------------------
/** 7 giorni; dopo, il pulsante rimanda alla scheda in /admin. */
export const WA_LINK_TTL_SECONDS = 7 * 24 * 60 * 60;

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

export type WaLinkCheck = "valid" | "expired" | "invalid";

/**
 * Prima la firma (confronto a tempo costante), poi la scadenza: «expired»
 * solo per un link firmato da noi, così un uuid indovinato non porta da
 * nessuna parte.
 */
export async function verifyWaLink(
    secret: string,
    params: Partial<WaLinkParams>,
    nowSeconds: number
): Promise<WaLinkCheck> {
    const { l, u, e, s } = params;
    if (!l || !u || !e || !s || !/^\d+$/.test(e)) return "invalid";
    const expiresAt = Number(e);
    const expected = await hmac(secret, payload(l, u, expiresAt));
    if (expected.length !== s.length) return "invalid";
    let diff = 0;
    for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ s.charCodeAt(i);
    if (diff !== 0) return "invalid";
    return expiresAt < nowSeconds ? "expired" : "valid";
}
