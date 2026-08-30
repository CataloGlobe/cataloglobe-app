// Transactional email templates for the support domain.
//
// Same contract as `reservationEmails.ts`: every builder is PURE — it takes
// data and returns `{ subject, html, text }`. No env, no network, no DB. The
// absolute URL of the thread arrives as a parameter, so a deploy without
// `APP_URL` degrades the link to plain copy instead of blocking the send.
// The card layout is the shared one from `emailLayout.ts`.
//
// ── These emails are a notification, never a channel ────────────────────────
// Both templates say explicitly to answer from the panel. A reply by email
// lands in a mailbox nobody reads back into the thread, and the conversation
// splits in two — exactly the ping-pong the ticket system exists to end. The
// sentence is not decorative copy: it is the reason the email is allowed to
// exist at all.
//
// No promise about response times, in either template. A deadline we do not
// control is a deadline we break.
//
// User-facing copy is Italian. Code and comments are English.

import { getEmailFooterText } from "./company-config.ts";
import { escapeHtml } from "./emailFormat.ts";
import {
    PARAGRAPH_BODY,
    PARAGRAPH_NOTE,
    isSafeHttpUrl,
    renderCard,
    renderDetailRow,
    renderInfoBlock,
    renderTitle,
    type EmailContent
} from "./emailLayout.ts";

export type SupportEmailContent = EmailContent;

// --- Footer reason lines -----------------------------------------------------

const SUPPORT_CUSTOMER_REASON =
    "Hai ricevuto questa email perché sei coinvolto in una richiesta di assistenza su CataloGlobe.";

const SUPPORT_PLATFORM_REASON =
    "Hai ricevuto questa email perché sei un amministratore della piattaforma CataloGlobe.";

// --- Excerpt -----------------------------------------------------------------

/** Maximum length of the quoted message, before the ellipsis. */
export const EXCERPT_MAX_LENGTH = 200;

/**
 * Shorten a message body down to a preview.
 *
 * Newlines and runs of whitespace collapse to single spaces first: the excerpt
 * renders inside one paragraph, and a body pasted from a chat would otherwise
 * spend its whole budget on blank lines. The cut backs off to the last word
 * boundary when there is one reasonably close, so the preview does not end
 * mid-word.
 *
 * Returns the raw text — escaping happens at render time, at the same place as
 * every other value. Escaping first and truncating after would cut an HTML
 * entity in half and emit `&am`.
 */
export function buildExcerpt(body: string, maxLength = EXCERPT_MAX_LENGTH): string {
    const collapsed = body.replace(/\s+/g, " ").trim();
    if (collapsed.length <= maxLength) return collapsed;

    const hard = collapsed.slice(0, maxLength);
    const lastSpace = hard.lastIndexOf(" ");
    // Only honour the word boundary if it is not throwing away most of the
    // budget — a 200-character single "word" (a URL, a stack trace) must still
    // produce a preview.
    const cut = lastSpace > maxLength * 0.6 ? hard.slice(0, lastSpace) : hard;
    return `${cut.trimEnd()}…`;
}

// --- Shared blocks -----------------------------------------------------------

/**
 * The quoted excerpt, as its own block so it reads as someone else's words and
 * not as ours.
 */
function renderExcerptBlock(caption: string, excerpt: string): string {
    return renderInfoBlock(caption, [
        `<p style="margin:0;font-size:15px;color:#111827">${escapeHtml(excerpt)}</p>`
    ]);
}

// The limit is stated as ours, not as the reader's message going nowhere:
// "non possiamo risponderti" and "non vengono lette" carry the same
// information, but only one of them is something you would say out loud.
const REPLY_HERE_SENTENCE = "Rispondi dal pannello: da questa email non possiamo risponderti.";

/**
 * Call to action plus the sentence that keeps the conversation in one place.
 *
 * A null or non-http(s) URL degrades to the label without an anchor: the same
 * fail-safe as the reservation dashboard link. The reader is never left
 * without an instruction, only without a shortcut.
 */
function renderThreadCtaHtml(label: string, threadUrl: string | null | undefined): string {
    const safe = typeof threadUrl === "string" && isSafeHttpUrl(threadUrl) ? threadUrl : null;
    const cta = safe
        ? `<a href="${escapeHtml(safe)}" style="color:#111827;text-decoration:underline">${label}</a>`
        : label;
    return `<p ${PARAGRAPH_NOTE}>${cta}. ${REPLY_HERE_SENTENCE}</p>`;
}

function renderThreadCtaText(label: string, threadUrl: string | null | undefined): string {
    const safe = typeof threadUrl === "string" && isSafeHttpUrl(threadUrl) ? threadUrl : null;
    return safe
        ? `${label}:\n${safe}\n${REPLY_HERE_SENTENCE}\n`
        : `${label}.\n${REPLY_HERE_SENTENCE}\n`;
}

// --- Builders ----------------------------------------------------------------

export interface SupportCustomerReplyEmailArgs {
    /** Subject of the ticket, as the customer wrote it. */
    ticketSubject: string;
    /** Raw body of the platform message. Truncated and escaped here. */
    messageBody: string;
    /**
     * Absolute URL of the thread in the business dashboard, or null when the
     * base URL is unconfigured. Null degrades the CTA to plain text.
     */
    threadUrl: string | null;
}

/** To the customer: the platform answered on one of their tickets. */
export function buildSupportCustomerReplyEmail(
    args: SupportCustomerReplyEmailArgs
): SupportEmailContent {
    const { ticketSubject, messageBody, threadUrl } = args;

    const excerpt = buildExcerpt(messageBody);
    const eTicketSubject = escapeHtml(ticketSubject);

    const subject = `Risposta alla tua richiesta di assistenza — ${ticketSubject}`;
    const html = renderCard(
        [
            renderTitle("Hai una risposta dal supporto"),
            `<p ${PARAGRAPH_BODY}>Il supporto CataloGlobe ha risposto alla tua richiesta.</p>`,
            renderInfoBlock("Richiesta", [renderDetailRow("Oggetto", eTicketSubject)]),
            renderExcerptBlock("Risposta", excerpt),
            renderThreadCtaHtml("Apri la conversazione", threadUrl)
        ],
        SUPPORT_CUSTOMER_REASON
    );
    const text =
        `Il supporto CataloGlobe ha risposto alla tua richiesta.\n\n` +
        `Richiesta\nOggetto: ${ticketSubject}\n\n` +
        `Risposta\n${excerpt}\n\n` +
        renderThreadCtaText("Apri la conversazione", threadUrl) +
        `\n${getEmailFooterText(SUPPORT_CUSTOMER_REASON)}`;

    return { subject, html, text };
}

/**
 * Which event woke the platform up. The copy differs on purpose:
 *
 *   - "newTicket"  → a request that nobody has ever seen. The email announces
 *                    an arrival.
 *   - "newMessage" → a thread that already exists moved. It may be a reply, or
 *                    a customer writing on a ticket that had been closed — the
 *                    trigger reopens it, and that reopening is exactly the kind
 *                    of event that must not go unnoticed.
 *
 * No default: the call site passes it explicitly, so a future third case is
 * forced to choose instead of silently inheriting one.
 */
export type SupportPlatformAlertVariant = "newTicket" | "newMessage";

const PLATFORM_ALERT_COPY: Record<
    SupportPlatformAlertVariant,
    { subjectPrefix: string; title: string; lead: string }
> = {
    newTicket: {
        subjectPrefix: "Nuova richiesta di assistenza",
        title: "Nuova richiesta di assistenza",
        lead: "È arrivata una nuova richiesta di assistenza."
    },
    newMessage: {
        subjectPrefix: "Nuovo messaggio di assistenza",
        title: "Nuovo messaggio su una richiesta",
        lead: "Un cliente ha scritto su una richiesta di assistenza."
    }
};

export interface SupportPlatformAlertEmailArgs {
    /**
     * Name of the company that wrote. Null when the tenant row was not
     * resolvable: the alert still goes out, with a neutral placeholder. Who
     * wrote is one click away in the thread, and an alert nobody receives is
     * worse than an alert missing a name.
     */
    tenantName: string | null;
    ticketSubject: string;
    /** Raw body of the customer message. Truncated and escaped here. */
    messageBody: string;
    /** Absolute URL of the thread in /admin, or null when unconfigured. */
    threadUrl: string | null;
    variant: SupportPlatformAlertVariant;
}

/** To the platform admins: a customer opened a ticket or wrote on one. */
export function buildSupportPlatformAlertEmail(
    args: SupportPlatformAlertEmailArgs
): SupportEmailContent {
    const { tenantName, ticketSubject, messageBody, threadUrl, variant } = args;

    const copy = PLATFORM_ALERT_COPY[variant];
    const companyName = tenantName ?? "Azienda non identificata";
    const excerpt = buildExcerpt(messageBody);

    const subject = `${copy.subjectPrefix} — ${companyName}`;
    const html = renderCard(
        [
            renderTitle(copy.title),
            `<p ${PARAGRAPH_BODY}>${copy.lead}</p>`,
            renderInfoBlock("Richiesta", [
                renderDetailRow("Azienda", escapeHtml(companyName)),
                renderDetailRow("Oggetto", escapeHtml(ticketSubject))
            ]),
            renderExcerptBlock("Messaggio", excerpt),
            renderThreadCtaHtml("Apri la richiesta", threadUrl)
        ],
        SUPPORT_PLATFORM_REASON
    );
    const text =
        `${copy.lead}\n\n` +
        `Richiesta\nAzienda: ${companyName}\nOggetto: ${ticketSubject}\n\n` +
        `Messaggio\n${excerpt}\n\n` +
        renderThreadCtaText("Apri la richiesta", threadUrl) +
        `\n${getEmailFooterText(SUPPORT_PLATFORM_REASON)}`;

    return { subject, html, text };
}
