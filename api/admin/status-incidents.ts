import type { VercelRequest, VercelResponse } from "@vercel/node";

import { pgrest } from "../_lib/statusSupabase.js";

/**
 * Endpoint admin per mutazioni su `status_incidents`.
 *
 * Routing (single-file con method-based switch — Vercel non offre catch-all
 * dinamico nativo lato filesystem se non con [id].ts e l'overhead non vale
 * per 3 azioni):
 *
 *   POST   /api/admin/status-incidents               → create incident
 *   PATCH  /api/admin/status-incidents?id=<uuid>     → update (status/severity/title/description/affected_services)
 *   POST   /api/admin/status-incidents?id=<uuid>&action=add-update
 *                                                    → append entry a updates[]
 *   POST   /api/admin/status-incidents?id=<uuid>&action=resolve
 *                                                    → resolve (resolved_at=now, status='resolved')
 *   DELETE /api/admin/status-incidents?id=<uuid>     → hard delete (raro, ma utile per testi)
 *
 * Auth (oggi):
 *   - Header `Authorization: Bearer <supabase_access_token>` obbligatorio
 *   - Si chiama Supabase Auth `/auth/v1/user` con l'access_token per
 *     ottenere l'email autenticata
 *   - Si confronta con `process.env.ADMIN_EMAIL` (case-insensitive)
 *   - Match → procedi con service_role; mismatch → 403
 *
 * TODO (multi-admin futuro): rimpiazzare la verifica email-based con una
 * colonna `is_admin` su `user_profiles` (o `auth.users.raw_app_meta_data`)
 * e abilitare policy RLS authenticated dirette su `status_incidents`,
 * cancellando questo endpoint. La verifica via env è un placeholder per
 * lo stato single-admin attuale (Lorenzo).
 */

type IncidentStatus = "investigating" | "identified" | "monitoring" | "resolved";
type IncidentSeverity = "minor" | "major" | "critical";

const VALID_STATUS: ReadonlySet<IncidentStatus> = new Set([
    "investigating",
    "identified",
    "monitoring",
    "resolved"
]);
const VALID_SEVERITY: ReadonlySet<IncidentSeverity> = new Set([
    "minor",
    "major",
    "critical"
]);

const SERVICE_KEYS: ReadonlySet<string> = new Set([
    "public-menu",
    "dashboard",
    "database",
    "cache"
]);

type AuthOk = { ok: true; email: string };
type AuthFail = { ok: false; status: number; reason: string };

async function authenticateAdmin(req: VercelRequest): Promise<AuthOk | AuthFail> {
    const adminEmail = process.env.ADMIN_EMAIL;
    if (!adminEmail) {
        return {
            ok: false,
            status: 500,
            reason: "Missing ADMIN_EMAIL env var on server"
        };
    }
    const header = req.headers["authorization"];
    if (typeof header !== "string" || !header.startsWith("Bearer ")) {
        return { ok: false, status: 401, reason: "missing_bearer" };
    }
    const accessToken = header.slice("Bearer ".length).trim();
    if (!accessToken) {
        return { ok: false, status: 401, reason: "empty_token" };
    }
    const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
    const anonKey = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !anonKey) {
        return {
            ok: false,
            status: 500,
            reason: "Missing SUPABASE_URL / SUPABASE_ANON_KEY on server"
        };
    }
    let res: Response;
    try {
        res = await fetch(`${supabaseUrl.replace(/\/+$/, "")}/auth/v1/user`, {
            method: "GET",
            headers: {
                apikey: anonKey,
                Authorization: `Bearer ${accessToken}`
            }
        });
    } catch (err) {
        return {
            ok: false,
            status: 502,
            reason: `auth_upstream_fetch_failed: ${err instanceof Error ? err.message : String(err)}`
        };
    }
    if (!res.ok) {
        return { ok: false, status: 401, reason: `auth_upstream_${res.status}` };
    }
    let payload: { email?: string | null } = {};
    try {
        payload = (await res.json()) as { email?: string | null };
    } catch {
        return { ok: false, status: 502, reason: "auth_upstream_invalid_json" };
    }
    const email = (payload.email ?? "").toLowerCase();
    if (!email) {
        return { ok: false, status: 401, reason: "no_email_in_token" };
    }
    if (email !== adminEmail.toLowerCase()) {
        return { ok: false, status: 403, reason: "not_admin" };
    }
    return { ok: true, email };
}

function jsonError(res: VercelResponse, status: number, code: string, message?: string): void {
    res.setHeader("Cache-Control", "no-store");
    res.status(status).json({ error: { code, ...(message ? { message } : {}) } });
}

function readBody(req: VercelRequest): Record<string, unknown> {
    if (req.body === undefined || req.body === null) return {};
    if (typeof req.body === "string") {
        try {
            const parsed = JSON.parse(req.body);
            return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
        } catch {
            return {};
        }
    }
    return req.body as Record<string, unknown>;
}

function validateCreatePayload(
    body: Record<string, unknown>
): { ok: true; data: Record<string, unknown> } | { ok: false; reason: string } {
    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (!title) return { ok: false, reason: "title_required" };
    const status = typeof body.status === "string" ? body.status : "";
    if (!VALID_STATUS.has(status as IncidentStatus)) {
        return { ok: false, reason: "invalid_status" };
    }
    const severity = typeof body.severity === "string" ? body.severity : "";
    if (!VALID_SEVERITY.has(severity as IncidentSeverity)) {
        return { ok: false, reason: "invalid_severity" };
    }
    const description = typeof body.description === "string" ? body.description : null;
    const affectedRaw = Array.isArray(body.affected_services) ? body.affected_services : [];
    const affected = affectedRaw.filter(
        (s): s is string => typeof s === "string" && SERVICE_KEYS.has(s)
    );
    return {
        ok: true,
        data: {
            title,
            description,
            status,
            severity,
            affected_services: affected
        }
    };
}

function validateUpdatePayload(
    body: Record<string, unknown>
): { ok: true; data: Record<string, unknown> } | { ok: false; reason: string } {
    const data: Record<string, unknown> = {};
    if (typeof body.title === "string") {
        const t = body.title.trim();
        if (!t) return { ok: false, reason: "title_empty" };
        data.title = t;
    }
    if (typeof body.description === "string" || body.description === null) {
        data.description = body.description;
    }
    if (typeof body.status === "string") {
        if (!VALID_STATUS.has(body.status as IncidentStatus)) {
            return { ok: false, reason: "invalid_status" };
        }
        data.status = body.status;
    }
    if (typeof body.severity === "string") {
        if (!VALID_SEVERITY.has(body.severity as IncidentSeverity)) {
            return { ok: false, reason: "invalid_severity" };
        }
        data.severity = body.severity;
    }
    if (Array.isArray(body.affected_services)) {
        data.affected_services = body.affected_services.filter(
            (s): s is string => typeof s === "string" && SERVICE_KEYS.has(s)
        );
    }
    if (Object.keys(data).length === 0) {
        return { ok: false, reason: "no_fields_to_update" };
    }
    return { ok: true, data };
}

export default async function handler(
    req: VercelRequest,
    res: VercelResponse
): Promise<void> {
    const method = req.method ?? "";
    if (!["GET", "POST", "PATCH", "DELETE"].includes(method)) {
        res.setHeader("Allow", "GET, POST, PATCH, DELETE");
        jsonError(res, 405, "method_not_allowed");
        return;
    }

    const auth = await authenticateAdmin(req);
    if (!auth.ok) {
        jsonError(res, auth.status, auth.reason);
        return;
    }

    const id = typeof req.query.id === "string" ? req.query.id.trim() : "";
    const action = typeof req.query.action === "string" ? req.query.action.trim() : "";

    // ============================================================
    // GET — internal lookup (admin UI fetcha via service token, ma resta
    // disponibile per debug; il frontend usa direttamente Supabase con
    // anon key essendo la SELECT pubblica via RLS).
    // ============================================================
    if (method === "GET") {
        const list = await pgrest("status_incidents", {
            query: "select=*&order=started_at.desc&limit=50"
        });
        if (!list.ok) {
            jsonError(res, list.status, "pgrest_failed", list.error);
            return;
        }
        res.setHeader("Cache-Control", "no-store");
        res.status(200).json({ data: list.data });
        return;
    }

    // ============================================================
    // POST — create (no id) | add-update | resolve
    // ============================================================
    if (method === "POST") {
        if (!id) {
            const body = readBody(req);
            const parsed = validateCreatePayload(body);
            if (!parsed.ok) {
                jsonError(res, 400, parsed.reason);
                return;
            }
            const row = {
                ...parsed.data,
                updates: []
            };
            const result = await pgrest("status_incidents", {
                method: "POST",
                body: row,
                prefer: "return=representation"
            });
            if (!result.ok) {
                jsonError(res, result.status, "pgrest_failed", result.error);
                return;
            }
            res.setHeader("Cache-Control", "no-store");
            res.status(201).json({ data: Array.isArray(result.data) ? result.data[0] : result.data });
            return;
        }

        if (action === "resolve") {
            const update = {
                status: "resolved",
                resolved_at: new Date().toISOString()
            };
            const result = await pgrest("status_incidents", {
                method: "PATCH",
                query: `id=eq.${encodeURIComponent(id)}`,
                body: update,
                prefer: "return=representation"
            });
            if (!result.ok) {
                jsonError(res, result.status, "pgrest_failed", result.error);
                return;
            }
            res.setHeader("Cache-Control", "no-store");
            res.status(200).json({ data: Array.isArray(result.data) ? result.data[0] : result.data });
            return;
        }

        if (action === "add-update") {
            const body = readBody(req);
            const message = typeof body.message === "string" ? body.message.trim() : "";
            const status = typeof body.status === "string" ? body.status : null;
            if (!message) {
                jsonError(res, 400, "message_required");
                return;
            }
            if (status !== null && !VALID_STATUS.has(status as IncidentStatus)) {
                jsonError(res, 400, "invalid_status");
                return;
            }
            // Leggi l'incident corrente per appendere a updates[]. Atomicità
            // best-effort: due aggiornamenti concorrenti potrebbero collidere.
            // Frequenza utente attesa = 1 admin → trascurabile.
            const existing = await pgrest<Array<{ updates: unknown[]; status: string }>>(
                "status_incidents",
                {
                    query: `select=updates,status&id=eq.${encodeURIComponent(id)}&limit=1`
                }
            );
            if (!existing.ok) {
                jsonError(res, existing.status, "pgrest_failed", existing.error);
                return;
            }
            const row = Array.isArray(existing.data) ? existing.data[0] : null;
            if (!row) {
                jsonError(res, 404, "incident_not_found");
                return;
            }
            const prevUpdates = Array.isArray(row.updates) ? row.updates : [];
            const entry = {
                timestamp: new Date().toISOString(),
                message,
                ...(status ? { status } : {})
            };
            const patch: Record<string, unknown> = {
                updates: [...prevUpdates, entry]
            };
            if (status) patch.status = status;
            const result = await pgrest("status_incidents", {
                method: "PATCH",
                query: `id=eq.${encodeURIComponent(id)}`,
                body: patch,
                prefer: "return=representation"
            });
            if (!result.ok) {
                jsonError(res, result.status, "pgrest_failed", result.error);
                return;
            }
            res.setHeader("Cache-Control", "no-store");
            res.status(200).json({ data: Array.isArray(result.data) ? result.data[0] : result.data });
            return;
        }

        jsonError(res, 400, "unknown_action");
        return;
    }

    // ============================================================
    // PATCH — update fields
    // ============================================================
    if (method === "PATCH") {
        if (!id) {
            jsonError(res, 400, "id_required");
            return;
        }
        const body = readBody(req);
        const parsed = validateUpdatePayload(body);
        if (!parsed.ok) {
            jsonError(res, 400, parsed.reason);
            return;
        }
        const result = await pgrest("status_incidents", {
            method: "PATCH",
            query: `id=eq.${encodeURIComponent(id)}`,
            body: parsed.data,
            prefer: "return=representation"
        });
        if (!result.ok) {
            jsonError(res, result.status, "pgrest_failed", result.error);
            return;
        }
        res.setHeader("Cache-Control", "no-store");
        res.status(200).json({ data: Array.isArray(result.data) ? result.data[0] : result.data });
        return;
    }

    // ============================================================
    // DELETE — hard delete
    // ============================================================
    if (method === "DELETE") {
        if (!id) {
            jsonError(res, 400, "id_required");
            return;
        }
        const result = await pgrest("status_incidents", {
            method: "DELETE",
            query: `id=eq.${encodeURIComponent(id)}`,
            prefer: "return=minimal"
        });
        if (!result.ok) {
            jsonError(res, result.status, "pgrest_failed", result.error);
            return;
        }
        res.setHeader("Cache-Control", "no-store");
        res.status(204).end();
        return;
    }

    jsonError(res, 405, "method_not_allowed");
}
