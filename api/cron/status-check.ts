import type { VercelRequest, VercelResponse } from "@vercel/node";

import {
    runAllChecks,
    SERVICE_KEYS,
    type CheckResult,
    type CheckStatus,
    type ServiceKey
} from "../_lib/statusServices.js";
import {
    decideAlertWithHysteresis,
    dispatchGroupedAlert,
    type PendingAlert,
    type ServiceStateRow
} from "../_lib/statusAlerts.js";
import { pgrest, readPreviousObservation } from "../_lib/statusSupabase.js";

/**
 * Cron: `*\/2 * * * *` — esegue health-check su 4 servizi.
 *
 * Pipeline (post audit #3, 2026-06-06 — isteresi + grouped email):
 *   1. Auth: `Authorization: Bearer <CRON_SECRET>` (Vercel cron lo manda
 *      automaticamente quando CRON_SECRET è settato nel project).
 *   2. Esegue runAllChecks() in parallelo (timeout 10s per probe).
 *   3. Per ogni risultato (in serie, perché ogni step legge/scrive DB):
 *        a. SELECT status dell'ULTIMA riga in status_checks per il service
 *           (= previousObservedStatus, prima del persist corrente).
 *        b. INSERT in status_checks (storico append-only, raw — la riga
 *           riflette il singolo check, NON applica isteresi).
 *        c. SELECT su status_service_state per il service_key
 *           (= last_notified_status).
 *        d. decideAlertWithHysteresis(c, state, prevObserved):
 *             shouldNotify true SOLO se 2 check consecutivi confermano
 *             entry-into-down o recovery. Singolo blip / flapping silent.
 *        e. Se shouldNotify → accumula in pending[].
 *   4. UNA dispatchGroupedAlert() per ciclo se pending.length > 0
 *      (1 email Resend con tutti i servizi cambiati). Su failure:
 *      console.error con status+errore esatto (mai swallow silenzioso).
 *   5. Per ogni servizio: UPSERT su status_service_state.
 *      `last_notified_*` aggiornato solo se groupSent && service ∈ pending.
 *      Se groupSent=false: last_notified_* resta intatto → retry al prossimo
 *      ciclo (idempotente, niente perdita di transizioni).
 *   6. Risposta JSON con summary dei 4 check (utile per curl manuale).
 *
 * Best-effort: i fallimenti su scritture DB / Resend vengono loggati ma
 * non fanno fallire l'intero cron. Vercel ha retry automatico sui cron
 * failed e ri-eseguire status-check è benigno.
 */

const STATUS_PAGE_PATHS = ["/status"];

function buildStatusPageUrl(): string {
    const base = process.env.STATUS_TARGET_BASE_URL;
    if (base) return `${base.replace(/\/+$/, "")}${STATUS_PAGE_PATHS[0]}`;
    return STATUS_PAGE_PATHS[0];
}

function isAuthorized(req: VercelRequest): boolean {
    const secret = process.env.CRON_SECRET;
    if (!secret) return false;
    const header = req.headers["authorization"];
    if (typeof header !== "string") return false;
    return header === `Bearer ${secret}`;
}

async function persistCheckRow(c: CheckResult, checkedAt: string): Promise<void> {
    const row = {
        service_key: c.serviceKey,
        status: c.status,
        response_time_ms: c.responseTimeMs,
        error_message: c.error,
        checked_at: checkedAt
    };
    const res = await pgrest("status_checks", {
        method: "POST",
        body: row,
        prefer: "return=minimal"
    });
    if (!res.ok) {
        console.error(
            JSON.stringify({
                event: "status_check_persist_failed",
                serviceKey: c.serviceKey,
                status: res.status,
                error: res.error.slice(0, 200)
            })
        );
    }
}

async function readServiceState(serviceKey: ServiceKey): Promise<ServiceStateRow | null> {
    const res = await pgrest<ServiceStateRow[]>("status_service_state", {
        query: `select=*&service_key=eq.${encodeURIComponent(serviceKey)}&limit=1`
    });
    if (!res.ok) {
        console.error(
            JSON.stringify({
                event: "status_state_read_failed",
                serviceKey,
                status: res.status,
                error: res.error.slice(0, 200)
            })
        );
        return null;
    }
    const rows = Array.isArray(res.data) ? res.data : [];
    return rows[0] ?? null;
}

async function upsertServiceState(args: {
    serviceKey: ServiceKey;
    currentStatus: CheckStatus;
    previousState: ServiceStateRow | null;
    checkedAt: string;
    notifiedNow: boolean;
}): Promise<void> {
    const statusChanged =
        args.previousState === null || args.previousState.last_status !== args.currentStatus;
    const row = {
        service_key: args.serviceKey,
        last_status: args.currentStatus,
        last_status_changed_at: statusChanged
            ? args.checkedAt
            : (args.previousState?.last_status_changed_at ?? args.checkedAt),
        last_notified_status: args.notifiedNow
            ? args.currentStatus
            : (args.previousState?.last_notified_status ?? null),
        last_notified_at: args.notifiedNow
            ? args.checkedAt
            : (args.previousState?.last_notified_at ?? null),
        last_check_at: args.checkedAt,
        updated_at: args.checkedAt
    };
    // PostgREST upsert: Prefer "resolution=merge-duplicates" combinato con
    // POST + on_conflict sulla PK. status_service_state ha PK su service_key.
    const res = await pgrest("status_service_state", {
        method: "POST",
        body: row,
        query: "on_conflict=service_key",
        prefer: "resolution=merge-duplicates,return=minimal"
    });
    if (!res.ok) {
        console.error(
            JSON.stringify({
                event: "status_state_upsert_failed",
                serviceKey: args.serviceKey,
                status: res.status,
                error: res.error.slice(0, 200)
            })
        );
    }
}

type CronSummary = {
    event: "status_check_cron";
    checkedAt: string;
    results: Array<{
        serviceKey: ServiceKey;
        status: CheckStatus;
        responseTimeMs: number | null;
        error: string | null;
        alertSent: boolean;
        alertError?: string;
    }>;
    alertError?: string;
};

export default async function handler(
    req: VercelRequest,
    res: VercelResponse
): Promise<void> {
    if (req.method !== "GET" && req.method !== "POST") {
        res.setHeader("Allow", "GET, POST");
        res.status(405).json({ error: "method_not_allowed" });
        return;
    }
    if (!isAuthorized(req)) {
        res.status(401).json({ error: "unauthorized" });
        return;
    }

    const checkedAt = new Date().toISOString();
    const statusPageUrl = buildStatusPageUrl();
    const checks = await runAllChecks();

    // Validazione di ordine/key: SERVICE_KEYS è la source of truth dei
    // service_key validi. Non insertiamo righe inattese.
    const validKeys = new Set<string>(SERVICE_KEYS);
    const filteredChecks = checks.filter((c) => validKeys.has(c.serviceKey));

    const pending: PendingAlert[] = [];
    const stateContext: Array<{
        check: CheckResult;
        previousState: ServiceStateRow | null;
    }> = [];

    for (const c of filteredChecks) {
        // 1. ULTIMA riga precedente per service (PRIMA del persist corrente).
        const prevObservedRaw = await readPreviousObservation(c.serviceKey);
        const prevObserved = prevObservedRaw as CheckStatus | null;
        // 2. Persist riga raw del check corrente.
        await persistCheckRow(c, checkedAt);
        // 3. Stato di notifica corrente.
        const previousState = await readServiceState(c.serviceKey);
        // 4. Decisione con isteresi a 2 consecutivi.
        const decision = decideAlertWithHysteresis(c, previousState, prevObserved);
        if (decision.shouldNotify) {
            pending.push({
                serviceKey: c.serviceKey,
                currentStatus: c.status,
                previousNotifiedStatus: decision.previousNotifiedStatus,
                responseTimeMs: c.responseTimeMs,
                error: c.error
            });
        }
        stateContext.push({ check: c, previousState });
    }

    // 5. UNA email grouped per ciclo, solo se ci sono pending.
    let groupSent = false;
    let groupError: string | undefined;
    if (pending.length > 0) {
        const result = await dispatchGroupedAlert({
            items: pending,
            statusPageUrl,
            checkedAt
        });
        groupSent = result.sent;
        if (!result.sent) {
            groupError = result.error;
            // Visibilità fallimenti dispatch: log strutturato → Vercel logs.
            // Senza questo, una Resend rotta passerebbe silenziosa (bug
            // originale che ha portato a `last_notified_status=null` su 3/4
            // servizi nonostante eventi di down in storia).
            console.error(
                JSON.stringify({
                    event: "status_alert_dispatch_failed",
                    pendingCount: pending.length,
                    services: pending.map((p) => p.serviceKey),
                    error: groupError ?? "unknown"
                })
            );
        }
    }

    // 6. Upsert state per OGNI servizio. notifiedNow vero solo se
    // groupSent && service nel batch pending.
    const pendingSet = new Set(pending.map((p) => p.serviceKey));
    const summary: CronSummary["results"] = [];
    for (const ctx of stateContext) {
        const inPending = pendingSet.has(ctx.check.serviceKey);
        const notifiedNow = groupSent && inPending;
        await upsertServiceState({
            serviceKey: ctx.check.serviceKey,
            currentStatus: ctx.check.status,
            previousState: ctx.previousState,
            checkedAt,
            notifiedNow
        });
        const row: CronSummary["results"][number] = {
            serviceKey: ctx.check.serviceKey,
            status: ctx.check.status,
            responseTimeMs: ctx.check.responseTimeMs,
            error: ctx.check.error,
            alertSent: notifiedNow
        };
        if (inPending && !groupSent && groupError) {
            row.alertError = groupError;
        }
        summary.push(row);
    }

    const body: CronSummary = {
        event: "status_check_cron",
        checkedAt,
        results: summary,
        ...(groupError ? { alertError: groupError } : {})
    };
    console.log(JSON.stringify(body));
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json(body);
}
