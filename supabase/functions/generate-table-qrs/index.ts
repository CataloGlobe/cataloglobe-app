// @ts-nocheck
//
// generate-table-qrs — admin-side endpoint that builds a printable PDF of
// QR codes for the tables of a given activity. 4×4 grid per A4 page. The
// embedded URL is the public ordering link
//     https://<env-host>/t/<qr_token>
// (allineato a route TableEntryPage `/t/:qrToken` lato client).
// APP_URL comes from Edge env (same var as send-tenant-invite, single
// source of truth for frontend URL). Set explicitly on each Supabase
// project: staging project → APP_URL = https://staging.cataloglobe.com,
// prod project → APP_URL = https://cataloglobe.com. Fallback hardcoded
// preserva backward compat se la var fosse assente (improbabile, ma
// safety net).
//
// Unlike every other Phase 2 endpoint, the success response is binary
// (Content-Type: application/pdf). Error responses remain JSON.
//
// Pipeline:
//   1. Parse + validate body ({ activity_id, table_ids? }).
//   2. Verify Supabase user JWT.
//   3. Pre-fetch activity (id, tenant_id, slug) → 404 if missing.
//   4. Membership check on activity.tenant_id.
//   5. Fetch tables (filtered by ids if provided, always filter out
//      soft-deleted), ordered by label. → 404 NO_TABLES_FOUND on empty.
//   6. Rate-limit per (user, activity) at 10 req/min (PDF generation is
//      heavier than the other admin endpoints).
//   7. Build PDF in-memory: one PDFDocument, ceil(n / 16) pages, each QR
//      generated via qrcode npm package, embedded as PNG.
//   8. Reply 200 with PDF bytes + Content-Disposition attachment.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1?target=deno";
import QRCode from "https://esm.sh/qrcode@1.5.3?target=deno";
import { checkRateLimit, RateLimitExceededError } from "../_shared/rateLimit.ts";

// ============================================================
// Constants
// ============================================================

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const APP_URL =
    Deno.env.get("APP_URL")?.replace(/\/+$/, "") ??
    "https://cataloglobe.com";

const RATE_LIMIT_PER_USER_PER_ACTIVITY_PER_MIN = 10;

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS"
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// PDF layout (A4 portrait, 4×4 grid)
const MM_TO_PT = 2.83465;
const A4_WIDTH = 210 * MM_TO_PT;
const A4_HEIGHT = 297 * MM_TO_PT;
const PAGE_MARGIN = 15 * MM_TO_PT;
const GRID_COLS = 4;
const GRID_ROWS = 4;
const QRS_PER_PAGE = GRID_COLS * GRID_ROWS;
const CELL_WIDTH = (A4_WIDTH - 2 * PAGE_MARGIN) / GRID_COLS;
const CELL_HEIGHT = (A4_HEIGHT - 2 * PAGE_MARGIN) / GRID_ROWS;
const QR_SIZE = Math.min(CELL_WIDTH, CELL_HEIGHT - 14 * MM_TO_PT) * 0.85;
const LABEL_FONT_SIZE = 10;
const LABEL_GAP = 4 * MM_TO_PT;

// ============================================================
// Types
// ============================================================

interface GenerateRequestBody {
    activity_id: string;
    table_ids: string[] | null;
}

interface ActivityRow {
    id: string;
    tenant_id: string;
    slug: string;
}

interface TableRow {
    id: string;
    label: string;
    qr_token: string;
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

function _parseAndValidateBody(raw: unknown): GenerateRequestBody | { error: string } {
    if (!raw || typeof raw !== "object") {
        return { error: "Body must be a JSON object." };
    }
    const obj = raw as Record<string, unknown>;

    if (!_isUuid(obj.activity_id)) {
        return { error: "`activity_id` must be a UUID." };
    }

    let tableIds: string[] | null = null;
    if (obj.table_ids !== undefined && obj.table_ids !== null) {
        if (!Array.isArray(obj.table_ids)) {
            return { error: "`table_ids` must be an array of UUIDs or null." };
        }
        if (obj.table_ids.length === 0) {
            return { error: "`table_ids` must be a non-empty array (or null/omitted)." };
        }
        const validated: string[] = [];
        for (let i = 0; i < obj.table_ids.length; i++) {
            const id = obj.table_ids[i];
            if (!_isUuid(id)) {
                return { error: `table_ids[${i}] must be a UUID.` };
            }
            validated.push(id as string);
        }
        tableIds = validated;
    }

    return {
        activity_id: obj.activity_id as string,
        table_ids: tableIds
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
        .select("id, tenant_id, slug")
        .eq("id", activityId)
        .maybeSingle();
    if (error) return { kind: "db_error", message: error.message };
    if (!data) return { kind: "not_found" };
    return { kind: "ok", row: data as ActivityRow };
}

async function _fetchTables(
    supabase: SupabaseClient,
    activityId: string,
    tableIds: string[] | null
): Promise<{ kind: "ok"; rows: TableRow[] } | { kind: "db_error"; message: string }> {
    let query = supabase
        .from("tables")
        .select("id, label, qr_token")
        .eq("activity_id", activityId)
        .is("deleted_at", null)
        .order("label", { ascending: true });

    if (tableIds && tableIds.length > 0) {
        query = query.in("id", tableIds);
    }

    const { data, error } = await query;
    if (error) return { kind: "db_error", message: error.message };
    return { kind: "ok", rows: (data ?? []) as TableRow[] };
}

async function _generateQrPng(url: string): Promise<Uint8Array> {
    // Try toBuffer first; if it returns a Node Buffer wrapper in Deno,
    // fall back to data-URL decoding.
    try {
        const buf = await QRCode.toBuffer(url, {
            errorCorrectionLevel: "M",
            type: "png",
            width: 256,
            margin: 1
        });
        if (buf instanceof Uint8Array) return buf;
        // Some Deno builds return Buffer that extends Uint8Array → covered.
        // If it's a plain ArrayBuffer, wrap it.
        if (buf instanceof ArrayBuffer) return new Uint8Array(buf);
    } catch {
        // fall through to data-URL path
    }
    const dataUrl: string = await QRCode.toDataURL(url, {
        errorCorrectionLevel: "M",
        type: "image/png",
        width: 256,
        margin: 1
    });
    const base64 = dataUrl.split(",")[1] ?? "";
    const bin = atob(base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
}

async function _generatePdf(
    tables: TableRow[],
    activitySlug: string
): Promise<Uint8Array> {
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const totalPages = Math.ceil(tables.length / QRS_PER_PAGE);

    for (let pageIdx = 0; pageIdx < totalPages; pageIdx++) {
        const page = pdfDoc.addPage([A4_WIDTH, A4_HEIGHT]);
        const sliceStart = pageIdx * QRS_PER_PAGE;
        const sliceEnd = Math.min(sliceStart + QRS_PER_PAGE, tables.length);

        for (let i = sliceStart; i < sliceEnd; i++) {
            const idx = i - sliceStart;
            const col = idx % GRID_COLS;
            const row = Math.floor(idx / GRID_COLS);
            const table = tables[i];

            const cellOriginX = PAGE_MARGIN + col * CELL_WIDTH;
            const cellOriginY = A4_HEIGHT - PAGE_MARGIN - (row + 1) * CELL_HEIGHT;

            // QR centered horizontally, pinned near top of cell
            const qrX = cellOriginX + (CELL_WIDTH - QR_SIZE) / 2;
            const qrY = cellOriginY + CELL_HEIGHT - QR_SIZE - LABEL_GAP;

            const qrUrl = `${APP_URL}/t/${table.qr_token}`;
            const qrPng = await _generateQrPng(qrUrl);
            const embedded = await pdfDoc.embedPng(qrPng);

            page.drawImage(embedded, {
                x: qrX,
                y: qrY,
                width: QR_SIZE,
                height: QR_SIZE
            });

            // Label centered horizontally, just below the QR
            const labelText = table.label;
            const labelWidth = font.widthOfTextAtSize(labelText, LABEL_FONT_SIZE);
            const labelX = cellOriginX + (CELL_WIDTH - labelWidth) / 2;
            const labelY = qrY - LABEL_GAP - LABEL_FONT_SIZE;

            page.drawText(labelText, {
                x: labelX,
                y: labelY,
                size: LABEL_FONT_SIZE,
                font,
                color: rgb(0, 0, 0)
            });
        }
    }

    return await pdfDoc.save();
}

function _safeFilename(slug: string): string {
    // Activity slugs are already URL-safe in the DB, but defensively
    // strip anything that could break Content-Disposition.
    return slug.replace(/[^a-z0-9_-]/gi, "_").slice(0, 80) || "tables";
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
    const body = parsed as GenerateRequestBody;

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
            console.error("[generate-table-qrs] activity read error:", activityFetch.message);
            return jsonResponse(500, {
                code: "INTERNAL_ERROR",
                message: "Errore interno."
            });
        }
        const activity = activityFetch.row;

        // ── Membership check ──
        const membership = await _isMemberOfTenant(supabaseUser, activity.tenant_id);
        if (membership.kind === "db_error") {
            console.error(
                "[generate-table-qrs] tenant membership read error:",
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

        // ── Fetch tables ──
        const tablesFetch = await _fetchTables(supabaseService, body.activity_id, body.table_ids);
        if (tablesFetch.kind === "db_error") {
            console.error("[generate-table-qrs] tables read error:", tablesFetch.message);
            return jsonResponse(500, {
                code: "INTERNAL_ERROR",
                message: "Errore interno."
            });
        }
        if (tablesFetch.rows.length === 0) {
            return jsonResponse(404, {
                code: "NO_TABLES_FOUND",
                message: "Nessun tavolo trovato per questa sede."
            });
        }
        const tables = tablesFetch.rows;

        // ── Rate limit per (user, activity) ──
        try {
            await checkRateLimit(supabaseService, {
                key: `generate-table-qrs:user:${userId}:activity:${body.activity_id}`,
                limit: RATE_LIMIT_PER_USER_PER_ACTIVITY_PER_MIN,
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

        // ── Generate PDF ──
        const pdfBytes = await _generatePdf(tables, activity.slug);
        const pagesCount = Math.ceil(tables.length / QRS_PER_PAGE);

        console.log("[generate-table-qrs] table_qrs_generated", {
            event: "table_qrs_generated",
            user_id: userId,
            tenant_id: activity.tenant_id,
            activity_id: activity.id,
            tables_count: tables.length,
            pages_count: pagesCount
        });

        const filename = `qr-codes-${_safeFilename(activity.slug)}.pdf`;
        return new Response(pdfBytes, {
            status: 200,
            headers: {
                ...corsHeaders,
                "Content-Type": "application/pdf",
                "Content-Disposition": `attachment; filename="${filename}"`,
                "Content-Length": String(pdfBytes.length)
            }
        });
    } catch (e) {
        console.error(
            "[generate-table-qrs] internal error:",
            (e as Error)?.message,
            (e as Error)?.stack
        );
        return jsonResponse(500, {
            code: "INTERNAL_ERROR",
            message: "Errore interno."
        });
    }
});
