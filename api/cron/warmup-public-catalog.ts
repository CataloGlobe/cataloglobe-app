import type { VercelRequest, VercelResponse } from "@vercel/node";

/**
 * Cron: `* * * * *` — pings /api/public-catalog?warmup=1 each minute.
 *
 * Purpose: keep both the Vercel serverless lambda and the downstream
 * Supabase Edge Function (resolve-public-catalog) hot, removing the
 * Deno cold-start tax (~1100 ms median) from real user requests.
 *
 * Auth: `Authorization: Bearer ${CRON_SECRET}`. Vercel cron sends this
 * header automatically when CRON_SECRET is configured at the project
 * level, mirroring the pattern in status-check.ts.
 *
 * The warmup branch at /api/public-catalog?warmup=1 forwards `x-warmup: 1`
 * to the upstream edge function, which early-returns without any DB call.
 * Neither layer touches Redis nor Postgres on this path.
 *
 * Vercel cron minimum interval requires the Pro plan; on Hobby this entry
 * will be rejected. Verify the project tier before registering the
 * schedule in the Vercel dashboard.
 */

type WarmupOutcome = "ok" | "failed";

type CronSummary = {
    event: "warmup_public_catalog_cron";
    warmup: WarmupOutcome;
    upstreamStatus: number;
    durationMs: number;
    upstreamError?: string;
};

function isAuthorized(req: VercelRequest): boolean {
    const secret = process.env.CRON_SECRET;
    if (!secret) return false;
    const header = req.headers["authorization"];
    if (typeof header !== "string") return false;
    return header === `Bearer ${secret}`;
}

function resolveTargetUrl(): string {
    const explicit = process.env.WARMUP_TARGET_BASE_URL;
    if (explicit) return `${explicit.replace(/\/+$/, "")}/api/public-catalog?warmup=1`;
    const vercelHost = process.env.VERCEL_URL;
    if (vercelHost) return `https://${vercelHost}/api/public-catalog?warmup=1`;
    return "/api/public-catalog?warmup=1";
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

    const target = resolveTargetUrl();
    const startedAt = Date.now();
    let ok = false;
    let upstreamStatus = 0;
    let upstreamError: string | undefined;
    try {
        const upstream = await fetch(target, { method: "GET" });
        upstreamStatus = upstream.status;
        ok = upstream.ok;
    } catch (err) {
        upstreamError = err instanceof Error ? err.message : String(err);
    }

    const body: CronSummary = {
        event: "warmup_public_catalog_cron",
        warmup: ok ? "ok" : "failed",
        upstreamStatus,
        durationMs: Date.now() - startedAt,
        ...(upstreamError ? { upstreamError } : {})
    };
    console.log(JSON.stringify(body));
    res.setHeader("Cache-Control", "no-store");
    res.status(ok ? 200 : 502).json(body);
}
