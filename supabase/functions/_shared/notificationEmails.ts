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

import type { EmailContent } from "./emailLayout.ts";

export type NotificationEmailData = Record<string, unknown>;

export type NotificationEmailBuilder = (data: NotificationEmailData) => EmailContent | null;

/** Modelli per nome. Si riempie con i tipi che prevedono un'email. */
export const NOTIFICATION_EMAIL_TEMPLATES: Record<string, NotificationEmailBuilder> = {};

/**
 * Email pronta, oppure null se il modello non esiste o i dati non bastano:
 * per chi chiama vuol dire «fallita, inutile riprovare».
 */
export function buildNotificationEmail(
    template: string,
    data: NotificationEmailData,
    templates: Record<string, NotificationEmailBuilder> = NOTIFICATION_EMAIL_TEMPLATES
): EmailContent | null {
    const builder = Object.prototype.hasOwnProperty.call(templates, template)
        ? templates[template]
        : undefined;
    if (!builder) return null;
    return builder(data ?? {});
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
