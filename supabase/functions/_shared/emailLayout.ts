// Layout primitives for transactional emails.
//
// Extracted verbatim from `reservationEmails.ts`, where they lived as private
// helpers. They are here because the support domain needs the same card, and a
// second copy would have drifted from the first at the next change: these
// fragments encode the ONE visual identity of every email CataloGlobe sends.
//
// What belongs here: anything that would look identical in a reservation email
// and in a support email. What does NOT: copy, per-domain data blocks, and the
// footer "reason" lines, which name the domain out loud and stay next to the
// builders that own them.
//
// Every function is PURE — no env, no network, no DB. Absolute URLs arrive as
// parameters so a misconfigured deploy degrades a link to plain text instead of
// blocking a send.

import { COMPANY, getEmailFooterHtml, type EmailFooterOptions } from "./company-config.ts";
import { escapeHtml } from "./emailFormat.ts";
import { resolveEmailLang } from "./emailLang.ts";

/** What every builder returns. Resend takes the three fields as they are. */
export interface EmailContent {
    subject: string;
    html: string;
    text: string;
}

// --- Palette ------------------------------------------------------------------
//
// Dal design system (`src/styles/_theme.scss`): il colore si usa solo su
// bottone, codice e filo sopra la scheda; tutto il resto è neutro, così le app
// in tema scuro hanno poco da invertire (deciso da Lorenzo il 2026-10-10).

export const EMAIL_BRAND = "#6366f1";
const BRAND_SOFT = "#eef2ff";
const BRAND_INK = "#3730a3";
const PAGE_BG = "#f4f4f7";
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/** PNG 3x del lockup orizzontale, servito dal sito (`public/email/logo.png`). */
const LOGO_URL = `${COMPANY.web.homepage}/email/logo.png`;

// --- Inline paragraph styles -------------------------------------------------
//
// Inline and not a stylesheet because email clients strip `<style>`: these are
// attribute fragments interpolated into the tag, not CSS classes.

export const PARAGRAPH_LEAD = 'style="margin:0 0 8px;font-size:15px;line-height:1.6;color:#374151"';
export const PARAGRAPH_BODY = 'style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#374151"';
export const PARAGRAPH_NOTE = 'style="margin:0;font-size:13px;line-height:1.5;color:#6b7280"';

export interface EmailShellOptions extends EmailFooterOptions {
    /**
     * Testo semplice dell'anteprima: la riga che l'app di posta mostra nella
     * notifica e nella lista, sotto l'oggetto. Senza, l'app prende il primo
     * testo della mail e ci attacca il footer.
     */
    preheader: string;
}

/**
 * Riga d'anteprima nascosta, seguita da spazi invisibili che riempiono il resto
 * dell'anteprima: senza, dopo il testo l'app mostrerebbe l'inizio della mail.
 */
function renderPreheader(text: string): string {
    const filler = "&#847;&zwnj;&nbsp;".repeat(80);
    return `<div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;mso-hide:all;font-size:1px;line-height:1px;color:${PAGE_BG}">${escapeHtml(text)}${filler}</div>`;
}

/**
 * La mail intera: anteprima nascosta, logo, scheda con le sezioni, footer.
 * `sections` sono frammenti HTML già pronti, uno per blocco. Tabelle e non div
 * per la colonna centrale: Outlook ignora `max-width` sui div.
 */
export function renderCard(sections: readonly string[], opts: EmailShellOptions): string {
    const body = sections.filter(s => s.length > 0).join("\n");
    const lang = resolveEmailLang(opts.lang);
    return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
</head>
<body style="margin:0;padding:0;background:${PAGE_BG}">
${renderPreheader(opts.preheader)}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${PAGE_BG}">
<tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;font-family:${FONT}">
<tr><td style="padding:0 4px 20px"><img src="${LOGO_URL}" width="140" height="34" alt="${COMPANY.businessName}" style="display:block;border:0;outline:none;height:auto;width:140px;color:${EMAIL_BRAND};font-size:20px;font-weight:700"></td></tr>
<tr><td style="background:#ffffff;border:1px solid #e5e7eb;border-top:3px solid ${EMAIL_BRAND};border-radius:12px;padding:32px">
<!-- card -->
${body}
</td></tr>
<!-- footer -->
<tr><td style="padding:20px 4px 0;font-size:12px;line-height:1.5;color:#6b7280">
${getEmailFooterHtml(opts)}
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

/**
 * Bottone pieno nel colore del brand. Tabella con il colore sulla cella, così
 * resta un bottone anche dove il client ignora il padding dei link.
 * `url` deve essere già validato (`isSafeHttpUrl`) ed escapato dal chiamante.
 */
export function renderButton(label: string, url: string): string {
    return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px"><tr><td style="background:${EMAIL_BRAND};border-radius:8px">
<a href="${url}" style="display:inline-block;padding:12px 22px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px">${label}</a>
</td></tr></table>`;
}

/** Codice a cifre grandi su fondo viola chiaro. */
export function renderCode(code: string): string {
    return `<p style="margin:8px 0 24px;padding:16px;background:${BRAND_SOFT};border-radius:8px;text-align:center;font-family:'SF Mono',Menlo,Consolas,monospace;font-size:32px;font-weight:700;letter-spacing:8px;color:${BRAND_INK}">${escapeHtml(code)}</p>`;
}

export function renderTitle(title: string): string {
    return `<h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;font-weight:700;color:#111827">${title}</h1>`;
}

/** Grey rounded block with a small caption and a list of rendered rows. */
export function renderInfoBlock(caption: string, rows: readonly string[]): string {
    const inner = rows.filter(r => r.length > 0).join("\n            ");
    return `<div style="margin:0 0 24px;padding:16px;background:#f3f4f6;border-radius:8px">
            <p style="margin:0 0 4px;font-size:13px;color:#6b7280">${caption}</p>
            ${inner}
        </div>`;
}

export function renderDetailRow(label: string, value: string | number): string {
    return `<p style="margin:0;font-size:15px;color:#111827"><strong>${label}:</strong> ${value}</p>`;
}

/**
 * Whether a URL is safe to put in an `href`. `escapeHtml` neutralises an
 * attribute breakout but says nothing about the scheme, so a `javascript:` or
 * `data:` value would survive it. Defence in depth: the callers today validate
 * the scheme upstream, but this module must not depend on that.
 */
export function isSafeHttpUrl(url: string): boolean {
    try {
        const { protocol } = new URL(url);
        return protocol === "http:" || protocol === "https:";
    } catch {
        return false;
    }
}
