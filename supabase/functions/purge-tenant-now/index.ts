// @ts-nocheck
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { purgeTenantData } from "../_shared/tenant-purge.ts";

// ---------------------------------------------------------------------------
// purge-tenant-now
//
// Immediately and permanently deletes a single soft-deleted tenant on demand.
// Called by the tenant owner from the Workspace UI ("Elimina definitivamente").
//
// Security model:
//   - verify_jwt = false (JWT validated manually via supabase.auth.getUser())
//   - All DB writes use service_role (bypasses RLS)
//   - Only the tenant owner can trigger a purge
//   - Tenant must have deleted_at IS NOT NULL (soft-deleted first)
//
// Deletion logic is shared with purge-tenants via _shared/tenant-purge.ts.
// ---------------------------------------------------------------------------

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json"
};

function json(status: number, body: Record<string, unknown>) {
    return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

serve(async req => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

    try {
        const SUPABASE_URL              = Deno.env.get("SUPABASE_URL");
        const SUPABASE_ANON_KEY         = Deno.env.get("SUPABASE_ANON_KEY");
        const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

        if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
            console.error("purge-tenant-now: Missing required env vars");
            return json(500, { error: "server_misconfigured" });
        }

        // Step 1: validate Authorization header
        const authHeader = req.headers.get("Authorization");
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            console.error("purge-tenant-now: Missing or malformed Authorization header");
            return json(401, { error: "unauthorized" });
        }

        // Step 2: parse body
        let payload: { tenantId?: string } | null = null;
        try {
            payload = await req.json();
        } catch {
            return json(400, { error: "invalid_json" });
        }

        const tenantId = payload?.tenantId?.trim();
        if (!tenantId) return json(400, { error: "missing_tenant_id" });

        // Step 3: resolve calling user from JWT
        const supabaseUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
            global: { headers: { Authorization: authHeader } }
        });

        const { data: authData, error: authError } = await supabaseUser.auth.getUser();
        const userId = authData?.user?.id;

        if (authError || !userId) {
            console.error(`purge-tenant-now: Token validation failed: ${authError?.message ?? "No user ID"}`);
            return json(401, { error: "unauthorized" });
        }

        console.log(`purge-tenant-now: Authenticated request for user ${userId}, tenant ${tenantId}`);

        // Step 4: fetch tenant via service_role (deleted rows are invisible to RLS)
        const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

        const { data: tenantRow, error: fetchError } = await supabaseAdmin
            .from("tenants")
            .select("id, owner_user_id, deleted_at")
            .eq("id", tenantId)
            .maybeSingle();

        if (fetchError) {
            console.error("purge-tenant-now: Tenant fetch failed:", fetchError.message);
            return json(500, { error: "fetch_failed" });
        }

        if (!tenantRow) {
            console.warn(`purge-tenant-now: Tenant ${tenantId} not found`);
            return json(404, { error: "tenant_not_found" });
        }

        // Step 5: verify ownership
        if (tenantRow.owner_user_id !== userId) {
            console.warn(`purge-tenant-now: User ${userId} is not the owner of tenant ${tenantId}`);
            return json(403, { error: "forbidden" });
        }

        // Step 6: tenant must be soft-deleted before it can be permanently purged
        if (tenantRow.deleted_at === null) {
            console.warn(`purge-tenant-now: Tenant ${tenantId} is not soft-deleted`);
            return json(409, { error: "tenant_not_deleted" });
        }

        // Step 7: run the full deletion sequence (shared with purge-tenants)
        const { deleted, storageFilesRemoved } = await purgeTenantData(supabaseAdmin, tenantId);

        console.log({ event: "tenant_purged_now", tenantId, userId, deleted, storageFilesRemoved });

        // Step 8: audit log (fire-and-forget — must not block or fail the response)
        supabaseAdmin
            .from("audit_logs")
            .insert({ tenant_id: null, user_id: userId, event_type: "tenant_purged", metadata: { tenantId, ...deleted, storageFilesRemoved } })
            .then(({ error }) => {
                if (error) console.error("purge-tenant-now: audit log insert failed:", error.message);
            });

        return json(200, { success: true });
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("purge-tenant-now: Unhandled error:", message);
        return json(500, { error: "purge_failed", detail: message });
    }
});
