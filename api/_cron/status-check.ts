import type { VercelRequest, VercelResponse } from "@vercel/node";

import {
    runAllChecks,
    SERVICE_KEYS,
    type CheckResult,
    type CheckStatus,
    type ServiceKey
} from "../_lib/statusServices.js";
import {
    decideAlert,
    dispatchAlert,
    type ServiceStateRow
} from "../_lib/statusAlerts.js";
import { pgrest } from "../_lib/statusSupabase.js";

/**
 * Cron: `*\/2 * * * *` — esegue health-check su 4 servizi.
 *
 * Pipeline:
 *   1. Auth: `Authorization: Bearer <CRON_SECRET>` (Vercel cron lo manda
 *      automaticamente quando CRON_SECRET è settato nel project).
 *   2. Esegue runAllChecks() in parallelo.
 *   3. Per ogni risultato:
 *        a. INSERT in status_checks (storico append-only).
 *        b. SELECT su status_service_state per il service_key.
 *        c. Confronta last_notified_status con current → decideAlert().
 *        d. Se shouldNotify, manda email via Resend.
 *        e. UPSERT su status_service_state (last_status, last_check_at,
 *           e — se inviata email — last_notified_status/last_notified_at).
 *   4. Risposta JSON con summary dei 4 check (utile per curl manuale).
 *
 * Best-effort: i fallimenti su scritture (PostgREST, email Resend) NON
 * fanno fallire l'intero cron — vengono loggati. Vercel ha già un retry
 * automatico sui cron failed, ma ri-eseguire status-check è benigno.
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

    const summary: CronSummary["results"] = [];

    for (const c of filteredChecks) {
        await persistCheckRow(c, checkedAt);
        const previousState = await readServiceState(c.serviceKey);
        const decision = decideAlert(c, previousState);

        let alertSent = false;
        let alertError: string | undefined;
        if (decision.shouldNotify) {
            const dispatch = await dispatchAlert({
                check: c,
                previousNotifiedStatus: decision.previousNotifiedStatus,
                statusPageUrl,
                checkedAt
            });
            alertSent = dispatch.sent;
            if (!dispatch.sent) alertError = dispatch.error;
        }

        await upsertServiceState({
            serviceKey: c.serviceKey,
            currentStatus: c.status,
            previousState,
            checkedAt,
            notifiedNow: alertSent
        });

        summary.push({
            serviceKey: c.serviceKey,
            status: c.status,
            responseTimeMs: c.responseTimeMs,
            error: c.error,
            alertSent,
            ...(alertError ? { alertError } : {})
        });
    }

    const body: CronSummary = {
        event: "status_check_cron",
        checkedAt,
        results: summary
    };
    console.log(JSON.stringify(body));
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json(body);
}
