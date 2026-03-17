// @ts-nocheck
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
            console.error("delete-tenant: Missing or malformed Authorization header");
            return json(401, { error: "unauthorized" });
        }

        // Step 2: parse and validate body
        let payload: { tenantId?: string } | null = null;
        try {
            payload = await req.json();
        } catch {
            return json(400, { error: "invalid_json" });
        }

        const tenantId = payload?.tenantId?.trim();
        if (!tenantId) return json(400, { error: "missing_tenant_id" });

        // Step 3: resolve the calling user from the JWT
        const supabaseUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
            global: { headers: { Authorization: authHeader } }
        });

        const { data: authData, error: authError } = await supabaseUser.auth.getUser();
        const userId = authData?.user?.id;

        if (authError || !userId) {
            console.error(
                `delete-tenant: Token validation failed: ${authError?.message || "No user ID"}`
            );
            return json(401, { error: "unauthorized" });
        }

        console.log(`delete-tenant: Authenticated request for user ${userId}, tenant ${tenantId}`);

        // Step 4: ownership check via the user's JWT (RLS-guarded).
        // The SELECT policy on tenants allows owners to read their own rows
        // (owner_user_id = auth.uid() AND deleted_at IS NULL). If the query
        // returns null, the tenant either doesn't exist, is already soft-deleted,
        // or doesn't belong to this user.
        const { data: tenantData, error: ownershipError } = await supabaseUser
            .from("tenants")
            .select("id, owner_user_id")
            .eq("id", tenantId)
            .maybeSingle();

        if (ownershipError) {
            console.error("delete-tenant: Ownership check failed:", ownershipError);
            return json(500, { error: "ownership_check_failed" });
        }

        if (!tenantData) {
            console.warn(
                `delete-tenant: Tenant ${tenantId} not found or not accessible for user ${userId}`
            );
            return json(403, { error: "forbidden" });
        }

        // Step 5: explicit owner_user_id verification.
        // Even though RLS already filters by owner, we verify explicitly here
        // to ensure only the owner (not an admin or member) can soft-delete.
        if (tenantData.owner_user_id !== userId) {
            console.warn(
                `delete-tenant: User ${userId} is not the owner of tenant ${tenantId}`
            );
            return json(403, { error: "forbidden" });
        }

        // Step 6: soft delete via service_role (bypasses RLS).
        // Sets deleted_at to now(). All RLS policies that rely on
        // get_my_tenant_ids() or the user_tenants_view will immediately
        // stop returning this tenant to any client.
        const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

        const { error: deleteError } = await supabaseAdmin
            .from("tenants")
            .update({ deleted_at: new Date().toISOString() })
            .eq("id", tenantId);

        if (deleteError) {
            console.error("delete-tenant: Soft delete failed:", deleteError);
            throw deleteError;
        }

        console.log(`delete-tenant: Tenant ${tenantId} soft-deleted by user ${userId}`);

        supabaseAdmin
            .from("audit_logs")
            .insert({ tenant_id: tenantId, user_id: userId, event_type: "tenant_deleted" })
            .then(({ error }) => {
                if (error) console.error("delete-tenant: audit log insert failed:", error.message);
            });

        return json(200, { success: true });
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("delete-tenant: Unhandled error:", message);
        return json(500, { error: "delete_failed", detail: message });
    }
});
