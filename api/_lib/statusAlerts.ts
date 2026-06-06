/**
 * Sistema di alert email per la status page — con isteresi + raggruppamento.
 *
 * Politica (post audit #3, 2026-06-06):
 *   - Email solo per cambi di stato CONFERMATI su 2 check consecutivi.
 *     Un singolo down isolato fra due up NON manda email. Un flapping
 *     `up→down→up→down` rapido NON manda email. Soglia anti-rumore.
 *   - UNA email per ciclo cron che aggrega tutti i servizi cambiati.
 *     Se 4 servizi vanno giù insieme → 1 sola mail, non 4.
 *
 * Isteresi (`decideAlertWithHysteresis`):
 *   - Entry-into-down: cur='down' AND previousObservedStatus='down' AND
 *     last_notified_status != 'down'.
 *   - Recovery: cur != 'down' AND previousObservedStatus != 'down' (non null)
 *     AND last_notified_status == 'down'.
 *   - up <-> degraded: silent in entrambe le direzioni.
 *   - Bootstrap (no row precedente per il service): silent. Servono 2 check
 *     per confermare uno stato. 4 minuti di latenza accettati come tradeoff
 *     vs falsi positivi al freddo.
 *
 * Mailer: Resend via REST API diretta (no SDK npm, vincolo CLAUDE.md).
 * Sender: `CataloGlobe <noreply@cataloglobe.com>` (riutilizza dominio già
 * verificato in Resend, allineato a send-otp / send-tenant-invite /
 * join-waitlist; vedi `src/config/company.ts` → COMPANY.email.sender).
 *
 * Env vars consumate dal dispatch:
 *   - RESEND_API_KEY           chiave API Resend (server-side)
 *   - MONITORING_ALERT_EMAIL   destinatario singolo (es. ops inbox)
 * Il SENDER è hardcoded sopra per allineamento con gli altri mailer.
 */

import type { CheckResult, CheckStatus, ServiceKey } from "./statusServices.js";
import { SERVICE_LABELS } from "./statusServices.js";

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const SENDER = "CataloGlobe <noreply@cataloglobe.com>";

export type ServiceStateRow = {
    service_key: string;
    last_status: string;
    last_status_changed_at: string;
    last_notified_status: string | null;
    last_notified_at: string | null;
    last_check_at: string;
    updated_at: string;
};

export type AlertDecision = {
    serviceKey: ServiceKey;
    shouldNotify: boolean;
    previousNotifiedStatus: CheckStatus | null;
    currentStatus: CheckStatus;
};

export type PendingAlert = {
    serviceKey: ServiceKey;
    currentStatus: CheckStatus;
    previousNotifiedStatus: CheckStatus | null;
    responseTimeMs: number | null;
    error: string | null;
};

/**
 * Decisione alert con isteresi a 2 check consecutivi (stateless).
 *
 * `previousObservedStatus` = status del check PRECEDENTE in `status_checks`
 * (cioè la riga immediatamente prima della current, non quella appena
 * inserita). Va letto dal runner prima del persist.
 *
 * Confronto fatto su `last_notified_status` (non `last_status`): se un
 * dispatch precedente è fallito, `last_notified_status` non avanza e la
 * decisione corrente continua a considerare la transizione "non ancora
 * notificata" → l'alert viene ritentato al check successivo.
 */
export function decideAlertWithHysteresis(
    current: CheckResult,
    state: ServiceStateRow | null,
    previousObservedStatus: CheckStatus | null
): AlertDecision {
    const prevNotified = (state?.last_notified_status ?? null) as CheckStatus | null;
    const confirmedDown =
        current.status === "down" && previousObservedStatus === "down";
    const confirmedClear =
        current.status !== "down" &&
        previousObservedStatus !== null &&
        previousObservedStatus !== "down";

    let shouldNotify: boolean;
    if (prevNotified !== "down" && confirmedDown) {
        shouldNotify = true;
    } else if (prevNotified === "down" && confirmedClear) {
        shouldNotify = true;
    } else {
        shouldNotify = false;
    }

    return {
        serviceKey: current.serviceKey,
        shouldNotify,
        previousNotifiedStatus: prevNotified,
        currentStatus: current.status
    };
}

function statusLabel(s: CheckStatus): string {
    if (s === "up") return "OPERATIVO";
    if (s === "degraded") return "DEGRADATO";
    return "DOWN";
}

function summarizeCounts(items: PendingAlert[]): string {
    const counts: Record<CheckStatus, number> = { up: 0, degraded: 0, down: 0 };
    for (const it of items) counts[it.currentStatus] += 1;
    const parts: string[] = [];
    if (counts.down) parts.push(`${counts.down} DOWN`);
    if (counts.up) parts.push(`${counts.up} OPERATIVO`);
    if (counts.degraded) parts.push(`${counts.degraded} DEGRADATO`);
    return parts.join(", ");
}

function buildGroupedSubject(items: PendingAlert[]): string {
    if (items.length === 1) {
        const it = items[0];
        return `[CataloGlobe] ${SERVICE_LABELS[it.serviceKey]} è ${statusLabel(it.currentStatus)}`;
    }
    return `[CataloGlobe] Stato servizi cambiato — ${summarizeCounts(items)}`;
}

function buildGroupedBody(args: {
    items: PendingAlert[];
    statusPageUrl: string;
    checkedAt: string;
}): string {
    const lines: string[] = [];
    lines.push(`Cambi stato rilevati alle ${args.checkedAt}:`);
    lines.push("");
    for (const it of args.items) {
        const prev = it.previousNotifiedStatus
            ? statusLabel(it.previousNotifiedStatus)
            : "—";
        lines.push(
            `• ${SERVICE_LABELS[it.serviceKey]}: ${prev} → ${statusLabel(it.currentStatus)}`
        );
        const detailParts: string[] = [];
        if (it.responseTimeMs !== null && it.responseTimeMs !== undefined) {
            detailParts.push(`Risposta ${it.responseTimeMs} ms`);
        }
        if (it.error) detailParts.push(`Errore: ${it.error}`);
        if (detailParts.length) lines.push(`    ${detailParts.join(" · ")}`);
    }
    lines.push("");
    lines.push(`Status page: ${args.statusPageUrl}`);
    return lines.join("\n");
}

async function sendResendEmail(args: {
    apiKey: string;
    to: string;
    subject: string;
    text: string;
}): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
    try {
        const res = await fetch(RESEND_ENDPOINT, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${args.apiKey}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                from: SENDER,
                to: [args.to],
                subject: args.subject,
                text: args.text
            })
        });
        if (res.ok) return { ok: true };
        const body = await res.text().catch(() => "<no body>");
        return { ok: false, status: res.status, error: body.slice(0, 500) };
    } catch (err) {
        return {
            ok: false,
            status: 0,
            error: err instanceof Error ? err.message : String(err)
        };
    }
}

/**
 * Invio UNA sola email che aggrega tutti i `items` cambiati nel ciclo cron
 * corrente. Ritorna `{sent:true}` solo se Resend ritorna 2xx. Su failure
 * il caller deve loggare l'errore e NON aggiornare `last_notified_*` —
 * la transizione resterà "non notificata" e verrà ritentata al prossimo
 * ciclo (idempotente: la decisione si basa sul DB, non sulla memoria).
 */
export async function dispatchGroupedAlert(args: {
    items: PendingAlert[];
    statusPageUrl: string;
    checkedAt: string;
}): Promise<{ sent: boolean; error?: string }> {
    if (args.items.length === 0) return { sent: false };
    const apiKey = process.env.RESEND_API_KEY;
    const to = process.env.MONITORING_ALERT_EMAIL;
    if (!apiKey) return { sent: false, error: "Missing RESEND_API_KEY env var" };
    if (!to) return { sent: false, error: "Missing MONITORING_ALERT_EMAIL env var" };

    const subject = buildGroupedSubject(args.items);
    const text = buildGroupedBody({
        items: args.items,
        statusPageUrl: args.statusPageUrl,
        checkedAt: args.checkedAt
    });
    const result = await sendResendEmail({ apiKey, to, subject, text });
    if (result.ok) return { sent: true };
    return {
        sent: false,
        error: `Resend HTTP ${result.status}: ${result.error}`
    };
}
