/**
 * Service della status page pubblica (`/status`) e del pannello admin degli
 * incidenti. Accanto a `publicCatalog/` perché come lui parla con `/api`,
 * non con Supabase:
 *   - lettura pubblica: `GET /api/status` (api/status/index.ts). Stato
 *     corrente e uptime a 90 giorni da Redis, incidenti dal DB lato server:
 *     la pagina deve poter dire che il database è giù.
 *   - incidenti admin: `/api/admin/status-incidents`, che valida il JWT
 *     server-side e verifica `platform_admins`. Il gate in `AdminRoute.tsx`
 *     è cosmetico.
 */

import { supabase } from "@/services/supabase/client";

export type ServiceKey = "public-menu" | "dashboard" | "database" | "cache";
export type CheckStatus = "up" | "degraded" | "down";

/** Ultimo controllo di un servizio (da `status:current` su Redis). */
export type LatestCheck = {
    status: CheckStatus;
    responseTimeMs: number | null;
    error: string | null;
    checkedAt: string;
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

export const INCIDENT_STATUS_LABEL: Record<IncidentStatus, string> = {
    investigating: "In analisi",
    identified: "Identificato",
    monitoring: "In monitoraggio",
    resolved: "Risolto"
};

export function formatIncidentStatus(status: IncidentStatus): string {
    return INCIDENT_STATUS_LABEL[status];
}

export type DailyBucket = {
    date: string; // YYYY-MM-DD (UTC)
    worst: CheckStatus | "unknown";
    checkCount: number;
};

export type StatusOverview = {
    /** Per servizio; `null` se il monitor non l'ha ancora controllato. */
    latest: Record<ServiceKey, LatestCheck | null>;
    /** 90 giorni per servizio, dal più vecchio; giorni senza dati = `unknown`. */
    uptime: Record<ServiceKey, DailyBucket[]>;
    activeIncidents: StatusIncident[];
    recentIncidents: StatusIncident[];
    /** false = il DB non ha risposto: incidenti non mostrabili, il resto sì. */
    incidentsAvailable: boolean;
};

type StatusApiResponse = {
    current: {
        checkedAt: string;
        services: Partial<
            Record<ServiceKey, { status: CheckStatus; responseTimeMs: number | null; error: string | null }>
        >;
    } | null;
    uptime: Partial<Record<ServiceKey, DailyBucket[]>>;
    activeIncidents: StatusIncident[];
    recentIncidents: StatusIncident[];
    incidentsAvailable: boolean;
};

/** Tetto della lettura: pagina pubblica, mai un loader infinito. */
const STATUS_FETCH_TIMEOUT_MS = 10_000;

/**
 * Dati della pagina. Lancia `Error` (messaggio = codice) su risposta non 2xx
 * o timeout: la pagina tiene gli ultimi dati con l'avviso, o mostra l'errore
 * al primo caricamento.
 */
export async function fetchStatusOverview(): Promise<StatusOverview> {
    const res = await fetch("/api/status", {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(STATUS_FETCH_TIMEOUT_MS)
    });
    if (!res.ok) throw new Error(`status_api_${res.status}`);
    const body = (await res.json()) as StatusApiResponse;

    const latest = {} as Record<ServiceKey, LatestCheck | null>;
    const uptime = {} as Record<ServiceKey, DailyBucket[]>;
    for (const key of SERVICE_KEYS) {
        const svc = body.current?.services[key];
        latest[key] =
            svc && body.current
                ? {
                      status: svc.status,
                      responseTimeMs: svc.responseTimeMs,
                      error: svc.error,
                      checkedAt: body.current.checkedAt
                  }
                : null;
        uptime[key] = body.uptime?.[key] ?? [];
    }
    return {
        latest,
        uptime,
        activeIncidents: body.activeIncidents ?? [],
        recentIncidents: body.recentIncidents ?? [],
        incidentsAvailable: body.incidentsAvailable !== false
    };
}

/** Elenco admin (ultimi 50, limite dell'endpoint). */
export async function listAllIncidents(): Promise<StatusIncident[]> {
    const result = await adminFetch<StatusIncident[]>(`/api/admin/status-incidents`, {
        method: "GET"
    });
    if (!result.ok) throw new Error(result.error);
    return result.data ?? [];
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
    latest: Record<ServiceKey, LatestCheck | null>
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
