// Transactional email templates for the reservations domain.
//
// Single home for what used to be four inline builders duplicated across
// `submit-reservation` and `respond-reservation`. Every builder here is PURE:
// it takes reservation data and returns `{ subject, html, text }`. No env, no
// network, no DB — the public base URL arrives as a parameter so the builders
// stay testable and the caller owns the fail-safe.
//
// The card layout (outer wrapper, white panel, info blocks, footer) lives in
// `emailLayout.ts`, shared with the other transactional domains. What stays
// here is what only a reservation email says: the footer reason lines, the
// Data / Ora / Persone triplet, the cancellation sentence.
//
// User-facing copy is Italian, as before. Code and comments are English.

import { getEmailFooterText } from "./company-config.ts";
import { escapeHtml, formatDateIt, formatTimeIt } from "./emailFormat.ts";
import {
    PARAGRAPH_BODY,
    PARAGRAPH_LEAD,
    PARAGRAPH_NOTE,
    isSafeHttpUrl,
    renderCard,
    renderDetailRow,
    renderInfoBlock,
    renderTitle,
    type EmailContent
} from "./emailLayout.ts";

/**
 * Kept as a domain-named alias of the shared shape rather than dropped: the
 * builders' call sites and tests import it by this name, and the indirection
 * costs nothing.
 */
export type ReservationEmailContent = EmailContent;

/** Data every customer-facing reservation email needs. */
export interface ReservationEmailBase {
    activityName: string;
    customerName: string;
    /** "YYYY-MM-DD". */
    reservationDate: string;
    /** "HH:MM" or "HH:MM:SS". */
    reservationTime: string;
    partySize: number;
    /**
     * Absolute URL of the signed self-service cancellation page, or null when
     * unavailable (base URL unconfigured, token not mintable).
     *
     * Optional and null-tolerant on purpose: exactly like `dashboardUrl` in
     * the venue alert, a misconfigured deploy degrades the sentence to plain
     * text and the email still goes out. Nobody's booking confirmation is
     * withheld because a link could not be built.
     */
    cancelUrl?: string | null;
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

// --- Reservation-specific blocks ---------------------------------------------

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

// --- Self-service cancellation sentence --------------------------------------
//
// Shared by the two customer emails that can carry it (receipt and
// confirmation). Same fail-safe as the venue alert's dashboard link: a null or
// non-http URL degrades to a plain sentence with no anchor, and the email is
// sent regardless. The diner is told to contact the venue in that case, so the
// paragraph is never a dead end.

const CANCEL_SENTENCE_LEAD = "Non puoi più venire? ";

function renderCancelSentenceHtml(cancelUrl: string | null | undefined): string {
    const safe = typeof cancelUrl === "string" && isSafeHttpUrl(cancelUrl) ? cancelUrl : null;
    const body = safe
        ? `<a href="${escapeHtml(safe)}" style="color:#111827;text-decoration:underline">Annulla la prenotazione</a> in un clic.`
        : "Contatta direttamente la sede per annullare la prenotazione.";
    return `<p ${PARAGRAPH_NOTE}>${CANCEL_SENTENCE_LEAD}${body}</p>`;
}

function renderCancelSentenceText(cancelUrl: string | null | undefined): string {
    const safe = typeof cancelUrl === "string" && isSafeHttpUrl(cancelUrl) ? cancelUrl : null;
    return safe
        ? `${CANCEL_SENTENCE_LEAD}Annulla la prenotazione da qui:\n${safe}\n`
        : `${CANCEL_SENTENCE_LEAD}Contatta direttamente la sede per annullare la prenotazione.\n`;
}

// --- Builders ----------------------------------------------------------------

/**
 * Receipt sent to the customer right after a public submission that landed in
 * `pending`. Explicitly NOT a confirmation.
 */
export function buildReservationReceiptEmail(args: ReservationEmailBase): ReservationEmailContent {
    const { activityName, customerName, reservationDate, reservationTime, partySize, cancelUrl } = args;
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
            `<p ${PARAGRAPH_NOTE}>Questo non è ancora una conferma. La prenotazione è in attesa di approvazione.</p>`,
            renderCancelSentenceHtml(cancelUrl)
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
        renderCancelSentenceText(cancelUrl) +
        `\n` +
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
    const { activityName, customerName, reservationDate, reservationTime, partySize, variant, cancelUrl } =
        args;
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
            renderReservationDetails(dateIt, timeIt, partySize),
            renderCancelSentenceHtml(cancelUrl)
        ],
        reason
    );
    const text =
        `Ciao ${customerName},\n\n` +
        `Buone notizie! La tua ${subjectNoun} presso ${activityName} è stata confermata. Ti aspettiamo.\n\n` +
        renderDetailsText(dateIt, timeIt, partySize) +
        `\n` +
        renderCancelSentenceText(cancelUrl) +
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

/**
 * Which state the reservation is already in when the venue is alerted. The
 * copy differs on purpose and MUST stay distinct:
 *
 *   - "request"       → the venue confirms manually, the row is `pending` and
 *                       the dashboard shows Conferma / Rifiuta. The email asks
 *                       for a decision.
 *   - "autoConfirmed" → the venue runs in auto-confirm mode, the row is
 *                       already `confirmed` and no accept/decline action
 *                       exists. Asking to "confermarla o rifiutarla" would
 *                       point at buttons that are not there, so the email is
 *                       purely informative.
 *
 * No default value: the call site passes it explicitly, so any future third
 * path is forced to make the choice instead of silently inheriting one.
 */
export type ReservationVenueAlertVariant = "request" | "autoConfirmed";

/** Per-variant copy. Everything else in the email is shared. */
const VENUE_ALERT_COPY: Record<
    ReservationVenueAlertVariant,
    {
        subject: (activityName: string) => string;
        title: string;
        /** HTML lead, up to (and including) the space before the anchor. */
        htmlLead: (eActivityName: string) => string;
        /** Portion rendered as an anchor when a dashboard URL is available. */
        anchorLabel: string;
        /** HTML tail that follows the anchor. */
        htmlTail: string;
        /** First plain-text line. */
        textLead: (activityName: string) => string;
        /** Second plain-text line, the one the URL follows. */
        textSentence: string;
    }
> = {
    request: {
        subject: activityName => `Nuova richiesta di prenotazione — ${activityName}`,
        title: "Nuova richiesta di prenotazione",
        htmlLead: eActivityName =>
            `Hai ricevuto una nuova richiesta di prenotazione su <strong>${eActivityName}</strong>. `,
        anchorLabel: "Accedi alla dashboard",
        htmlTail: " per confermarla o rifiutarla.",
        textLead: activityName => `Nuova richiesta di prenotazione su ${activityName}.`,
        textSentence: "Accedi alla dashboard per confermarla o rifiutarla."
    },
    autoConfirmed: {
        subject: activityName => `Nuova prenotazione confermata — ${activityName}`,
        title: "Nuova prenotazione",
        htmlLead: eActivityName =>
            `Una nuova prenotazione su <strong>${eActivityName}</strong> è stata confermata automaticamente. Vedi il dettaglio `,
        anchorLabel: "nella dashboard",
        htmlTail: ".",
        textLead: activityName =>
            `Una nuova prenotazione su ${activityName} è stata confermata automaticamente.`,
        textSentence: "Vedi il dettaglio nella dashboard."
    }
};

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
    /** See `ReservationVenueAlertVariant`. Always passed explicitly. */
    variant: ReservationVenueAlertVariant;
}

/** Alert to the venue: a new reservation came in. */
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
        dashboardUrl,
        variant
    } = args;

    const copy = VENUE_ALERT_COPY[variant];

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

    // When the URL is available the dashboard wording becomes a link (html)
    // and the plain URL follows the sentence (text). Without it both formats
    // degrade to the bare sentence.
    const dashboardSentenceHtml = safeDashboardUrl
        ? `<a href="${escapeHtml(safeDashboardUrl)}" style="color:#111827;text-decoration:underline">${copy.anchorLabel}</a>${copy.htmlTail}`
        : `${copy.anchorLabel}${copy.htmlTail}`;
    const dashboardSentenceText = safeDashboardUrl
        ? `${copy.textSentence}\n${safeDashboardUrl}\n`
        : `${copy.textSentence}\n`;

    const subject = copy.subject(activityName);
    const html = renderCard(
        [
            renderTitle(copy.title),
            `<p ${PARAGRAPH_BODY}>${copy.htmlLead(eActivityName)}${dashboardSentenceHtml}</p>`,
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
        `${copy.textLead(activityName)}\n` +
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

export interface ReservationCancelledByCustomerEmailArgs {
    activityName: string;
    customerName: string;
    /** "YYYY-MM-DD". */
    reservationDate: string;
    /** "HH:MM" or "HH:MM:SS". */
    reservationTime: string;
    partySize: number;
    /** See `buildReservationVenueAlertEmail`: null degrades to plain text. */
    dashboardUrl: string | null;
}

/**
 * Alert to the venue: the diner cancelled from the link in their email.
 *
 * A table freeing up is operational information, and the venue has no other
 * way to learn it in time — nobody watches the dashboard continuously during
 * service. This is the email that makes the cancellation page's "Abbiamo
 * avvisato la sede" a statement of fact.
 *
 * Deliberately terse compared to the new-booking alert: no customer email or
 * phone. Nobody is meant to call the diner back to discuss a cancellation, and
 * the contact details are one click away in the dashboard for the rare case
 * where they are.
 */
export function buildReservationCancelledByCustomerEmail(
    args: ReservationCancelledByCustomerEmailArgs
): ReservationEmailContent {
    const { activityName, customerName, reservationDate, reservationTime, partySize, dashboardUrl } =
        args;

    const eActivityName = escapeHtml(activityName);
    const eCustomerName = escapeHtml(customerName);
    const dateIt = formatDateIt(reservationDate);
    const timeIt = formatTimeIt(reservationTime);
    const reason = reservationVenueAlertReason(activityName);

    const safeDashboardUrl = dashboardUrl && isSafeHttpUrl(dashboardUrl) ? dashboardUrl : null;
    const dashboardSentenceHtml = safeDashboardUrl
        ? `Il tavolo torna disponibile. Vedi il dettaglio <a href="${escapeHtml(safeDashboardUrl)}" style="color:#111827;text-decoration:underline">nella dashboard</a>.`
        : "Il tavolo torna disponibile. Vedi il dettaglio nella dashboard.";
    const dashboardSentenceText = safeDashboardUrl
        ? `Il tavolo torna disponibile. Vedi il dettaglio nella dashboard.\n${safeDashboardUrl}\n`
        : `Il tavolo torna disponibile. Vedi il dettaglio nella dashboard.\n`;

    const subject = `Prenotazione annullata dal cliente — ${activityName}`;
    const html = renderCard(
        [
            renderTitle("Prenotazione annullata dal cliente"),
            `<p ${PARAGRAPH_BODY}><strong>${eCustomerName}</strong> ha annullato la prenotazione presso <strong>${eActivityName}</strong>. ${dashboardSentenceHtml}</p>`,
            renderInfoBlock("Prenotazione annullata", [
                renderDetailRow("Cliente", eCustomerName),
                renderDetailRow("Data", escapeHtml(dateIt)),
                renderDetailRow("Ora", escapeHtml(timeIt)),
                renderDetailRow("Persone", String(partySize))
            ])
        ],
        reason
    );

    const text =
        `${customerName} ha annullato la prenotazione presso ${activityName}.\n` +
        dashboardSentenceText +
        `\n` +
        `Prenotazione annullata\n` +
        `Cliente: ${customerName}\n` +
        `Data: ${dateIt}\n` +
        `Ora: ${timeIt}\n` +
        `Persone: ${partySize}\n` +
        `\n${getEmailFooterText(reason)}`;

    return { subject, html, text };
}
