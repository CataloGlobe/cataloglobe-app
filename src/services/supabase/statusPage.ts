/**
 * Service layer per la status page pubblica.
 *
 * Letture cross-tenant: RLS configurata in `20260520220000_create_status_tables.sql`
 * permette SELECT anonima su `status_checks` e `status_incidents`. Niente
 * tenant_id qui — i dati sono globali della piattaforma CataloGlobe.
 *
 * Le scritture di incident passano per l'endpoint Vercel
 * `/api/admin/status-incidents` (vedi sezione `admin/` qui sotto), che valida
 * JWT email vs `ADMIN_EMAIL` server-side. Il frontend gate è in
 * `AdminRoute.tsx` e usa `VITE_ADMIN_EMAIL`.
 */

import { supabase } from "./client";

export type ServiceKey = "public-menu" | "dashboard" | "database" | "cache";
export type CheckStatus = "up" | "degraded" | "down";

export type StatusCheckRow = {
    id: number;
    service_key: ServiceKey;
    status: CheckStatus;
    response_time_ms: number | null;
    error_message: string | null;
    checked_at: string;
};

export type IncidentStatus = "investigating" | "identified" | "monitoring" | "resolved";
export type IncidentSeverity = "minor" | "major" | "critical";

export type IncidentUpdateEntry = {
    timestamp: string;
    message: string;
    status?: IncidentStatus;
};

export type StatusIncident = {
    id: string;
    title: string;
    description: string | null;
    status: IncidentStatus;
    severity: IncidentSeverity;
    affected_services: string[];
    started_at: string;
    resolved_at: string | null;
    updates: IncidentUpdateEntry[];
    created_at: string;
    updated_at: string;
};

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

/**
 * Latest check row per service. Una query unica con ordinamento + DISTINCT ON
 * sarebbe più efficiente ma richiederebbe una RPC. Per 4 servizi, 4 query
 * parallele sono accettabili (latenza < 200ms su Supabase free tier).
 */
export async function listLatestChecks(): Promise<Record<ServiceKey, StatusCheckRow | null>> {
    const results = await Promise.all(
        SERVICE_KEYS.map(async (key) => {
            const { data, error } = await supabase
                .from("status_checks")
                .select("id, service_key, status, response_time_ms, error_message, checked_at")
                .eq("service_key", key)
                .order("checked_at", { ascending: false })
                .limit(1);
            if (error) throw error;
            return [key, (data?.[0] ?? null) as StatusCheckRow | null] as const;
        })
    );
    const map = {} as Record<ServiceKey, StatusCheckRow | null>;
    for (const [key, row] of results) {
        map[key] = row;
    }
    return map;
}

/**
 * Ultimi N check di un servizio (per drill-down su anomalie recenti).
 * Non usato sulla pagina pubblica oggi — esposto per il pannello admin
 * di debug futuro.
 */
export async function listRecentChecks(
    serviceKey: ServiceKey,
    limit = 50
): Promise<StatusCheckRow[]> {
    const { data, error } = await supabase
        .from("status_checks")
        .select("id, service_key, status, response_time_ms, error_message, checked_at")
        .eq("service_key", serviceKey)
        .order("checked_at", { ascending: false })
        .limit(limit);
    if (error) throw error;
    return (data ?? []) as StatusCheckRow[];
}

/**
 * Aggregazione "giorni con problemi" su 90 giorni per il grafico uptime.
 *
 * Implementazione client-side (anziché RPC SQL):
 *   - fetch di tutti i check degli ultimi 90 giorni per il servizio (1 query)
 *   - bucket per giorno (UTC), worst-of-day come stato del giorno
 *   - giorni senza check = "unknown" (non degraded, lo distinguiamo nel
 *     componente UptimeBar — colore neutro)
 *
 * Volume atteso per query: ~64k righe/servizio in 90 giorni (4 servizi ×
 * 720 check/giorno × 90 giorni / 4 servizi). Una sola query con LIMIT su
 * data range va bene; se in futuro diventa lento, RPC SQL `daily_status_summary`.
 */
export type DailyBucket = {
    date: string; // YYYY-MM-DD (UTC)
    worst: CheckStatus | "unknown";
    checkCount: number;
};

export async function listDailyUptime(
    serviceKey: ServiceKey,
    days = 90
): Promise<DailyBucket[]> {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
        .from("status_checks")
        .select("status, checked_at")
        .eq("service_key", serviceKey)
        .gte("checked_at", cutoff)
        .order("checked_at", { ascending: true });
    if (error) throw error;

    const byDate = new Map<string, { worst: CheckStatus; checkCount: number }>();
    const rank: Record<CheckStatus, number> = { up: 0, degraded: 1, down: 2 };

    for (const row of data ?? []) {
        const d = new Date(row.checked_at);
        const isoDate = d.toISOString().slice(0, 10);
        const existing = byDate.get(isoDate);
        const status = row.status as CheckStatus;
        if (!existing) {
            byDate.set(isoDate, { worst: status, checkCount: 1 });
        } else {
            existing.checkCount += 1;
            if (rank[status] > rank[existing.worst]) existing.worst = status;
        }
    }

    const buckets: DailyBucket[] = [];
    for (let i = days - 1; i >= 0; i--) {
        const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
        const isoDate = d.toISOString().slice(0, 10);
        const slot = byDate.get(isoDate);
        if (slot) {
            buckets.push({ date: isoDate, worst: slot.worst, checkCount: slot.checkCount });
        } else {
            buckets.push({ date: isoDate, worst: "unknown", checkCount: 0 });
        }
    }
    return buckets;
}

export async function listActiveIncidents(): Promise<StatusIncident[]> {
    const { data, error } = await supabase
        .from("status_incidents")
        .select("*")
        .is("resolved_at", null)
        .order("started_at", { ascending: false });
    if (error) throw error;
    return (data ?? []) as StatusIncident[];
}

export async function listRecentIncidents(limit = 5): Promise<StatusIncident[]> {
    const { data, error } = await supabase
        .from("status_incidents")
        .select("*")
        .not("resolved_at", "is", null)
        .order("started_at", { ascending: false })
        .limit(limit);
    if (error) throw error;
    return (data ?? []) as StatusIncident[];
}

export async function listAllIncidents(limit = 50): Promise<StatusIncident[]> {
    const { data, error } = await supabase
        .from("status_incidents")
        .select("*")
        .order("started_at", { ascending: false })
        .limit(limit);
    if (error) throw error;
    return (data ?? []) as StatusIncident[];
}

// ============================================================
// Admin mutations — passano per l'endpoint Vercel server-side
// ============================================================

type AdminFetchResult<T> =
    | { ok: true; data: T }
    | { ok: false; status: number; error: string };

async function adminFetch<T>(
    path: string,
    init: RequestInit
): Promise<AdminFetchResult<T>> {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
        return { ok: false, status: 401, error: "no_session" };
    }
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${token}`);
    if (init.body && !headers.has("Content-Type")) {
        headers.set("Content-Type", "application/json");
    }
    const res = await fetch(path, { ...init, headers });
    if (res.status === 204) return { ok: true, data: null as T };
    let body: unknown = null;
    try {
        body = await res.json();
    } catch {
        body = null;
    }
    if (!res.ok) {
        const errorBody = body as { error?: { code?: string; message?: string } } | null;
        return {
            ok: false,
            status: res.status,
            error: errorBody?.error?.code ?? `http_${res.status}`
        };
    }
    return { ok: true, data: (body as { data: T }).data };
}

export async function createIncident(input: {
    title: string;
    description: string | null;
    status: IncidentStatus;
    severity: IncidentSeverity;
    affected_services: string[];
}): Promise<StatusIncident> {
    const result = await adminFetch<StatusIncident>(`/api/admin/status-incidents`, {
        method: "POST",
        body: JSON.stringify(input)
    });
    if (!result.ok) throw new Error(result.error);
    return result.data;
}

export async function updateIncident(
    id: string,
    patch: Partial<{
        title: string;
        description: string | null;
        status: IncidentStatus;
        severity: IncidentSeverity;
        affected_services: string[];
    }>
): Promise<StatusIncident> {
    const result = await adminFetch<StatusIncident>(
        `/api/admin/status-incidents?id=${encodeURIComponent(id)}`,
        {
            method: "PATCH",
            body: JSON.stringify(patch)
        }
    );
    if (!result.ok) throw new Error(result.error);
    return result.data;
}

export async function addIncidentUpdate(
    id: string,
    message: string,
    nextStatus?: IncidentStatus
): Promise<StatusIncident> {
    const result = await adminFetch<StatusIncident>(
        `/api/admin/status-incidents?id=${encodeURIComponent(id)}&action=add-update`,
        {
            method: "POST",
            body: JSON.stringify({ message, ...(nextStatus ? { status: nextStatus } : {}) })
        }
    );
    if (!result.ok) throw new Error(result.error);
    return result.data;
}

export async function resolveIncident(id: string): Promise<StatusIncident> {
    const result = await adminFetch<StatusIncident>(
        `/api/admin/status-incidents?id=${encodeURIComponent(id)}&action=resolve`,
        { method: "POST" }
    );
    if (!result.ok) throw new Error(result.error);
    return result.data;
}

export async function deleteIncident(id: string): Promise<void> {
    const result = await adminFetch<null>(
        `/api/admin/status-incidents?id=${encodeURIComponent(id)}`,
        { method: "DELETE" }
    );
    if (!result.ok) throw new Error(result.error);
}

// ============================================================
// Aggregato per banner pagina pubblica
// ============================================================

export type OverallStatus = "operational" | "partial" | "outage" | "unknown";

export function deriveOverallStatus(
    latest: Record<ServiceKey, StatusCheckRow | null>
): OverallStatus {
    let down = 0;
    let degraded = 0;
    let known = 0;
    for (const key of SERVICE_KEYS) {
        const row = latest[key];
        if (!row) continue;
        known += 1;
        if (row.status === "down") down += 1;
        else if (row.status === "degraded") degraded += 1;
    }
    if (known === 0) return "unknown";
    if (down >= 2) return "outage";
    if (down > 0 || degraded > 0) return "partial";
    return "operational";
}
