// @ts-nocheck
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ---------------------------------------------------------------------------
// restore-tenant
//
// Restores a soft-deleted tenant by setting deleted_at back to NULL.
// Only the tenant owner can call this, and only within the 30-day window
// before the scheduled purge permanently removes the tenant.
//
// Security:
//   - verify_jwt = false (JWT validated manually, same pattern as delete-tenant)
//   - JWT is verified via supabase.auth.getUser() with the anon key
//   - All ownership checks use service_role so soft-deleted rows are visible
//   - The UPDATE uses service_role — required because trg_protect_tenant_deleted_at
//     blocks any modification to deleted_at by non-service_role callers
//
// Guards (in order):
//   1. Valid JWT with a resolvable user ID
//   2. Tenant row exists at all (not yet purged)
//   3. Caller is the tenant owner (owner_user_id === auth.uid())
//   4. Tenant is currently soft-deleted (deleted_at IS NOT NULL)
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
        const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
        const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
        const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

        if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
            return json(500, { error: "server_misconfigured" });
        }

        // Step 1: validate Authorization header
        const authHeader = req.headers.get("Authorization");
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            console.error("restore-tenant: Missing or malformed Authorization header");
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
            console.error(
                `restore-tenant: Token validation failed: ${authError?.message ?? "No user ID"}`
            );
            return json(401, { error: "unauthorized" });
        }

        console.log(`restore-tenant: Authenticated request for user ${userId}, tenant ${tenantId}`);

        // Step 4: fetch the tenant via service_role so we can see soft-deleted rows.
        // We cannot use the user client here: the SELECT policy on tenants filters
        // out rows where deleted_at IS NOT NULL, so a deleted tenant is invisible
        // to the user's JWT. service_role bypasses RLS entirely.
        const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

        const { data: tenantRow, error: fetchError } = await supabaseAdmin
            .from("tenants")
            .select("id, owner_user_id, deleted_at")
            .eq("id", tenantId)
            .maybeSingle();

        if (fetchError) {
            console.error("restore-tenant: Tenant fetch failed:", fetchError.message);
            return json(500, { error: "fetch_failed" });
        }

        // Guard: tenant was already permanently purged
        if (!tenantRow) {
            console.warn(`restore-tenant: Tenant ${tenantId} not found (may already be purged)`);
            return json(404, { error: "tenant_not_found" });
        }

        // Guard: only the owner can restore
        if (tenantRow.owner_user_id !== userId) {
            console.warn(
                `restore-tenant: User ${userId} is not the owner of tenant ${tenantId}`
            );
            return json(403, { error: "forbidden" });
        }

        // Guard: tenant must actually be soft-deleted to be restored
        if (tenantRow.deleted_at === null) {
            console.warn(`restore-tenant: Tenant ${tenantId} is not deleted — nothing to restore`);
            return json(409, { error: "tenant_not_deleted" });
        }

        // Step 5: restore — set deleted_at = NULL via service_role.
        // trg_protect_tenant_deleted_at permits this because current_user = 'service_role'.
        const { error: restoreError } = await supabaseAdmin
            .from("tenants")
            .update({ deleted_at: null })
            .eq("id", tenantId);

        if (restoreError) {
            console.error("restore-tenant: Update failed:", restoreError.message);
            return json(500, { error: "restore_failed" });
        }

        console.log(`restore-tenant: Tenant ${tenantId} restored by user ${userId}`);

        supabaseAdmin
            .from("audit_logs")
            .insert({ tenant_id: tenantId, user_id: userId, event_type: "tenant_restored" })
            .then(({ error }) => {
                if (error) console.error("restore-tenant: audit log insert failed:", error.message);
            });

        return json(200, { success: true });
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("restore-tenant: Unhandled error:", message);
        return json(500, { error: "restore_failed", detail: message });
    }
});
