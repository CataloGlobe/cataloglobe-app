// Notifiche dell'abbonamento (`stripe-webhook`): solo campanella, solo
// all'owner (deciso da Lorenzo il 2026-10-15). Qui la parte pura: dall'evento
// Stripe e dal tenant all'input di `notify`. Tipi e testi nel catalogo
// (mig `20261015050000`).

import type { NotifyInput } from "./notifyArgs.ts";

export interface BillingTenant {
    id: string;
    name: string | null;
}

/** "14 novembre 2026" in ora italiana, da secondi Unix; null se non valido. */
export function formatUnixDateIt(seconds: number | null | undefined): string | null {
    if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds <= 0) return null;
    return new Date(seconds * 1000).toLocaleDateString("it-IT", {
        timeZone: "Europe/Rome",
        day: "numeric",
        month: "long",
        year: "numeric"
    });
}

/**
 * Pagamento fallito. Stripe riprova la stessa fattura più volte e ogni
 * tentativo è un evento: un avviso per fattura (dedupe sull'id).
 */
export function buildPaymentFailedNotify(tenant: BillingTenant, invoiceId: string): NotifyInput {
    return {
        eventType: "billing.payment_failed",
        recipients: { tenantOwner: true },
        tenantId: tenant.id,
        data: { tenant_name: tenant.name ?? "la tua attività", invoice_id: invoiceId },
        dedupeKey: `billing:payment_failed:${invoiceId}`
    };
}

/** Prova in scadenza, o null se Stripe non manda la data di fine. */
export function buildTrialEndingNotify(
    tenant: BillingTenant,
    subscriptionId: string,
    trialEnd: number | null | undefined
): NotifyInput | null {
    const label = formatUnixDateIt(trialEnd);
    if (!label) return null;
    return {
        eventType: "billing.trial_ending",
        recipients: { tenantOwner: true },
        tenantId: tenant.id,
        data: { tenant_name: tenant.name ?? "la tua attività", trial_end_label: label },
        dedupeKey: `billing:trial_ending:${subscriptionId}:${trialEnd}`
    };
}
