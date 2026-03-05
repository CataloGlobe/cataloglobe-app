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
        if (!authHeader) return json(401, { error: "unauthorized" });

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

        if (authError || !userId) return json(401, { error: "unauthorized" });

        // Ownership guard before using service-role writes.
        const { data: ownedActivity, error: ownershipError } = await supabaseUser
            .from("v2_activities")
            .select("id, tenant_id")
            .eq("id", businessId)
            .maybeSingle();

        if (ownershipError) {
            console.error("delete-business ownership check failed:", ownershipError);
            return json(500, { error: "ownership_check_failed" });
        }

        if (!ownedActivity || ownedActivity.tenant_id !== userId) {
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
            folders?.filter(folder => folder.name.endsWith(`__${businessId}`)).map(folder => folder.name) ??
            [];

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

        const { error: dbError } = await supabaseAdmin
            .from("v2_activities")
            .delete()
            .eq("id", businessId)
            .eq("tenant_id", userId);

        if (dbError) throw dbError;

        return json(200, { success: true });
    } catch (err) {
        console.error("delete-business error:", err);
        return json(500, { error: "delete_failed" });
    }
});
