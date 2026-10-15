// Email del motore notifiche: modelli e regole dei nuovi tentativi.
//
// Le righe di `notification_emails` (scritte da `public.notify` per i tipi del
// catalogo con `email = true`) portano il nome del modello (`template`) e i
// `data` della notifica; `send-notification-emails` le trasforma qui in
// oggetto, HTML e testo. Funzioni pure: niente env, rete o DB.
//
// Un modello nuovo: una voce in `NOTIFICATION_EMAIL_TEMPLATES` con lo stesso
// nome scritto in `notification_types.email_template`. Tutto ciò che viene da
// `data` è scritto da utenti (nomi di aziende, persone): si escapa qui.
// Gli URL assoluti arrivano dal chiamante in `ctx` (senza, la mail parte senza
// bottone).

import { getEmailFooterText } from "./company-config.ts";
import { escapeHtml } from "./emailFormat.ts";
import {
    isSafeHttpUrl,
    PARAGRAPH_BODY,
    PARAGRAPH_NOTE,
    renderButton,
    renderCard,
    renderTitle,
    type EmailContent
} from "./emailLayout.ts";

export type NotificationEmailData = Record<string, unknown>;

export interface NotificationEmailContext {
    /** Base pubblica del sito senza slash finale (`getPublicSiteUrl`), o null. */
    siteUrl: string | null;
}

export type NotificationEmailBuilder = (
    data: NotificationEmailData,
    ctx: NotificationEmailContext
) => EmailContent | null;

/**
 * Attività in eliminazione, all'owner: subito (`kind: "scheduled"`) e a 7 e 1
 * giorno dalla cancellazione definitiva (`kind: "reminder"`). Dati da
 * `public.tenant_deletion_notification_data`.
 */
export function buildTenantDeletionOwnerEmail(
    data: NotificationEmailData,
    ctx: NotificationEmailContext
): EmailContent | null {
    const tenantName = dataString(data, "tenant_name");
    const purgeDate = dataString(data, "purge_date_label");
    if (!tenantName || !purgeDate) return null;

    const reminder = data.kind === "reminder";
    const when = dataString(data, "days_left_label");
    const eTenant = escapeHtml(tenantName);
    const ePurge = escapeHtml(purgeDate);

    const subject = reminder
        ? `«${tenantName}» sarà eliminata ${when ?? `il ${purgeDate}`}`
        : `«${tenantName}» è in eliminazione`;
    const lead = reminder
        ? `L'attività «${tenantName}» sarà eliminata definitivamente il ${purgeDate}.`
        : `Hai eliminato l'attività «${tenantName}». Resta ripristinabile fino al ${purgeDate}.`;
    const eLead = reminder
        ? `L'attività <strong>${eTenant}</strong> sarà eliminata definitivamente il <strong>${ePurge}</strong>.`
        : `Hai eliminato l'attività <strong>${eTenant}</strong>. Resta ripristinabile fino al <strong>${ePurge}</strong>.`;
    const after = "Dopo quella data l'attività e tutti i suoi dati vengono cancellati e non si possono più recuperare.";
    const how = "Per tenerla: Workspace → In eliminazione → Ripristina.";

    const workspaceUrl = ctx.siteUrl ? `${ctx.siteUrl}/workspace` : null;
    const button =
        workspaceUrl && isSafeHttpUrl(workspaceUrl)
            ? renderButton("Apri il Workspace", escapeHtml(workspaceUrl))
            : "";

    const html = renderCard(
        [
            renderTitle(reminder ? "Eliminazione in arrivo" : "Attività in eliminazione"),
            `<p ${PARAGRAPH_BODY}>${eLead}</p>`,
            `<p ${PARAGRAPH_BODY}>${after}</p>`,
            button,
            `<p ${PARAGRAPH_NOTE}>${how} Se va bene così, non serve fare nulla.</p>`
        ].filter(s => s.length > 0),
        { preheader: lead }
    );
    const text =
        `${lead}\n\n${after}\n\n${how}` +
        (workspaceUrl ? `\n${workspaceUrl}` : "") +
        `\n\nSe va bene così, non serve fare nulla.\n\n` +
        getEmailFooterText();
    return { subject, html, text };
}

/** Modelli per nome. Si riempie con i tipi che prevedono un'email. */
export const NOTIFICATION_EMAIL_TEMPLATES: Record<string, NotificationEmailBuilder> = {
    tenant_deletion_owner: buildTenantDeletionOwnerEmail
};

/**
 * Email pronta, oppure null se il modello non esiste o i dati non bastano:
 * per chi chiama vuol dire «fallita, inutile riprovare».
 */
export function buildNotificationEmail(
    template: string,
    data: NotificationEmailData,
    ctx: NotificationEmailContext = { siteUrl: null },
    templates: Record<string, NotificationEmailBuilder> = NOTIFICATION_EMAIL_TEMPLATES
): EmailContent | null {
    const builder = Object.prototype.hasOwnProperty.call(templates, template)
        ? templates[template]
        : undefined;
    if (!builder) return null;
    return builder(data ?? {}, ctx);
}

/** Tentativi massimi per email (claim e edge usano lo stesso numero). */
export const NOTIFICATION_EMAIL_MAX_ATTEMPTS = 3;

/**
 * Dopo un invio fallito: minuti d'attesa prima del tentativo successivo,
 * oppure null se i tentativi sono finiti (l'email va a 'failed').
 * `attempts` è il numero di tentativi già fatti, compreso quello appena fallito.
 */
export function nextRetryDelayMinutes(
    attempts: number,
    maxAttempts: number = NOTIFICATION_EMAIL_MAX_ATTEMPTS
): number | null {
    if (attempts >= maxAttempts) return null;
    return attempts <= 1 ? 5 : 30;
}

/** Stringa da `data`, o null se manca o è vuota. */
export function dataString(data: NotificationEmailData, key: string): string | null {
    const v = data[key];
    if (typeof v === "string" && v.trim().length > 0) return v;
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
    return null;
}
