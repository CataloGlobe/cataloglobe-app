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

        const authHeader = req.headers.get("Authorization");
        if (!authHeader) {
            console.error("delete-business: Missing Authorization header");
            return json(401, { error: "unauthorized" });
        }

        if (!authHeader.startsWith("Bearer ")) {
            console.error("delete-business: Malformed Authorization header, expected Bearer");
            return json(401, { error: "unauthorized" });
        }

        let payload: { businessId?: string } | null = null;
        try {
            payload = await req.json();
        } catch {
            return json(400, { error: "invalid_json" });
        }

        const businessId = payload?.businessId?.trim();
        if (!businessId) return json(400, { error: "missing_business_id" });

        const supabaseUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
            global: { headers: { Authorization: authHeader } }
        });

        const { data: authData, error: authError } = await supabaseUser.auth.getUser();
        const userId = authData?.user?.id;

        if (authError || !userId) {
            console.error(
                `delete-business: Token validation failed: ${authError?.message || "No user ID"}`
            );
            return json(401, { error: "unauthorized" });
        }

        console.log(`delete-business: Authenticated request for user ${userId}`);

        // Ownership guard — Step 1: fetch activity via the user's JWT.
        // RLS policy "Tenant select own rows" uses get_my_tenant_ids(), which
        // returns v2_tenants.id WHERE owner_user_id = auth.uid(). If the
        // activity is returned, the caller's JWT already proves they own the
        // tenant that owns this activity.
        const { data: ownedActivity, error: ownershipError } = await supabaseUser
            .from("v2_activities")
            .select("id, tenant_id")
            .eq("id", businessId)
            .maybeSingle();

        if (ownershipError) {
            console.error("delete-business ownership check failed:", ownershipError);
            return json(500, { error: "ownership_check_failed" });
        }

        if (!ownedActivity) {
            console.warn(
                `delete-business: Ownership denied (activity missing or not owned) for activity ${businessId} and user ${userId}`
            );
            return json(403, { error: "forbidden" });
        }

        // Ownership guard — Step 2: explicit v2_tenants verification.
        // Since service_role bypasses RLS, we explicitly confirm that the
        // authenticated user is the owner of the tenant that holds this
        // activity. This is required because v2_tenants.id is now a
        // gen_random_uuid() and is no longer equal to auth.uid() for new
        // multi-tenant users.
        const { data: tenantData, error: tenantError } = await supabaseUser
            .from("v2_tenants")
            .select("owner_user_id")
            .eq("id", ownedActivity.tenant_id)
            .maybeSingle();

        if (tenantError) {
            console.error("delete-business tenant ownership check failed:", tenantError);
            return json(500, { error: "ownership_check_failed" });
        }

        if (!tenantData || tenantData.owner_user_id !== userId) {
            console.warn(
                `delete-business: Tenant ownership denied for tenant ${ownedActivity.tenant_id} and user ${userId}`
            );
            return json(403, { error: "forbidden" });
        }

        const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

        /* ----------------------------------
           DELETE STORAGE ASSETS
        ---------------------------------- */

        const bucket = supabaseAdmin.storage.from("business-covers");

        const { data: folders, error: listError } = await bucket.list("", { limit: 1000 });
        if (listError) throw listError;

        const targetFolders =
            folders
                ?.filter(folder => folder.name.endsWith(`__${businessId}`))
                .map(folder => folder.name) ?? [];

        for (const folder of targetFolders) {
            const { data: files, error } = await bucket.list(folder, { limit: 1000 });
            if (error) throw error;

            const paths = files?.map(file => `${folder}/${file.name}`) ?? [];
            if (paths.length > 0) {
                const { error: removeError } = await bucket.remove(paths);
                if (removeError) throw removeError;
            }
        }

        /* ----------------------------------
           DELETE ACTIVITY ROW
        ---------------------------------- */

        // Use ownedActivity.tenant_id (v2_tenants.id), NOT userId.
        // In V2, tenant_id on child tables is the v2_tenants.id UUID,
        // which is no longer equal to the owner's auth.uid() for new users.
        const { error: dbError } = await supabaseAdmin
            .from("v2_activities")
            .delete()
            .eq("id", businessId)
            .eq("tenant_id", ownedActivity.tenant_id);

        if (dbError) throw dbError;

        return json(200, { success: true });
    } catch (err) {
        console.error("delete-business error:", err);
        return json(500, { error: "delete_failed" });
    }
});
