/**
 * Definizione check per ogni servizio monitorato dalla status page.
 *
 * Ogni service-check è una funzione async che ritorna:
 *   - status: 'up' | 'degraded' | 'down'
 *   - responseTimeMs: tempo misurato
 *   - error: messaggio (solo per degraded/down)
 *
 * Regole di classificazione (uniformi per tutti i servizi):
 *   - up        → risposta < 5000ms e payload corretto
 *   - degraded  → risposta 5000–10000ms OPPURE soft-error semantico
 *                 (es. payload presente ma con campo `error`)
 *   - down      → no risposta entro 10s OPPURE errore esplicito (HTTP 5xx,
 *                 fetch fail, ping fail, JSON parse fail su endpoint atteso)
 *
 * Timeout globale: 10s. Implementato con AbortController.
 *
 * Bersaglio HTTP:
 *   - Variabile env `STATUS_TARGET_BASE_URL` (es.
 *     `https://staging.cataloglobe.com` o `https://cataloglobe.com`).
 *     Documentata nello spec finale: production / preview / dev.
 *
 * Slug canary:
 *   - `STATUS_CANARY_SLUG` (default `san-pietro-porta-venezia`).
 *
 * Dashboard: stato derivato, il peggiore tra HTML statico (Vercel), database
 * e autenticazione (`/auth/v1/health`) — senza DB o auth la dashboard non
 * serve, anche se l'HTML risponde. Vedi `combineDashboard`.
 */

import { probeDatabase } from "./statusSupabase.js";
import { Redis } from "@upstash/redis";

const CHECK_TIMEOUT_MS = 10_000;
const DEGRADED_THRESHOLD_MS = 5_000;

export type ServiceKey = "public-menu" | "dashboard" | "database" | "cache";
export type CheckStatus = "up" | "degraded" | "down";

export const SERVICE_KEYS: readonly ServiceKey[] = [
    "public-menu",
    "dashboard",
    "database",
    "cache"
] as const;

export const SERVICE_LABELS: Record<ServiceKey, string> = {
    "public-menu": "Menu pubblico",
    "dashboard": "Dashboard CataloGlobe",
    "database": "Database",
    "cache": "Cache"
};

export type CheckResult = {
    serviceKey: ServiceKey;
    status: CheckStatus;
    responseTimeMs: number | null;
    error: string | null;
};

function readTargetBaseUrl(): string {
    const url = process.env.STATUS_TARGET_BASE_URL;
    if (!url) {
        throw new Error(
            "Missing env var STATUS_TARGET_BASE_URL (es. https://staging.cataloglobe.com)"
        );
    }
    return url.replace(/\/+$/, "");
}

function readCanarySlug(): string {
    return process.env.STATUS_CANARY_SLUG ?? "san-pietro-porta-venezia";
}

function vercelBypassHeader(): Record<string, string> {
    const secret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
    return secret ? { "x-vercel-protection-bypass": secret } : {};
}

function classifyByTiming(ms: number, hardFail: boolean, softFail: boolean): CheckStatus {
    if (hardFail) return "down";
    if (softFail) return "degraded";
    if (ms > CHECK_TIMEOUT_MS) return "down";
    if (ms >= DEGRADED_THRESHOLD_MS) return "degraded";
    return "up";
}

async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS);
    try {
        return await fetch(url, { ...init, signal: controller.signal });
    } finally {
        clearTimeout(timer);
    }
}

/**
 * Check 1: public-menu
 *
 * GET /api/public-catalog?slug=<canary>. Verifica HTTP 200 + payload JSON
 * con campo `business` presente (uniche garanzia che il pipeline edge
 * function → Postgres → snapshot Redis sia funzionante end-to-end).
 *
 * 4xx upstream (es. slug typo, sede sospesa) → 'down' con error string.
 * Sono comunque errori che il ristoratore vuole vedere.
 *
 * `X-Cataloglobe-Source: stale` → 'degraded': il proxy risponde 200 con lo
 * snapshot Redis perché l'edge (o il DB dietro) non risponde. Senza questo
 * il guasto del 29/09 sarebbe sembrato 'up'.
 */
/** Messaggio quando il proxy serve lo snapshot Redis invece del dato live. */
export const PUBLIC_MENU_STALE_ERROR =
    "Menu servito dalla copia di riserva (snapshot): edge o database non raggiungibili";

export async function checkPublicMenu(): Promise<CheckResult> {
    const base = readTargetBaseUrl();
    const slug = readCanarySlug();
    const url = `${base}/api/public-catalog?slug=${encodeURIComponent(slug)}`;
    const start = Date.now();
    try {
        const res = await fetchWithTimeout(url, {
            method: "GET",
            headers: { Accept: "application/json", ...vercelBypassHeader() }
        });
        const ms = Date.now() - start;
        if (!res.ok) {
            return {
                serviceKey: "public-menu",
                status: "down",
                responseTimeMs: ms,
                error: `HTTP ${res.status}`
            };
        }
        let payload: unknown = null;
        try {
            payload = await res.json();
        } catch {
            return {
                serviceKey: "public-menu",
                status: "down",
                responseTimeMs: ms,
                error: "Invalid JSON response"
            };
        }
        const hasBusiness =
            payload &&
            typeof payload === "object" &&
            (payload as { business?: unknown }).business &&
            typeof (payload as { business?: unknown }).business === "object";
        if (!hasBusiness) {
            return {
                serviceKey: "public-menu",
                status: "down",
                responseTimeMs: ms,
                error: "Payload missing `business` field"
            };
        }
        const isStale = res.headers.get("x-cataloglobe-source") === "stale";
        return {
            serviceKey: "public-menu",
            status: classifyByTiming(ms, false, isStale),
            responseTimeMs: ms,
            error: isStale ? PUBLIC_MENU_STALE_ERROR : null
        };
    } catch (err) {
        const ms = Date.now() - start;
        const isAbort = err instanceof Error && err.name === "AbortError";
        return {
            serviceKey: "public-menu",
            status: "down",
            responseTimeMs: ms,
            error: isAbort ? "Timeout >10s" : err instanceof Error ? err.message : String(err)
        };
    }
}

/**
 * Check 2a: dashboard, parte statica
 *
 * GET / (homepage SPA). Vite serve `index.html` con il tag <title> di
 * CataloGlobe → marker affidabile che il deploy frontend è online. Da solo
 * non basta (era sempre "up"): lo stato della dashboard lo decide
 * `combineDashboard` insieme a database e autenticazione.
 */
export async function checkDashboardStatic(): Promise<CheckResult> {
    const base = readTargetBaseUrl();
    const url = `${base}/`;
    const start = Date.now();
    try {
        const res = await fetchWithTimeout(url, {
            method: "GET",
            headers: { Accept: "text/html", ...vercelBypassHeader() }
        });
        const ms = Date.now() - start;
        if (!res.ok) {
            return {
                serviceKey: "dashboard",
                status: "down",
                responseTimeMs: ms,
                error: `HTTP ${res.status}`
            };
        }
        const html = await res.text();
        const hasMarker = /<title>[^<]*CataloGlobe/i.test(html);
        if (!hasMarker) {
            return {
                serviceKey: "dashboard",
                status: "down",
                responseTimeMs: ms,
                error: "HTML title marker not found"
            };
        }
        return {
            serviceKey: "dashboard",
            status: classifyByTiming(ms, false, false),
            responseTimeMs: ms,
            error: null
        };
    } catch (err) {
        const ms = Date.now() - start;
        const isAbort = err instanceof Error && err.name === "AbortError";
        return {
            serviceKey: "dashboard",
            status: "down",
            responseTimeMs: ms,
            error: isAbort ? "Timeout >10s" : err instanceof Error ? err.message : String(err)
        };
    }
}

/**
 * Check 3: database
 *
 * Query banale via PostgREST con service_role. Tempo round-trip include
 * connessione Vercel → Supabase REST → Postgres → ritorno.
 */
export async function checkDatabase(): Promise<CheckResult> {
    const probe = await probeDatabase();
    if (!probe.ok) {
        return {
            serviceKey: "database",
            status: "down",
            responseTimeMs: probe.ms,
            error: probe.error ?? "Unknown probe failure"
        };
    }
    return {
        serviceKey: "database",
        status: classifyByTiming(probe.ms, false, false),
        responseTimeMs: probe.ms,
        error: null
    };
}

/**
 * Check 4: cache (Upstash Redis)
 *
 * redis.ping(). Riusa env vars `REDIS_KV_REST_API_URL` +
 * `REDIS_KV_REST_API_TOKEN` già configurate per `/api/public-catalog`.
 */
async function checkCache(): Promise<CheckResult> {
    const url = process.env.REDIS_KV_REST_API_URL;
    const token = process.env.REDIS_KV_REST_API_TOKEN;
    if (!url || !token) {
        return {
            serviceKey: "cache",
            status: "down",
            responseTimeMs: null,
            error: "Missing REDIS_KV_REST_API_URL / REDIS_KV_REST_API_TOKEN"
        };
    }
    const start = Date.now();
    try {
        const redis = new Redis({ url, token });
        const result = await Promise.race([
            redis.ping(),
            new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error("Timeout >10s")), CHECK_TIMEOUT_MS)
            )
        ]);
        const ms = Date.now() - start;
        if (result !== "PONG") {
            return {
                serviceKey: "cache",
                status: "down",
                responseTimeMs: ms,
                error: `Unexpected ping response: ${String(result)}`
            };
        }
        return {
            serviceKey: "cache",
            status: classifyByTiming(ms, false, false),
            responseTimeMs: ms,
            error: null
        };
    } catch (err) {
        const ms = Date.now() - start;
        return {
            serviceKey: "cache",
            status: "down",
            responseTimeMs: ms,
            error: err instanceof Error ? err.message : String(err)
        };
    }
}

/** Esito di un controllo che entra nello stato della dashboard. */
export type DashboardPart = { status: CheckStatus; error: string | null };

/**
 * Check 2b: autenticazione Supabase (GoTrue). GET `/auth/v1/health` con la
 * anon key. Non è un servizio della status page: entra solo nello stato
 * della dashboard.
 */
export async function checkAuth(): Promise<DashboardPart> {
    const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
    const key = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;
    if (!url || !key) {
        return { status: "down", error: "Autenticazione: mancano SUPABASE_URL / SUPABASE_ANON_KEY" };
    }
    const start = Date.now();
    try {
        const res = await fetchWithTimeout(`${url.replace(/\/+$/, "")}/auth/v1/health`, {
            method: "GET",
            headers: { apikey: key }
        });
        const ms = Date.now() - start;
        if (!res.ok) return { status: "down", error: `Autenticazione: HTTP ${res.status}` };
        const status = classifyByTiming(ms, false, false);
        return {
            status,
            error: status === "up" ? null : `Autenticazione lenta (${ms} ms)`
        };
    } catch (err) {
        const isAbort = err instanceof Error && err.name === "AbortError";
        return {
            status: "down",
            error: `Autenticazione: ${isAbort ? "Timeout >10s" : err instanceof Error ? err.message : String(err)}`
        };
    }
}

const STATUS_RANK: Record<CheckStatus, number> = { up: 0, degraded: 1, down: 2 };

/**
 * Stato della dashboard = il peggiore tra HTML statico, database e
 * autenticazione. `responseTimeMs` resta quello dell'HTML (la misura della
 * dashboard in sé); `error` dice quale parte ha ceduto. Puro, provato in
 * src/tests/api/statusServices.test.ts.
 */
export function combineDashboard(
    staticCheck: CheckResult,
    database: CheckResult,
    auth: DashboardPart
): CheckResult {
    const parts: Array<{ status: CheckStatus; error: string | null }> = [
        { status: staticCheck.status, error: staticCheck.error },
        {
            status: database.status,
            error:
                database.status === "up"
                    ? null
                    : `Database ${database.status === "down" ? "non disponibile" : "lento"}${database.error ? ` (${database.error})` : ""}`
        },
        auth
    ];
    let worst: CheckStatus = "up";
    for (const p of parts) if (STATUS_RANK[p.status] > STATUS_RANK[worst]) worst = p.status;
    const errors = parts.filter(p => p.status !== "up" && p.error).map(p => p.error as string);
    return {
        serviceKey: "dashboard",
        status: worst,
        responseTimeMs: staticCheck.responseTimeMs,
        error: errors.length > 0 ? errors.join(" · ") : null
    };
}

export async function runAllChecks(): Promise<CheckResult[]> {
    const [publicMenu, dashboardStatic, database, cache, auth] = await Promise.all([
        checkPublicMenu(),
        checkDashboardStatic(),
        checkDatabase(),
        checkCache(),
        checkAuth()
    ]);
    return [publicMenu, combineDashboard(dashboardStatic, database, auth), database, cache];
}
