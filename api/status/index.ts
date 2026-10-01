import type { VercelRequest, VercelResponse } from "@vercel/node";

import { pgrest } from "../_lib/statusSupabase.js";
import { readCurrent, readUptime, UPTIME_DAYS } from "../_lib/statusRedis.js";

/**
 * GET /api/status — dati della status page pubblica.
 *
 * Stato corrente e uptime a 90 giorni vengono da Redis (scritti da
 * api/cron/status-check.ts): la pagina funziona anche a database giù, ed è
 * proprio il caso in cui serve. Gli incidenti vengono dal DB
 * (`status_incidents`), con un tetto di attesa: se il DB non risponde
 * arrivano vuoti con `incidentsAvailable: false` e il resto della pagina
 * resta in piedi.
 *
 * Risposte:
 *   200 → StatusOverviewResponse (`current: null` se il monitor non ha mai
 *         scritto in questo ambiente).
 *   503 → Redis non raggiungibile: niente da mostrare. La pagina tiene gli
 *         ultimi dati con l'avviso «dati non aggiornati».
 */

const INCIDENTS_TIMEOUT_MS = 3_000;
const RECENT_INCIDENTS_LIMIT = 5;

type IncidentsResult = { ok: true; active: unknown[]; recent: unknown[] } | { ok: false };

async function readIncidents(): Promise<IncidentsResult> {
    const [active, recent] = await Promise.all([
        pgrest<unknown[]>("status_incidents", {
            query: "select=*&resolved_at=is.null&order=started_at.desc",
            timeoutMs: INCIDENTS_TIMEOUT_MS
        }),
        pgrest<unknown[]>("status_incidents", {
            query: `select=*&resolved_at=not.is.null&order=started_at.desc&limit=${RECENT_INCIDENTS_LIMIT}`,
            timeoutMs: INCIDENTS_TIMEOUT_MS
        })
    ]);
    if (!active.ok || !recent.ok) {
        console.error(
            JSON.stringify({
                event: "status_incidents_read_failed",
                active: active.ok ? null : active.error.slice(0, 200),
                recent: recent.ok ? null : recent.error.slice(0, 200)
            })
        );
        return { ok: false };
    }
    return {
        ok: true,
        active: Array.isArray(active.data) ? active.data : [],
        recent: Array.isArray(recent.data) ? recent.data : []
    };
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
    if (req.method !== "GET") {
        res.setHeader("Allow", "GET");
        res.status(405).json({ error: { code: "method_not_allowed" } });
        return;
    }

    // Incidenti in parallelo con Redis: il loro timeout non si somma.
    const incidentsPromise = readIncidents().catch((): IncidentsResult => ({ ok: false }));

    let current;
    let uptime;
    try {
        [current, uptime] = await Promise.all([readCurrent(), readUptime(new Date(), UPTIME_DAYS)]);
    } catch (err) {
        console.error(
            JSON.stringify({
                event: "status_overview_redis_failed",
                error: err instanceof Error ? `${err.name}: ${err.message}` : String(err)
            })
        );
        res.setHeader("Cache-Control", "no-store");
        res.status(503).json({ error: { code: "status_unavailable" } });
        return;
    }

    const incidents = await incidentsPromise;

    res.setHeader("Cache-Control", "public, s-maxage=30, stale-while-revalidate=60");
    res.status(200).json({
        current,
        uptime,
        activeIncidents: incidents.ok ? incidents.active : [],
        recentIncidents: incidents.ok ? incidents.recent : [],
        incidentsAvailable: incidents.ok
    });
}
