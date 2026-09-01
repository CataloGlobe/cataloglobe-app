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
// Customer-facing copy lives in `reservationEmailCopy.ts`, in the five
// languages the public page speaks, and is selected here from the language the
// diner was reading when they booked (`reservations.customer_language`; NULL or
// unsupported → Italian). VENUE-facing copy stays Italian and stays inline: the
// recipient is the restaurateur and the dashboard is Italian only.
// Code and comments are English.

import { getEmailFooterText } from "./company-config.ts";
import { escapeHtml, formatDate, formatDateIt, formatTimeIt } from "./emailFormat.ts";
import {
    reservationCopyFor,
    resolveEmailLang,
    type Emphasize,
    type ReservationEmailCopy
} from "./reservationEmailCopy.ts";

export type {
    ReservationConfirmedVariant,
    ReservationOutcomeAction
} from "./reservationEmailCopy.ts";
import type {
    ReservationConfirmedVariant,
    ReservationOutcomeAction
} from "./reservationEmailCopy.ts";
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
    /**
     * Raw value of `reservations.customer_language` — the language the diner
     * was reading the public page in when they booked.
     *
     * Optional and tolerant of anything: absent, null, empty, or a language we
     * do not write in ("pt") all resolve to Italian. A language we cannot
     * honour must never cost an email, and must never leave a hole where a
     * sentence should be.
     */
    language?: string | null;
}

// --- Emphasis ----------------------------------------------------------------
//
// The copy carries one text per sentence and marks the fragments that deserve
// weight; the format decides how to render them. HTML wraps in <strong>, plain
// text leaves them alone. That is why the venue name reaches these two already
// escaped in the HTML path — escaping belongs to whoever knows the format.

const EMPHASIZE_HTML: Emphasize = fragment => `<strong>${fragment}</strong>`;
const EMPHASIZE_TEXT: Emphasize = fragment => fragment;

// --- Footer reason lines -----------------------------------------------------

function reservationVenueAlertReason(activityName: string): string {
    return `Hai ricevuto questa email perché gestisci ${activityName} su CataloGlobe.`;
}

// --- Reservation-specific blocks ---------------------------------------------

/** The Date / Time / People triplet shared by every customer email. */
function renderReservationDetails(
    copy: ReservationEmailCopy,
    date: string,
    time: string,
    partySize: number
): string {
    return renderInfoBlock(copy.detailsCaption, [
        renderDetailRow(copy.detailsDate, escapeHtml(date)),
        renderDetailRow(copy.detailsTime, escapeHtml(time)),
        renderDetailRow(copy.detailsPeople, String(partySize))
    ]);
}

/** The same triplet in plain text, without trailing newline. */
function renderDetailsText(
    copy: ReservationEmailCopy,
    date: string,
    time: string,
    partySize: number
): string {
    return (
        `${copy.detailsCaption}\n` +
        `${copy.detailsDate}: ${date}\n` +
        `${copy.detailsTime}: ${time}\n` +
        `${copy.detailsPeople}: ${partySize}\n`
    );
}

// --- Self-service cancellation sentence --------------------------------------
//
// Shared by the two customer emails that can carry it (receipt and
// confirmation). Same fail-safe as the venue alert's dashboard link: a null or
// non-http URL degrades to a plain sentence with no anchor, and the email is
// sent regardless. The diner is told to contact the venue in that case, so the
// paragraph is never a dead end.

function renderCancelSentenceHtml(
    copy: ReservationEmailCopy,
    cancelUrl: string | null | undefined
): string {
    const safe = typeof cancelUrl === "string" && isSafeHttpUrl(cancelUrl) ? cancelUrl : null;
    const body = safe
        ? `<a href="${escapeHtml(safe)}" style="color:#111827;text-decoration:underline">${escapeHtml(copy.cancelLinkLabel)}</a>${copy.cancelLinkSuffix}`
        : copy.cancelFallback;
    return `<p ${PARAGRAPH_NOTE}>${copy.cancelLead}${body}</p>`;
}

// --- Attendance confirmation button ------------------------------------------
//
// The only real button in these emails, because it is the only place we ask
// the diner to DO something. Rendered as a table cell rather than a styled
// anchor: Outlook ignores padding on inline elements, and a confirmation
// button that collapses into a bare link in the most common corporate client
// is a button nobody presses.
//
// Absent URL renders nothing at all — no orphan sentence explaining a button
// that is not there.

function renderConfirmButtonHtml(
    copy: ReservationEmailCopy,
    confirmUrl: string | null | undefined
): string {
    const safe = typeof confirmUrl === "string" && isSafeHttpUrl(confirmUrl) ? confirmUrl : null;
    if (!safe) return "";
    return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px">
            <tr><td style="background:#111827;border-radius:8px">
                <a href="${escapeHtml(safe)}" style="display:inline-block;padding:12px 22px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none">${escapeHtml(copy.confirmButtonLabel)}</a>
            </td></tr>
        </table>`;
}

function renderConfirmButtonText(
    copy: ReservationEmailCopy,
    confirmUrl: string | null | undefined
): string {
    const safe = typeof confirmUrl === "string" && isSafeHttpUrl(confirmUrl) ? confirmUrl : null;
    return safe ? `${copy.confirmTextLead}\n${safe}\n\n` : "";
}

function renderCancelSentenceText(
    copy: ReservationEmailCopy,
    cancelUrl: string | null | undefined
): string {
    const safe = typeof cancelUrl === "string" && isSafeHttpUrl(cancelUrl) ? cancelUrl : null;
    return safe
        ? `${copy.cancelLead}${copy.cancelTextIntro}\n${safe}\n`
        : `${copy.cancelLead}${copy.cancelFallback}\n`;
}

// --- Builders ----------------------------------------------------------------

/**
 * Receipt sent to the customer right after a public submission that landed in
 * `pending`. Explicitly NOT a confirmation.
 */
export function buildReservationReceiptEmail(args: ReservationEmailBase): ReservationEmailContent {
    const { activityName, customerName, reservationDate, reservationTime, partySize, cancelUrl, language } =
        args;
    const copy = reservationCopyFor(language);
    const eActivityName = escapeHtml(activityName);
    const eCustomerName = escapeHtml(customerName);
    const date = formatDate(reservationDate, resolveEmailLang(language));
    const time = formatTimeIt(reservationTime);
    // Due forme della stessa riga: l'HTML riceve il nome della sede ESCAPATO.
    // Il footer inietta questa stringa cosi' com'e' nel markup, quindi un nome
    // con `<` o `&` uscirebbe come tag. Il nome lo scrive l'admin del locale,
    // ma chi legge l'email e' il cliente.
    const reason = copy.customerReason(activityName);
    const reasonHtml = copy.customerReason(eActivityName);

    const subject = copy.receiptSubject(activityName);
    const html = renderCard(
        [
            renderTitle(copy.receiptTitle),
            // Greeting template is our own text; only the name needs escaping.
            `<p ${PARAGRAPH_LEAD}>${copy.greeting(eCustomerName)}</p>`,
            `<p ${PARAGRAPH_BODY}>${copy.receiptLead(eActivityName, EMPHASIZE_HTML)} ${copy.receiptFollow}</p>`,
            renderReservationDetails(copy, date, time, partySize),
            `<p ${PARAGRAPH_NOTE}>${copy.receiptNote}</p>`,
            renderCancelSentenceHtml(copy, cancelUrl)
        ],
        reasonHtml,
        language
    );
    const text =
        `${copy.greeting(customerName)}\n\n` +
        `${copy.receiptLead(activityName, EMPHASIZE_TEXT)}\n` +
        `${copy.receiptFollow}\n\n` +
        renderDetailsText(copy, date, time, partySize) +
        `\n` +
        `${copy.receiptNote}\n\n` +
        renderCancelSentenceText(copy, cancelUrl) +
        `\n` +
        `${getEmailFooterText(reason, language)}`;

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
 *
 * The type itself now lives in `reservationEmailCopy.ts` — it is the copy that
 * has to decline the two variants in five languages — and is re-exported at the
 * top of this file for the call sites that have always imported it from here.
 */
export interface ReservationConfirmedEmailArgs extends ReservationEmailBase {
    variant: ReservationConfirmedVariant;
}

/** "Prenotazione confermata" — auto-confirm and admin-confirm share this. */
export function buildReservationConfirmedEmail(
    args: ReservationConfirmedEmailArgs
): ReservationEmailContent {
    const {
        activityName,
        customerName,
        reservationDate,
        reservationTime,
        partySize,
        variant,
        cancelUrl,
        language
    } = args;
    const copy = reservationCopyFor(language);
    const eActivityName = escapeHtml(activityName);
    const eCustomerName = escapeHtml(customerName);
    const date = formatDate(reservationDate, resolveEmailLang(language));
    const time = formatTimeIt(reservationTime);
    // Due forme della stessa riga: l'HTML riceve il nome della sede ESCAPATO.
    // Il footer inietta questa stringa cosi' com'e' nel markup, quindi un nome
    // con `<` o `&` uscirebbe come tag. Il nome lo scrive l'admin del locale,
    // ma chi legge l'email e' il cliente.
    const reason = copy.customerReason(activityName);
    const reasonHtml = copy.customerReason(eActivityName);

    const subject = copy.confirmedSubject(activityName);
    const html = renderCard(
        [
            renderTitle(copy.confirmedTitle),
            `<p ${PARAGRAPH_LEAD}>${copy.greeting(eCustomerName)}</p>`,
            `<p ${PARAGRAPH_BODY}>${copy.confirmedBody(eActivityName, variant, EMPHASIZE_HTML)}</p>`,
            renderReservationDetails(copy, date, time, partySize),
            renderCancelSentenceHtml(copy, cancelUrl)
        ],
        reasonHtml,
        language
    );
    const text =
        `${copy.greeting(customerName)}\n\n` +
        `${copy.confirmedBody(activityName, variant, EMPHASIZE_TEXT)}\n\n` +
        renderDetailsText(copy, date, time, partySize) +
        `\n` +
        renderCancelSentenceText(copy, cancelUrl) +
        `\n` +
        `${getEmailFooterText(reason, language)}`;

    return { subject, html, text };
}

export interface ReservationReminderEmailArgs extends ReservationEmailBase {
    /**
     * Absolute URL of the attendance-confirmation page, or null when
     * unavailable. Signed with a token whose `act` claim is "confirm": it is a
     * DIFFERENT token from `cancelUrl`, and neither can perform the other's
     * operation. The two links sit one under the other in this email, which is
     * exactly where a mix-up would go unnoticed.
     */
    confirmUrl?: string | null;
}

/**
 * Reminder sent the evening before, to a `confirmed` reservation.
 *
 * The point is not to inform — the diner knows they booked — but to give them
 * a moment where answering is easier than forgetting. Both answers are on
 * offer: confirming costs one tap and tells the floor the table is real,
 * cancelling frees it while there is still a day to refill it. Neither is
 * buried: they are the reason the email exists.
 */
export function buildReservationReminderEmail(
    args: ReservationReminderEmailArgs
): ReservationEmailContent {
    const {
        activityName,
        customerName,
        reservationDate,
        reservationTime,
        partySize,
        cancelUrl,
        confirmUrl,
        language
    } = args;
    const copy = reservationCopyFor(language);
    const eActivityName = escapeHtml(activityName);
    const eCustomerName = escapeHtml(customerName);
    const date = formatDate(reservationDate, resolveEmailLang(language));
    const time = formatTimeIt(reservationTime);
    // Due forme della stessa riga: l'HTML riceve il nome della sede ESCAPATO.
    // Il footer inietta questa stringa cosi' com'e' nel markup, quindi un nome
    // con `<` o `&` uscirebbe come tag. Il nome lo scrive l'admin del locale,
    // ma chi legge l'email e' il cliente.
    const reason = copy.customerReason(activityName);
    const reasonHtml = copy.customerReason(eActivityName);

    const subject = copy.reminderSubject(activityName);
    const html = renderCard(
        [
            renderTitle(copy.reminderTitle),
            `<p ${PARAGRAPH_LEAD}>${copy.greeting(eCustomerName)}</p>`,
            `<p ${PARAGRAPH_BODY}>${copy.reminderBody(eActivityName, EMPHASIZE_HTML)}</p>`,
            renderReservationDetails(copy, date, time, partySize),
            renderConfirmButtonHtml(copy, confirmUrl),
            renderCancelSentenceHtml(copy, cancelUrl)
        ],
        reasonHtml,
        language
    );
    const text =
        `${copy.greeting(customerName)}\n\n` +
        `${copy.reminderBody(activityName, EMPHASIZE_TEXT)}\n\n` +
        renderDetailsText(copy, date, time, partySize) +
        `\n` +
        renderConfirmButtonText(copy, confirmUrl) +
        renderCancelSentenceText(copy, cancelUrl) +
        `\n` +
        `${getEmailFooterText(reason, language)}`;

    return { subject, html, text };
}

export interface ReservationOutcomeEmailArgs extends ReservationEmailBase {
    action: ReservationOutcomeAction;
}

/** "Prenotazione non confermata" / "Prenotazione annullata". */
export function buildReservationOutcomeEmail(
    args: ReservationOutcomeEmailArgs
): ReservationEmailContent {
    const { activityName, customerName, reservationDate, reservationTime, partySize, action, language } =
        args;
    const copy = reservationCopyFor(language);
    const eActivityName = escapeHtml(activityName);
    const eCustomerName = escapeHtml(customerName);
    const date = formatDate(reservationDate, resolveEmailLang(language));
    const time = formatTimeIt(reservationTime);
    // Due forme della stessa riga: l'HTML riceve il nome della sede ESCAPATO.
    // Il footer inietta questa stringa cosi' com'e' nel markup, quindi un nome
    // con `<` o `&` uscirebbe come tag. Il nome lo scrive l'admin del locale,
    // ma chi legge l'email e' il cliente.
    const reason = copy.customerReason(activityName);
    const reasonHtml = copy.customerReason(eActivityName);

    const title = copy.outcomeTitle(action);

    const subject = `${title} — ${activityName}`;
    const html = renderCard(
        [
            renderTitle(title),
            `<p ${PARAGRAPH_LEAD}>${copy.greeting(eCustomerName)}</p>`,
            `<p ${PARAGRAPH_BODY}>${copy.outcomeBody(eActivityName, action, EMPHASIZE_HTML)}</p>`,
            renderReservationDetails(copy, date, time, partySize)
        ],
        reasonHtml,
        language
    );
    const text =
        `${copy.greeting(customerName)}\n\n` +
        `${copy.outcomeBody(activityName, action, EMPHASIZE_TEXT)}\n\n` +
        renderDetailsText(copy, date, time, partySize) +
        `\n` +
        `${getEmailFooterText(reason, language)}`;

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
    // Come per le email al cliente: la riga finisce dentro il markup, quindi
    // la versione HTML porta il nome della sede escapato.
    const reasonHtml = reservationVenueAlertReason(eActivityName);

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
        reasonHtml
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
    // Come per le email al cliente: la riga finisce dentro il markup, quindi
    // la versione HTML porta il nome della sede escapato.
    const reasonHtml = reservationVenueAlertReason(eActivityName);

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
        reasonHtml
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
