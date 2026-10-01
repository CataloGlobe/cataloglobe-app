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
    loadAlertInputs,
    type AlertInputs,
    type PendingAlert,
    type ServiceStateRow
} from "../_lib/statusAlerts.js";
import { pgrest, readPreviousObservation } from "../_lib/statusSupabase.js";
import { readAlertState, writeAlertState, writeCycle } from "../_lib/statusRedis.js";

/** Tetto di ogni chiamata DB del ciclo (storico e ripiego degli avvisi). */
const DB_TIMEOUT_MS = 5_000;
import { timingSafeCompare } from "../_lib/timingSafeCompare.js";

/**
 * Health-check dei 4 servizi della status page, ogni 2 minuti.
 *
 * Chi lo avvia: uno scheduler ESTERNO (non c'è un blocco `crons` in
 * vercel.json, tolto per il piano Hobby in e3248935), con
 * `Authorization: Bearer <CRON_SECRET>`.
 *
 * Pipeline:
 *   1. Auth CRON_SECRET.
 *   2. runAllChecks() in parallelo (10 s per probe; dashboard derivata da
 *      HTML statico + database + auth, vedi combineDashboard).
 *   3. Redis (fonte primaria, statusRedis.ts): stato corrente + contatori
 *      uptime del giorno. Best-effort.
 *   4. Per ogni servizio, ingressi dell'isteresi da Redis (`status:alert`);
 *      se la lettura fallisce o la chiave manca → dal DB come prima
 *      (loadAlertInputs). decideAlertWithHysteresis: email solo per 'down'
 *      confermato su 2 controlli consecutivi e per il rientro; 'degraded'
 *      non manda email.
 *   5. UNA dispatchGroupedAlert() per ciclo con tutti i servizi cambiati.
 *      Su failure: log, `lastNotified` non avanza → ritentata al ciclo dopo.
 *   6. Redis: stato avvisi aggiornato per ogni servizio.
 *   7. DB come storico (status_checks + status_service_state), in parallelo
 *      per servizio e con timeout DB_TIMEOUT_MS: un DB lento non ritarda né
 *      blocca avvisi e pagina.
 *   8. Risposta JSON col riepilogo (utile per curl manuale).
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
    const match = header.match(/^Bearer\s+(.+)$/);
    if (!match) return false;
    return timingSafeCompare(match[1], secret);
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
        prefer: "return=minimal",
        timeoutMs: DB_TIMEOUT_MS
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
        query: `select=*&service_key=eq.${encodeURIComponent(serviceKey)}&limit=1`,
        timeoutMs: DB_TIMEOUT_MS
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
        prefer: "resolution=merge-duplicates,return=minimal",
        timeoutMs: DB_TIMEOUT_MS
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

/** Ripiego degli avvisi sul DB (com'era prima di Redis). */
async function readAlertInputsFromDb(
    serviceKey: ServiceKey
): Promise<Omit<AlertInputs, "source">> {
    const [prevObservedRaw, state] = await Promise.all([
        readPreviousObservation(serviceKey, DB_TIMEOUT_MS),
        readServiceState(serviceKey)
    ]);
    return {
        previousObserved: prevObservedRaw as CheckStatus | null,
        lastNotified: (state?.last_notified_status ?? null) as CheckStatus | null,
        lastNotifiedAt: state?.last_notified_at ?? null
    };
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
        alertSource: AlertInputs["source"];
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

    // 3. Redis prima di tutto: pagina e uptime non dipendono dal DB.
    await writeCycle(filteredChecks, checkedAt);

    // 4. Ingressi dell'isteresi (Redis, o DB se Redis non risponde) + decisione.
    const pending: PendingAlert[] = [];
    const contexts: Array<{ check: CheckResult; inputs: AlertInputs }> = [];
    for (const c of filteredChecks) {
        const inputs = await loadAlertInputs(await readAlertState(c.serviceKey), () =>
            readAlertInputsFromDb(c.serviceKey)
        );
        const decision = decideAlertWithHysteresis(
            c,
            { last_notified_status: inputs.lastNotified },
            inputs.previousObserved
        );
        if (decision.shouldNotify) {
            pending.push({
                serviceKey: c.serviceKey,
                currentStatus: c.status,
                previousNotifiedStatus: decision.previousNotifiedStatus,
                responseTimeMs: c.responseTimeMs,
                error: c.error
            });
        }
        contexts.push({ check: c, inputs });
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

    // 6. Stato avvisi su Redis. `lastNotified` avanza solo se l'email è partita.
    const pendingSet = new Set(pending.map((p) => p.serviceKey));
    const notified = (key: ServiceKey) => groupSent && pendingSet.has(key);
    await Promise.all(
        contexts.map(({ check, inputs }) =>
            writeAlertState(check.serviceKey, {
                lastObserved: check.status,
                lastNotified: notified(check.serviceKey) ? check.status : inputs.lastNotified,
                lastNotifiedAt: notified(check.serviceKey) ? checkedAt : inputs.lastNotifiedAt
            })
        )
    );

    // 7. Storico sul DB, in parallelo per servizio e con timeout.
    await Promise.all(
        contexts.map(async ({ check }) => {
            await persistCheckRow(check, checkedAt);
            const previousState = await readServiceState(check.serviceKey);
            await upsertServiceState({
                serviceKey: check.serviceKey,
                currentStatus: check.status,
                previousState,
                checkedAt,
                notifiedNow: notified(check.serviceKey)
            });
        })
    );

    const summary: CronSummary["results"] = contexts.map(({ check, inputs }) => {
        const row: CronSummary["results"][number] = {
            serviceKey: check.serviceKey,
            status: check.status,
            responseTimeMs: check.responseTimeMs,
            error: check.error,
            alertSent: notified(check.serviceKey),
            alertSource: inputs.source
        };
        if (pendingSet.has(check.serviceKey) && !groupSent && groupError) {
            row.alertError = groupError;
        }
        return row;
    });

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
