/**
 * Sistema di alert email per la status page.
 *
 * Politica anti-spam (vedi spec §4):
 *   - Email solo su CAMBIO di stato persistente per il servizio.
 *   - "Cambio di stato" = `currentStatus !== last_notified_status` (campo
 *     persistito su `status_service_state`).
 *   - Eccezione: se `last_notified_status` è NULL (primo check di sempre per
 *     quel servizio) NON si manda email per `up` (sarebbe rumore); si
 *     manda solo se il primo check è già `degraded` o `down`.
 *
 * Mailer: Resend via REST API diretta (`POST https://api.resend.com/emails`).
 * Niente SDK npm — coerente con il vincolo "no new npm deps" di CLAUDE.md.
 *
 * Sender identity: `CataloGlobe <noreply@cataloglobe.com>` (riutilizza il
 * dominio già verificato in Resend e usato da `send-otp`, `send-tenant-invite`,
 * `join-waitlist`). Vedi `src/config/company.ts` → COMPANY.email.sender.
 *
 * Destinatario: env `MONITORING_ALERT_EMAIL` (default
 * `lorenzo.calzi@cataloglobe.com` per fail-safe ma DEVE essere settata).
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

export function decideAlert(
    current: CheckResult,
    state: ServiceStateRow | null
): AlertDecision {
    const previous = (state?.last_notified_status ?? null) as CheckStatus | null;
    const isInitial = previous === null;
    const isUpInitial = isInitial && current.status === "up";

    // Politica:
    //   - bootstrap (mai notificato prima) + up    → no email (rumore)
    //   - bootstrap + degraded/down                → email (è la prima volta che si segnala)
    //   - già notificato in passato → email solo se transizione
    const shouldNotify = !isUpInitial && previous !== current.status;
    return {
        serviceKey: current.serviceKey,
        shouldNotify,
        previousNotifiedStatus: previous,
        currentStatus: current.status
    };
}

function statusLabel(s: CheckStatus): string {
    if (s === "up") return "OPERATIVO";
    if (s === "degraded") return "DEGRADATO";
    return "DOWN";
}

function buildSubject(serviceKey: ServiceKey, status: CheckStatus): string {
    return `[CataloGlobe] ${SERVICE_LABELS[serviceKey]} è ${statusLabel(status)}`;
}

function buildBody(args: {
    serviceKey: ServiceKey;
    currentStatus: CheckStatus;
    previousStatus: CheckStatus | null;
    error: string | null;
    responseTimeMs: number | null;
    statusPageUrl: string;
    checkedAt: string;
}): string {
    const lines: string[] = [
        `Servizio: ${SERVICE_LABELS[args.serviceKey]}`,
        `Stato attuale: ${statusLabel(args.currentStatus)}`,
        `Stato precedente: ${args.previousStatus ? statusLabel(args.previousStatus) : "—"}`,
        `Timestamp: ${args.checkedAt}`
    ];
    if (args.responseTimeMs !== null && args.responseTimeMs !== undefined) {
        lines.push(`Tempo risposta: ${args.responseTimeMs} ms`);
    }
    if (args.error) {
        lines.push(`Errore: ${args.error}`);
    }
    lines.push("");
    lines.push(`Verifica: ${args.statusPageUrl}`);
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

export async function dispatchAlert(args: {
    check: CheckResult;
    previousNotifiedStatus: CheckStatus | null;
    statusPageUrl: string;
    checkedAt: string;
}): Promise<{ sent: boolean; error?: string }> {
    const apiKey = process.env.RESEND_API_KEY;
    const to = process.env.MONITORING_ALERT_EMAIL;
    if (!apiKey) {
        return { sent: false, error: "Missing RESEND_API_KEY env var" };
    }
    if (!to) {
        return { sent: false, error: "Missing MONITORING_ALERT_EMAIL env var" };
    }
    const subject = buildSubject(args.check.serviceKey, args.check.status);
    const text = buildBody({
        serviceKey: args.check.serviceKey,
        currentStatus: args.check.status,
        previousStatus: args.previousNotifiedStatus,
        error: args.check.error,
        responseTimeMs: args.check.responseTimeMs,
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
