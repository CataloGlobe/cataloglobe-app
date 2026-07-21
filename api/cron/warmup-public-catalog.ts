import type { VercelRequest, VercelResponse } from "@vercel/node";

import { timingSafeCompare } from "../_lib/timingSafeCompare.js";

/**
 * Cron: `* * * * *` — pings two warmup endpoints each minute:
 *   - /api/public-catalog?warmup=1
 *   - /api/ssr-render?warmup=1 (header x-warmup:1)
 *
 * Purpose: keep hot BOTH Vercel serverless lambdas (public-catalog AND
 * ssr-render — distinct functions, distinct containers) plus the downstream
 * Supabase Edge Function (resolve-public-catalog), removing both the Node
 * lambda cold start and the Deno cold-start tax (~1100 ms median) from real
 * user requests. The user-facing /<slug> page is served by ssr-render, so
 * warming public-catalog alone left that container cold.
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

type TargetResult = {
    target: string;
    warmup: WarmupOutcome;
    upstreamStatus: number;
    durationMs: number;
    upstreamError?: string;
};

type CronSummary = {
    event: "warmup_public_catalog_cron";
    results: TargetResult[];
};

function isAuthorized(req: VercelRequest): boolean {
    const secret = process.env.CRON_SECRET;
    if (!secret) return false;
    const header = req.headers["authorization"];
    if (typeof header !== "string") return false;
    const match = header.match(/^Bearer\s+(.+)$/);
    if (!match) return false;
    return timingSafeCompare(match[1], secret);
}

// Base host priority (stessa logica di prima, ma estratta dal path così da
// poterla riusare per più target):
//   1. WARMUP_TARGET_BASE_URL env (explicit override, e.g. public domain).
//   2. Inbound request host header. x-forwarded-host wins over host because
//      the Vercel proxy rewrites host while preserving the public domain
//      on x-forwarded-host. This makes the self-call hit the same public
//      domain the cron itself was invoked on, dodging Deployment Protection
//      on the bare .vercel.app URL.
//   3. VERCEL_URL env (fallback to the deployment domain).
//   4. Empty base (last resort: relative path; fetch will reject without a base).
function resolveBaseUrl(req: VercelRequest): string {
    const explicit = process.env.WARMUP_TARGET_BASE_URL;
    if (explicit) return explicit.replace(/\/+$/, "");

    const forwarded = req.headers["x-forwarded-host"];
    const inboundHost = Array.isArray(forwarded)
        ? forwarded[0]
        : forwarded ?? req.headers.host;
    if (inboundHost) return `https://${inboundHost}`;

    const vercelHost = process.env.VERCEL_URL;
    if (vercelHost) return `https://${vercelHost}`;
    return "";
}

// Ping singolo target. NON lancia mai: cattura l'errore internamente così che
// in Promise.all un target fallito non faccia cadere l'altro (warmth dei due
// lambda è indipendente).
async function pingTarget(
    target: string,
    headers?: Record<string, string>
): Promise<TargetResult> {
    const startedAt = Date.now();
    let ok = false;
    let upstreamStatus = 0;
    let upstreamError: string | undefined;
    try {
        const upstream = await fetch(target, {
            method: "GET",
            ...(headers ? { headers } : {})
        });
        upstreamStatus = upstream.status;
        ok = upstream.ok;
    } catch (err) {
        upstreamError = err instanceof Error ? err.message : String(err);
    }
    return {
        target,
        warmup: ok ? "ok" : "failed",
        upstreamStatus,
        durationMs: Date.now() - startedAt,
        ...(upstreamError ? { upstreamError } : {})
    };
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

    const base = resolveBaseUrl(req);

    // Due target per tick — due Serverless Function distinte, due cold start
    // indipendenti:
    //   - api/public-catalog?warmup=1 → inoltra x-warmup all'edge resolve-public-catalog.
    //   - api/ssr-render?warmup=1 (header x-warmup:1) → scalda il lambda SSR che
    //     serve davvero /<slug> (rewrite vercel.json). Senza questo il container
    //     ssr-render resta freddo: la richiesta utente pagava ~3,4s di cold start.
    // pingTarget non lancia mai → un target fallito non blocca l'altro.
    const results = await Promise.all([
        pingTarget(`${base}/api/public-catalog?warmup=1`),
        pingTarget(`${base}/api/ssr-render?warmup=1`, { "x-warmup": "1" })
    ]);

    const allOk = results.every((r) => r.warmup === "ok");
    const body: CronSummary = {
        event: "warmup_public_catalog_cron",
        results
    };
    console.log(JSON.stringify(body));
    res.setHeader("Cache-Control", "no-store");
    res.status(allOk ? 200 : 502).json(body);
}
