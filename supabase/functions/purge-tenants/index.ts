// @ts-nocheck
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { purgeTenantData, PurgeSummary } from "../_shared/tenant-purge.ts";

// ---------------------------------------------------------------------------
// purge-tenants
//
// Scheduled edge function that permanently deletes tenants soft-deleted more
// than 30 days ago. Must be called by Supabase Cron (pg_cron) with the
// service role key — never exposed publicly.
//
// Security:
//   - verify_jwt = false (no user JWT expected — called by pg_cron)
//   - Validates the PURGE_SECRET header (x-purge-secret) against env var
//   - Creates supabaseAdmin with SERVICE_ROLE_KEY (bypasses RLS)
//   - Processes tenants in batches of BATCH_SIZE to avoid function timeouts
//
// Deletion logic is shared with purge-tenant-now via _shared/tenant-purge.ts.
// ---------------------------------------------------------------------------

const BATCH_SIZE = 10;
const RETENTION_DAYS = 30;

interface PurgeResult {
    tenantId: string;
    deleted: Record<string, number>;
    storageFilesRemoved: number;
    error?: string;
}

function json(status: number, body: Record<string, unknown>) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" }
    });
}

/** Purge a single tenant, catching errors internally so batch processing continues. */
async function purgeTenant(
    supabaseAdmin: ReturnType<typeof createClient>,
    tenantId: string
): Promise<PurgeResult> {
    const result: PurgeResult = { tenantId, deleted: {}, storageFilesRemoved: 0 };

    try {
        const summary: PurgeSummary = await purgeTenantData(supabaseAdmin, tenantId);
        result.deleted = summary.deleted;
        result.storageFilesRemoved = summary.storageFilesRemoved;

        console.log({
            tenantId,
            deletedTables: result.deleted,
            storageFilesRemoved: result.storageFilesRemoved
        });

        supabaseAdmin
            .from("v2_audit_logs")
            .insert({ tenant_id: null, event_type: "tenant_purged", metadata: { tenantId, ...result.deleted, storageFilesRemoved: result.storageFilesRemoved } })
            .then(({ error }) => {
                if (error) console.error(`purge-tenants: audit log insert failed for ${tenantId}:`, error.message);
            });
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        result.error = message;
        console.error(`purge-tenants: ERROR purging tenant ${tenantId}:`, message);
    }

    return result;
}

serve(async req => {
    if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

    const SUPABASE_URL              = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const PURGE_SECRET              = Deno.env.get("PURGE_SECRET");

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
        console.error("purge-tenants: Missing required env vars");
        return json(500, { error: "server_misconfigured" });
    }

    if (PURGE_SECRET) {
        const incomingSecret = req.headers.get("x-purge-secret");
        if (!incomingSecret || incomingSecret !== PURGE_SECRET) {
            console.error("purge-tenants: Invalid or missing x-purge-secret header");
            return json(401, { error: "unauthorized" });
        }
    } else {
        console.error("purge-tenants: PURGE_SECRET env var not configured");
        return json(500, { error: "server_misconfigured" });
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();

    const { data: expiredTenants, error: fetchErr } = await supabaseAdmin
        .from("v2_tenants")
        .select("id, name, deleted_at")
        .not("deleted_at", "is", null)
        .lt("deleted_at", cutoff)
        .order("deleted_at", { ascending: true });

    if (fetchErr) {
        console.error("purge-tenants: Failed to fetch expired tenants:", fetchErr.message);
        return json(500, { error: "fetch_failed", detail: fetchErr.message });
    }

    const total = expiredTenants?.length ?? 0;
    console.log(`purge-tenants: Found ${total} tenant(s) eligible for purge (cutoff: ${cutoff})`);

    if (total === 0) {
        return json(200, { purged: 0, failed: 0, results: [] });
    }

    const allResults: PurgeResult[] = [];

    for (let i = 0; i < total; i += BATCH_SIZE) {
        const batch = expiredTenants!.slice(i, i + BATCH_SIZE);
        console.log(
            `purge-tenants: Processing batch ${Math.floor(i / BATCH_SIZE) + 1} ` +
            `(${batch.length} tenant(s))`
        );

        const batchResults = await Promise.allSettled(
            batch.map(t => purgeTenant(supabaseAdmin, t.id))
        );

        for (const outcome of batchResults) {
            if (outcome.status === "fulfilled") {
                allResults.push(outcome.value);
            } else {
                console.error("purge-tenants: Unexpected rejection:", String(outcome.reason));
                allResults.push({
                    tenantId: "unknown",
                    deleted: {},
                    storageFilesRemoved: 0,
                    error: String(outcome.reason)
                });
            }
        }
    }

    const purged = allResults.filter(r => !r.error).length;
    const failed = allResults.filter(r => !!r.error).length;

    console.log(`purge-tenants: Done — purged=${purged}, failed=${failed}`);

    return json(200, { purged, failed, results: allResults });
});
