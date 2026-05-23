// @ts-nocheck
//
// toggle-product-availability — admin-side endpoint that disables or
// re-enables a product for a single activity (location). UPSERT on
// `product_availability_overrides` (UNIQUE on activity_id, product_id).
//
// Behaviour (docs/orders-architecture.md §10, §14):
//   - `available: false`, scope "daily": auto-reset at next 04:00 UTC
//     (the `daily_reset_availability` cron job flips back to available).
//   - `available: false`, scope "indefinite": auto_reset_at NULL,
//     remains disabled until an admin re-toggles.
//   - `available: true`: clears every disabled_* / auto_reset_at field.
//
// Security guards:
//   - JWT user + membership check on the activity's tenant.
//   - Cross-tenant coherence: product.tenant_id must equal
//     activity.tenant_id (defense in depth — prevents an admin from
//     attaching a foreign-tenant product to their own activity via a
//     crafted product_id).
//
// Pipeline:
//   1. Parse + validate body.
//   2. Verify Supabase user JWT.
//   3. Pre-fetch activity → 404 if missing.
//   4. Membership check (activity's tenant).
//   5. Pre-fetch product → 404 if missing; 403 on cross-tenant mismatch.
//   6. Rate-limit per (user, product) at 30 req/min.
//   7. Compute auto_reset_at if applicable.
//   8. UPSERT product_availability_overrides ON CONFLICT (activity_id, product_id).
//   9. Reply 200 with { override_id }.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkRateLimit, RateLimitExceededError } from "../_shared/rateLimit.ts";

// ============================================================
// Constants
// ============================================================

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const RATE_LIMIT_PER_USER_PER_PRODUCT_PER_MIN = 30;
const MAX_REASON_LENGTH = 500;

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS"
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Scope = "daily" | "indefinite";

// ============================================================
// Types
// ============================================================

interface ToggleRequestBody {
    product_id: string;
    activity_id: string;
    available: boolean;
    scope: Scope | null;     // required only when available === false
    reason: string | null;
}

interface ActivityRow {
    id: string;
    tenant_id: string;
}

interface ProductRow {
    id: string;
    tenant_id: string;
}

// ============================================================
// Helpers
// ============================================================

function _isUuid(s: unknown): s is string {
    return typeof s === "string" && UUID_RE.test(s);
}

function jsonResponse(
    status: number,
    body: Record<string, unknown>,
    extraHeaders: Record<string, string> = {}
): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: {
            "Content-Type": "application/json",
            ...corsHeaders,
            ...extraHeaders
        }
    });
}

function _parseAndValidateBody(raw: unknown): ToggleRequestBody | { error: string } {
    if (!raw || typeof raw !== "object") {
        return { error: "Body must be a JSON object." };
    }
    const obj = raw as Record<string, unknown>;

    if (!_isUuid(obj.product_id)) {
        return { error: "`product_id` must be a UUID." };
    }
    if (!_isUuid(obj.activity_id)) {
        return { error: "`activity_id` must be a UUID." };
    }
    if (typeof obj.available !== "boolean") {
        return { error: "`available` must be a boolean." };
    }

    let scope: Scope | null = null;
    if (obj.available === false) {
        if (obj.scope !== "daily" && obj.scope !== "indefinite") {
            return {
                error: "`scope` must be \"daily\" or \"indefinite\" when available is false."
            };
        }
        scope = obj.scope as Scope;
    }
    // When available === true, scope is ignored (no validation error).

    let reason: string | null = null;
    if (obj.reason !== undefined && obj.reason !== null) {
        if (typeof obj.reason !== "string") {
            return { error: "`reason` must be a string or null." };
        }
        const trimmed = obj.reason.trim();
        if (trimmed.length > MAX_REASON_LENGTH) {
            return {
                error: `\`reason\` must be at most ${MAX_REASON_LENGTH} characters.`
            };
        }
        reason = trimmed.length > 0 ? trimmed : null;
    }

    return {
        product_id: obj.product_id as string,
        activity_id: obj.activity_id as string,
        available: obj.available as boolean,
        scope,
        reason
    };
}

function _extractBearerJwt(req: Request): string | null {
    const h = req.headers.get("Authorization") ?? req.headers.get("authorization");
    if (!h || !h.toLowerCase().startsWith("bearer ")) return null;
    const jwt = h.slice(7).trim();
    return jwt.length > 0 ? jwt : null;
}

async function _validateUserJwt(
    jwt: string
): Promise<
    | { kind: "ok"; userId: string; supabaseUser: SupabaseClient }
    | { kind: "invalid"; message: string }
> {
    const supabaseUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: `Bearer ${jwt}` } },
        auth: { persistSession: false, autoRefreshToken: false }
    });
    const { data, error } = await supabaseUser.auth.getUser(jwt);
    if (error || !data?.user?.id) {
        return { kind: "invalid", message: error?.message ?? "Invalid JWT" };
    }
    return { kind: "ok", userId: data.user.id, supabaseUser };
}

async function _isMemberOfTenant(
    supabaseUser: SupabaseClient,
    tenantId: string
): Promise<{ kind: "ok"; member: boolean } | { kind: "db_error"; message: string }> {
    const { data, error } = await supabaseUser.rpc("get_my_tenant_ids");
    if (error) return { kind: "db_error", message: error.message };
    const ids: string[] = [];
    if (Array.isArray(data)) {
        for (const row of data) {
            if (typeof row === "string") ids.push(row);
            else if (row && typeof row === "object" && "get_my_tenant_ids" in row) {
                const v = (row as { get_my_tenant_ids: unknown }).get_my_tenant_ids;
                if (typeof v === "string") ids.push(v);
            }
        }
    }
    return { kind: "ok", member: ids.includes(tenantId) };
}

async function _fetchActivity(
    supabase: SupabaseClient,
    activityId: string
): Promise<
    | { kind: "ok"; row: ActivityRow }
    | { kind: "not_found" }
    | { kind: "db_error"; message: string }
> {
    const { data, error } = await supabase
        .from("activities")
        .select("id, tenant_id")
        .eq("id", activityId)
        .maybeSingle();
    if (error) return { kind: "db_error", message: error.message };
    if (!data) return { kind: "not_found" };
    return { kind: "ok", row: data as ActivityRow };
}

async function _fetchProduct(
    supabase: SupabaseClient,
    productId: string
): Promise<
    | { kind: "ok"; row: ProductRow }
    | { kind: "not_found" }
    | { kind: "db_error"; message: string }
> {
    const { data, error } = await supabase
        .from("products")
        .select("id, tenant_id")
        .eq("id", productId)
        .maybeSingle();
    if (error) return { kind: "db_error", message: error.message };
    if (!data) return { kind: "not_found" };
    return { kind: "ok", row: data as ProductRow };
}

function _computeAutoResetAt(scope: Scope | null): string | null {
    if (scope !== "daily") return null;
    // Next 04:00 UTC. If `now` is before today 04:00 UTC, the next reset
    // is today 04:00. Otherwise it's tomorrow 04:00.
    const now = new Date();
    const todayResetMs = Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate(),
        4, 0, 0, 0
    );
    const targetMs = now.getTime() < todayResetMs
        ? todayResetMs
        : todayResetMs + 24 * 60 * 60 * 1000;
    return new Date(targetMs).toISOString();
}

// ============================================================
// HTTP handler
// ============================================================

serve(async (req: Request) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }
    if (req.method !== "POST") {
        return jsonResponse(405, {
            code: "METHOD_NOT_ALLOWED",
            message: "Metodo non consentito."
        });
    }

    // ── Parse body ──
    let rawBody: unknown;
    try {
        rawBody = await req.json();
    } catch {
        return jsonResponse(400, {
            code: "INVALID_REQUEST",
            message: "Body JSON malformato."
        });
    }
    const parsed = _parseAndValidateBody(rawBody);
    if ("error" in parsed) {
        return jsonResponse(400, {
            code: "INVALID_REQUEST",
            message: parsed.error
        });
    }
    const body = parsed as ToggleRequestBody;

    // ── Extract + validate JWT ──
    const jwt = _extractBearerJwt(req);
    if (!jwt) {
        return jsonResponse(401, {
            code: "UNAUTHORIZED",
            message: "Authorization header mancante o malformato."
        });
    }
    const jwtCheck = await _validateUserJwt(jwt);
    if (jwtCheck.kind === "invalid") {
        return jsonResponse(401, {
            code: "UNAUTHORIZED",
            message: jwtCheck.message
        });
    }
    const userId = jwtCheck.userId;
    const supabaseUser = jwtCheck.supabaseUser;

    // ── Build service-role client ──
    const supabaseService = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false }
    });

    try {
        // ── Pre-fetch activity ──
        const activityFetch = await _fetchActivity(supabaseService, body.activity_id);
        if (activityFetch.kind === "not_found") {
            return jsonResponse(404, {
                code: "ACTIVITY_NOT_FOUND",
                message: "Sede non trovata."
            });
        }
        if (activityFetch.kind === "db_error") {
            console.error(
                "[toggle-product-availability] activity read error:",
                activityFetch.message
            );
            return jsonResponse(500, {
                code: "INTERNAL_ERROR",
                message: "Errore interno."
            });
        }
        const tenantId = activityFetch.row.tenant_id;

        // ── Membership check (activity's tenant) ──
        const membership = await _isMemberOfTenant(supabaseUser, tenantId);
        if (membership.kind === "db_error") {
            console.error(
                "[toggle-product-availability] tenant membership read error:",
                membership.message
            );
            return jsonResponse(500, {
                code: "INTERNAL_ERROR",
                message: "Errore interno."
            });
        }
        if (!membership.member) {
            return jsonResponse(403, {
                code: "FORBIDDEN",
                message: "Operazione non autorizzata su questa sede."
            });
        }

        // ── Pre-fetch product + cross-tenant coherence ──
        const productFetch = await _fetchProduct(supabaseService, body.product_id);
        if (productFetch.kind === "not_found") {
            return jsonResponse(404, {
                code: "PRODUCT_NOT_FOUND",
                message: "Prodotto non trovato."
            });
        }
        if (productFetch.kind === "db_error") {
            console.error(
                "[toggle-product-availability] product read error:",
                productFetch.message
            );
            return jsonResponse(500, {
                code: "INTERNAL_ERROR",
                message: "Errore interno."
            });
        }
        if (productFetch.row.tenant_id !== tenantId) {
            return jsonResponse(403, {
                code: "FORBIDDEN",
                message: "Prodotto e sede appartengono a tenant diversi.",
                details: { reason: "CROSS_TENANT_MISMATCH" }
            });
        }

        // ── Rate limit per (user, product) ──
        try {
            await checkRateLimit(supabaseService, {
                key: `toggle-product-availability:user:${userId}:product:${body.product_id}`,
                limit: RATE_LIMIT_PER_USER_PER_PRODUCT_PER_MIN,
                windowSeconds: 60
            });
        } catch (e) {
            if (e instanceof RateLimitExceededError) {
                return jsonResponse(
                    429,
                    {
                        code: "RATE_LIMITED",
                        message: "Troppe richieste, riprova tra poco.",
                        retry_after_seconds: e.retryAfterSeconds
                    },
                    { "Retry-After": String(e.retryAfterSeconds) }
                );
            }
            throw e;
        }

        // ── UPSERT product_availability_overrides ──
        const nowIso = new Date().toISOString();
        const autoResetAt = _computeAutoResetAt(body.scope);

        const upsertPayload = {
            tenant_id: tenantId,
            activity_id: body.activity_id,
            product_id: body.product_id,
            available: body.available,
            disabled_at: body.available ? null : nowIso,
            disabled_reason: body.available ? null : body.reason,
            disabled_by: body.available ? null : userId,
            auto_reset_at: body.available ? null : autoResetAt
        };

        const { data: upserted, error: upsertErr } = await supabaseService
            .from("product_availability_overrides")
            .upsert(upsertPayload, { onConflict: "activity_id,product_id" })
            .select("id")
            .single();

        if (upsertErr) {
            console.error(
                "[toggle-product-availability] upsert error:",
                upsertErr.message
            );
            return jsonResponse(500, {
                code: "INTERNAL_ERROR",
                message: "Errore interno."
            });
        }

        const overrideId = (upserted as { id: string }).id;

        console.log("[toggle-product-availability] product_availability_toggled", {
            event: "product_availability_toggled",
            user_id: userId,
            tenant_id: tenantId,
            activity_id: body.activity_id,
            product_id: body.product_id,
            available: body.available,
            scope: body.scope,
            override_id: overrideId
        });

        return jsonResponse(200, { override_id: overrideId });
    } catch (e) {
        console.error(
            "[toggle-product-availability] internal error:",
            (e as Error)?.message,
            (e as Error)?.stack
        );
        return jsonResponse(500, {
            code: "INTERNAL_ERROR",
            message: "Errore interno."
        });
    }
});
