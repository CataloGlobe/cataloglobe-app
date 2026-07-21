import type { VercelRequest, VercelResponse } from "@vercel/node";

import { pgrest } from "../_lib/statusSupabase.js";
import { timingSafeCompare } from "../_lib/timingSafeCompare.js";

/**
 * Cron: `0 3 * * *` — cancella `status_checks.checked_at < now() - 90 days`.
 *
 * Auth: `Authorization: Bearer <CRON_SECRET>`.
 *
 * Volume atteso (verifica dimensionamento):
 *   - 4 servizi × 30 check/ora = 720 check/giorno per servizio = 2880/giorno totali
 *   - Finestra di 90 giorni → ~260k righe massime — trascurabile per Postgres
 *
 * Non interrompiamo il cron se la DELETE fallisce: il job riproverà domani.
 */

function isAuthorized(req: VercelRequest): boolean {
    const secret = process.env.CRON_SECRET;
    if (!secret) return false;
    const header = req.headers["authorization"];
    if (typeof header !== "string") return false;
    const match = header.match(/^Bearer\s+(.+)$/);
    if (!match) return false;
    return timingSafeCompare(match[1], secret);
}

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

    const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const startedAt = Date.now();

    // PostgREST DELETE con filtro: ?checked_at=lt.<cutoff>
    // Prefer "return=representation" ci darebbe le righe cancellate; usiamo
    // return=minimal per evitare payload inutilmente grandi. Per il count
    // approssimativo del log usiamo "count=exact" + leggiamo Content-Range.
    //
    // Implementazione attuale: pgrest non legge gli header → loggiamo solo
    // l'esito (ok/fail) e durata. Sufficiente per uno strumento di pulizia.
    const result = await pgrest("status_checks", {
        method: "DELETE",
        query: `checked_at=lt.${encodeURIComponent(cutoff)}`,
        prefer: "return=minimal"
    });

    const durationMs = Date.now() - startedAt;

    if (!result.ok) {
        const body = {
            event: "status_prune_cron",
            ok: false,
            cutoff,
            durationMs,
            status: result.status,
            error: result.error.slice(0, 300)
        };
        console.error(JSON.stringify(body));
        res.setHeader("Cache-Control", "no-store");
        res.status(500).json(body);
        return;
    }

    const body = {
        event: "status_prune_cron",
        ok: true,
        cutoff,
        durationMs
    };
    console.log(JSON.stringify(body));
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json(body);
}
