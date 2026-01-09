// @ts-nocheck
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS"
};

serve(async req => {
    // ✅ PRE-FLIGHT CORS
    if (req.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const { businessId } = await req.json();
        if (!businessId) {
            return new Response(JSON.stringify({ error: "Missing businessId" }), {
                status: 400,
                headers: corsHeaders
            });
        }

        // Client con SERVICE ROLE (server-side)
        const supabase = createClient(
            Deno.env.get("SUPABASE_URL")!,
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
        );

        /* ----------------------------------
       DELETE STORAGE ASSETS
    ---------------------------------- */

        const bucket = supabase.storage.from("business-covers");

        const { data: folders, error: listError } = await bucket.list("", {
            limit: 1000
        });
        if (listError) throw listError;

        const targetFolders =
            folders?.filter(f => f.name.endsWith(`__${businessId}`)).map(f => f.name) ?? [];

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
       DELETE BUSINESS ROW
    ---------------------------------- */

        const { error: dbError } = await supabase.from("businesses").delete().eq("id", businessId);

        if (dbError) throw dbError;

        return new Response(JSON.stringify({ success: true }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
    } catch (err) {
        console.error("delete-business error:", err);
        return new Response(JSON.stringify({ error: "Delete failed" }), {
            status: 500,
            headers: corsHeaders
        });
    }
});
