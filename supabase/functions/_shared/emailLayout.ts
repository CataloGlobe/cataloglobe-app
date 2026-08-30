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

import { getEmailFooterHtml } from "./company-config.ts";

/** What every builder returns. Resend takes the three fields as they are. */
export interface EmailContent {
    subject: string;
    html: string;
    text: string;
}

// --- Inline paragraph styles -------------------------------------------------
//
// Inline and not a stylesheet because email clients strip `<style>`: these are
// attribute fragments interpolated into the tag, not CSS classes.

export const PARAGRAPH_LEAD = 'style="margin:0 0 8px;font-size:15px;color:#374151"';
export const PARAGRAPH_BODY = 'style="margin:0 0 16px;font-size:15px;color:#374151"';
export const PARAGRAPH_NOTE = 'style="margin:0;font-size:13px;color:#6b7280"';

/**
 * Wrap the card sections in the shared shell and append the footer.
 * `sections` are already-rendered HTML fragments, one per visual block.
 */
export function renderCard(sections: readonly string[], reason: string): string {
    const body = sections.filter(s => s.length > 0).join("\n        ");
    return `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background:#f9fafb;padding:40px">
    <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px">
        ${body}
        ${getEmailFooterHtml(reason)}
    </div>
</div>`;
}

export function renderTitle(title: string): string {
    return `<h1 style="margin:0 0 16px;font-size:22px;color:#111827">${title}</h1>`;
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
