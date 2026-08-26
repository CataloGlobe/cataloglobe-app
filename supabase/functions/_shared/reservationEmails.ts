// Transactional email templates for the reservations domain.
//
// Single home for what used to be four inline builders duplicated across
// `submit-reservation` and `respond-reservation`. Every builder here is PURE:
// it takes reservation data and returns `{ subject, html, text }`. No env, no
// network, no DB — the public base URL arrives as a parameter so the builders
// stay testable and the caller owns the fail-safe.
//
// The card layout (outer wrapper, white panel, info blocks, footer) lives in
// the private `render*` helpers below, so a future shared block (cancellation
// link, reminder) is added in ONE place instead of four.
//
// User-facing copy is Italian, as before. Code and comments are English.

import { getEmailFooterHtml, getEmailFooterText } from "./company-config.ts";
import { escapeHtml, formatDateIt, formatTimeIt } from "./emailFormat.ts";

export interface ReservationEmailContent {
    subject: string;
    html: string;
    text: string;
}

/** Data every customer-facing reservation email needs. */
export interface ReservationEmailBase {
    activityName: string;
    customerName: string;
    /** "YYYY-MM-DD". */
    reservationDate: string;
    /** "HH:MM" or "HH:MM:SS". */
    reservationTime: string;
    partySize: number;
}

// --- Footer reason lines -----------------------------------------------------

// Diner-facing reason. Previously duplicated under two different names
// (`reservationReceiptReason` in submit-reservation, `reservationOutcomeReason`
// in respond-reservation) with a character-identical body.
function reservationCustomerReason(activityName: string): string {
    return `Hai ricevuto questa email perché hai richiesto una prenotazione presso ${activityName} tramite CataloGlobe.`;
}

function reservationVenueAlertReason(activityName: string): string {
    return `Hai ricevuto questa email perché gestisci ${activityName} su CataloGlobe.`;
}

// --- Layout primitives -------------------------------------------------------

const PARAGRAPH_LEAD = 'style="margin:0 0 8px;font-size:15px;color:#374151"';
const PARAGRAPH_BODY = 'style="margin:0 0 16px;font-size:15px;color:#374151"';
const PARAGRAPH_NOTE = 'style="margin:0;font-size:13px;color:#6b7280"';

/**
 * Wrap the card sections in the shared shell and append the footer.
 * `sections` are already-rendered HTML fragments, one per visual block.
 */
function renderCard(sections: readonly string[], reason: string): string {
    const body = sections.filter(s => s.length > 0).join("\n        ");
    return `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background:#f9fafb;padding:40px">
    <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px">
        ${body}
        ${getEmailFooterHtml(reason)}
    </div>
</div>`;
}

function renderTitle(title: string): string {
    return `<h1 style="margin:0 0 16px;font-size:22px;color:#111827">${title}</h1>`;
}

/** Grey rounded block with a small caption and a list of rendered rows. */
function renderInfoBlock(caption: string, rows: readonly string[]): string {
    const inner = rows.filter(r => r.length > 0).join("\n            ");
    return `<div style="margin:0 0 24px;padding:16px;background:#f3f4f6;border-radius:8px">
            <p style="margin:0 0 4px;font-size:13px;color:#6b7280">${caption}</p>
            ${inner}
        </div>`;
}

/**
 * Whether a URL is safe to put in an `href`. `escapeHtml` neutralises an
 * attribute breakout but says nothing about the scheme, so a `javascript:` or
 * `data:` value would survive it. Defence in depth: the only caller today
 * validates the scheme upstream, but this module must not depend on that.
 */
function isSafeHttpUrl(url: string): boolean {
    try {
        const { protocol } = new URL(url);
        return protocol === "http:" || protocol === "https:";
    } catch {
        return false;
    }
}

function renderDetailRow(label: string, value: string | number): string {
    return `<p style="margin:0;font-size:15px;color:#111827"><strong>${label}:</strong> ${value}</p>`;
}

/** The Data / Ora / Persone triplet shared by every customer email. */
function renderReservationDetails(dateIt: string, timeIt: string, partySize: number): string {
    return renderInfoBlock("Dettagli", [
        renderDetailRow("Data", escapeHtml(dateIt)),
        renderDetailRow("Ora", escapeHtml(timeIt)),
        renderDetailRow("Persone", String(partySize))
    ]);
}

/** The Data / Ora / Persone triplet in plain text, without trailing newline. */
function renderDetailsText(dateIt: string, timeIt: string, partySize: number): string {
    return `Dettagli\nData: ${dateIt}\nOra: ${timeIt}\nPersone: ${partySize}\n`;
}

// --- Builders ----------------------------------------------------------------

/**
 * Receipt sent to the customer right after a public submission that landed in
 * `pending`. Explicitly NOT a confirmation.
 */
export function buildReservationReceiptEmail(args: ReservationEmailBase): ReservationEmailContent {
    const { activityName, customerName, reservationDate, reservationTime, partySize } = args;
    const eActivityName = escapeHtml(activityName);
    const eCustomerName = escapeHtml(customerName);
    const dateIt = formatDateIt(reservationDate);
    const timeIt = formatTimeIt(reservationTime);
    const reason = reservationCustomerReason(activityName);

    const subject = `Abbiamo ricevuto la tua richiesta di prenotazione — ${activityName}`;
    const html = renderCard(
        [
            renderTitle("Richiesta di prenotazione ricevuta"),
            `<p ${PARAGRAPH_LEAD}>Ciao ${eCustomerName},</p>`,
            `<p ${PARAGRAPH_BODY}>abbiamo ricevuto la tua richiesta di prenotazione presso <strong>${eActivityName}</strong>. Riceverai una conferma via email non appena verrà approvata dal locale.</p>`,
            renderReservationDetails(dateIt, timeIt, partySize),
            `<p ${PARAGRAPH_NOTE}>Questo non è ancora una conferma. La prenotazione è in attesa di approvazione.</p>`
        ],
        reason
    );
    const text =
        `Ciao ${customerName},\n\n` +
        `abbiamo ricevuto la tua richiesta di prenotazione presso ${activityName}.\n` +
        `Riceverai una conferma via email non appena verrà approvata dal locale.\n\n` +
        renderDetailsText(dateIt, timeIt, partySize) +
        `\n` +
        `Questo non è ancora una conferma. La prenotazione è in attesa di approvazione.\n\n` +
        `${getEmailFooterText(reason)}`;

    return { subject, html, text };
}

/**
 * Which path produced the confirmation. The wording differs on purpose and
 * MUST stay distinct:
 *
 *   - "auto"   → the venue runs in auto-confirm mode, so the diner never had
 *                a pending *request*: their reservation was confirmed on the
 *                spot. Saying "la tua richiesta" here would be factually wrong.
 *   - "manual" → an admin acted on a request that sat in `pending`, so the
 *                copy acknowledges that request explicitly.
 *
 * No default value: both call sites pass it explicitly, so any future third
 * path is forced to make the choice instead of silently inheriting one.
 */
export type ReservationConfirmedVariant = "auto" | "manual";

export interface ReservationConfirmedEmailArgs extends ReservationEmailBase {
    variant: ReservationConfirmedVariant;
}

/** "Prenotazione confermata" — auto-confirm and admin-confirm share this. */
export function buildReservationConfirmedEmail(
    args: ReservationConfirmedEmailArgs
): ReservationEmailContent {
    const { activityName, customerName, reservationDate, reservationTime, partySize, variant } = args;
    const eActivityName = escapeHtml(activityName);
    const eCustomerName = escapeHtml(customerName);
    const dateIt = formatDateIt(reservationDate);
    const timeIt = formatTimeIt(reservationTime);
    const reason = reservationCustomerReason(activityName);

    // "La tua prenotazione" (auto) vs "La tua richiesta di prenotazione" (manual).
    const subjectNoun = variant === "manual" ? "richiesta di prenotazione" : "prenotazione";

    const subject = `Prenotazione confermata — ${activityName}`;
    const html = renderCard(
        [
            renderTitle("Prenotazione confermata"),
            `<p ${PARAGRAPH_LEAD}>Ciao ${eCustomerName},</p>`,
            `<p ${PARAGRAPH_BODY}>Buone notizie! La tua ${subjectNoun} presso <strong>${eActivityName}</strong> è stata <strong>confermata</strong>. Ti aspettiamo.</p>`,
            renderReservationDetails(dateIt, timeIt, partySize)
        ],
        reason
    );
    const text =
        `Ciao ${customerName},\n\n` +
        `Buone notizie! La tua ${subjectNoun} presso ${activityName} è stata confermata. Ti aspettiamo.\n\n` +
        renderDetailsText(dateIt, timeIt, partySize) +
        `\n` +
        `${getEmailFooterText(reason)}`;

    return { subject, html, text };
}

/** Non-confirming outcomes an admin can trigger from the dashboard. */
export type ReservationOutcomeAction = "decline" | "cancel";

export interface ReservationOutcomeEmailArgs extends ReservationEmailBase {
    action: ReservationOutcomeAction;
}

/** "Prenotazione non confermata" / "Prenotazione annullata". */
export function buildReservationOutcomeEmail(
    args: ReservationOutcomeEmailArgs
): ReservationEmailContent {
    const { activityName, customerName, reservationDate, reservationTime, partySize, action } = args;
    const eActivityName = escapeHtml(activityName);
    const eCustomerName = escapeHtml(customerName);
    const dateIt = formatDateIt(reservationDate);
    const timeIt = formatTimeIt(reservationTime);
    const reason = reservationCustomerReason(activityName);

    const titles: Record<ReservationOutcomeAction, string> = {
        decline: "Prenotazione non confermata",
        cancel: "Prenotazione annullata"
    };
    const bodies: Record<ReservationOutcomeAction, { html: string; text: string }> = {
        decline: {
            html: `Ci dispiace, la tua richiesta di prenotazione presso <strong>${eActivityName}</strong> <strong>non è stata confermata</strong>. Puoi provare con una data o un orario diverso.`,
            text: `Ci dispiace, la tua richiesta di prenotazione presso ${activityName} non è stata confermata. Puoi provare con una data o un orario diverso.`
        },
        cancel: {
            html: `La tua prenotazione presso <strong>${eActivityName}</strong> è stata <strong>annullata</strong>. Se ritieni che ci sia stato un errore, contatta direttamente la sede.`,
            text: `La tua prenotazione presso ${activityName} è stata annullata. Se ritieni che ci sia stato un errore, contatta direttamente la sede.`
        }
    };

    const subject = `${titles[action]} — ${activityName}`;
    const html = renderCard(
        [
            renderTitle(titles[action]),
            `<p ${PARAGRAPH_LEAD}>Ciao ${eCustomerName},</p>`,
            `<p ${PARAGRAPH_BODY}>${bodies[action].html}</p>`,
            renderReservationDetails(dateIt, timeIt, partySize)
        ],
        reason
    );
    const text =
        `Ciao ${customerName},\n\n` +
        `${bodies[action].text}\n\n` +
        renderDetailsText(dateIt, timeIt, partySize) +
        `\n` +
        `${getEmailFooterText(reason)}`;

    return { subject, html, text };
}

export interface ReservationVenueAlertEmailArgs {
    activityName: string;
    customerName: string;
    customerEmail: string;
    customerPhone: string;
    /** "YYYY-MM-DD". */
    reservationDate: string;
    /** "HH:MM" or "HH:MM:SS". */
    reservationTime: string;
    partySize: number;
    notes: string | null;
    /**
     * Absolute URL of the reservations dashboard for this tenant, or null
     * when unconfigured. When null the dashboard sentence renders as plain
     * text in both formats — a misconfigured deploy must never stop the
     * alert from going out.
     */
    dashboardUrl: string | null;
}

/** Alert to the venue: a new reservation request came in. */
export function buildReservationVenueAlertEmail(
    args: ReservationVenueAlertEmailArgs
): ReservationEmailContent {
    const {
        activityName,
        customerName,
        customerEmail,
        customerPhone,
        reservationDate,
        reservationTime,
        partySize,
        notes,
        dashboardUrl
    } = args;

    const eActivityName = escapeHtml(activityName);
    const eCustomerName = escapeHtml(customerName);
    const eCustomerEmail = escapeHtml(customerEmail);
    const eCustomerPhone = escapeHtml(customerPhone);
    const dateIt = formatDateIt(reservationDate);
    const timeIt = formatTimeIt(reservationTime);
    const eNotes = notes ? escapeHtml(notes) : null;
    const reason = reservationVenueAlertReason(activityName);

    // A non-http(s) URL is treated as absent, exactly like null: no anchor,
    // plain sentence, email still sent.
    const safeDashboardUrl =
        dashboardUrl && isSafeHttpUrl(dashboardUrl) ? dashboardUrl : null;

    // The only intentional visual change of this refactor: when the URL is
    // available, "Accedi alla dashboard" becomes a link (html) and the plain
    // URL follows the sentence (text). Without it both formats stay exactly
    // as before.
    const dashboardSentenceHtml = safeDashboardUrl
        ? `<a href="${escapeHtml(safeDashboardUrl)}" style="color:#111827;text-decoration:underline">Accedi alla dashboard</a> per confermarla o rifiutarla.`
        : "Accedi alla dashboard per confermarla o rifiutarla.";
    const dashboardSentenceText = safeDashboardUrl
        ? `Accedi alla dashboard per confermarla o rifiutarla.\n${safeDashboardUrl}\n`
        : "Accedi alla dashboard per confermarla o rifiutarla.\n";

    const subject = `Nuova richiesta di prenotazione — ${activityName}`;
    const html = renderCard(
        [
            renderTitle("Nuova richiesta di prenotazione"),
            `<p ${PARAGRAPH_BODY}>Hai ricevuto una nuova richiesta di prenotazione su <strong>${eActivityName}</strong>. ${dashboardSentenceHtml}</p>`,
            renderInfoBlock("Cliente", [
                `<p style="margin:0;font-size:15px;color:#111827"><strong>${eCustomerName}</strong></p>`,
                `<p style="margin:0;font-size:14px;color:#374151">${eCustomerEmail}</p>`,
                `<p style="margin:0;font-size:14px;color:#374151">${eCustomerPhone}</p>`
            ]),
            renderInfoBlock("Prenotazione", [
                renderDetailRow("Data", escapeHtml(dateIt)),
                renderDetailRow("Ora", escapeHtml(timeIt)),
                renderDetailRow("Persone", String(partySize)),
                eNotes
                    ? `<p style="margin:8px 0 0;font-size:15px;color:#111827"><strong>Note:</strong> ${eNotes}</p>`
                    : ""
            ])
        ],
        reason
    );

    const notesBlockText = notes ? `Note: ${notes}\n` : "";
    const text =
        `Nuova richiesta di prenotazione su ${activityName}.\n` +
        dashboardSentenceText +
        `\n` +
        `Cliente\n` +
        `${customerName}\n` +
        `${customerEmail}\n` +
        `${customerPhone}\n\n` +
        `Prenotazione\n` +
        `Data: ${dateIt}\n` +
        `Ora: ${timeIt}\n` +
        `Persone: ${partySize}\n` +
        notesBlockText +
        `\n${getEmailFooterText(reason)}`;

    return { subject, html, text };
}
