/**
 * Definizione check per ogni servizio monitorato dalla status page.
 *
 * Ogni service-check è una funzione async che ritorna:
 *   - status: 'up' | 'degraded' | 'down'
 *   - responseTimeMs: tempo misurato
 *   - error: messaggio (solo per degraded/down)
 *
 * Regole di classificazione (uniformi per tutti i servizi):
 *   - up        → risposta < 2000ms e payload corretto
 *   - degraded  → risposta 2000–10000ms OPPURE soft-error semantico
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
 */

import { probeDatabase } from "./statusSupabase.js";
import { Redis } from "@upstash/redis";

const CHECK_TIMEOUT_MS = 10_000;
const DEGRADED_THRESHOLD_MS = 2_000;

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
 */
async function checkPublicMenu(): Promise<CheckResult> {
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
        return {
            serviceKey: "public-menu",
            status: classifyByTiming(ms, false, false),
            responseTimeMs: ms,
            error: null
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
 * Check 2: dashboard
 *
 * GET / (homepage SPA). Vite serve `index.html` con il tag <title> di
 * CataloGlobe → marker affidabile che il deploy frontend è online.
 */
async function checkDashboard(): Promise<CheckResult> {
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
async function checkDatabase(): Promise<CheckResult> {
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

export async function runAllChecks(): Promise<CheckResult[]> {
    const results = await Promise.all([
        checkPublicMenu(),
        checkDashboard(),
        checkDatabase(),
        checkCache()
    ]);
    return results;
}
