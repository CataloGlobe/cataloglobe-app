// @ts-nocheck
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "@supabase/supabase-js";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS"
};

async function hashOtp(code: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(code);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

serve(async req => {
    // Preflight CORS
    if (req.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: corsHeaders });
    }

    try {
        const { userId, code } = await req.json();

        if (!userId || !code) {
            return new Response(JSON.stringify({ error: "invalid_request" }), {
                status: 400,
                headers: corsHeaders
            });
        }

        const supabase = createClient(
            Deno.env.get("SUPABASE_URL")!,
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
            {
                auth: { persistSession: false }
            }
        );

        // Recupero ultimo OTP
        const { data: otp, error } = await supabase
            .from("otps")
            .select("id, code, created_at")
            .eq("user_id", userId)
            .order("created_at", { ascending: false })
            .limit(1)
            .single();

        if (error || !otp) {
            return new Response(JSON.stringify({ error: "not_found" }), {
                status: 401,
                headers: corsHeaders
            });
        }

        // Scadenza (5 minuti)
        const expired = Date.now() - new Date(otp.created_at).getTime() > 5 * 60 * 1000;

        if (expired) {
            return new Response(JSON.stringify({ error: "expired" }), {
                status: 401,
                headers: corsHeaders
            });
        }

        // Verifica hash
        const codeHash = await hashOtp(code);
        if (codeHash !== otp.code) {
            return new Response(JSON.stringify({ error: "invalid" }), {
                status: 401,
                headers: corsHeaders
            });
        }

        // Cleanup OTP (monouso)
        await supabase.from("otps").delete().eq("user_id", userId);

        return new Response(JSON.stringify({ success: true }), {
            status: 200,
            headers: corsHeaders
        });
    } catch (err) {
        return new Response(JSON.stringify({ error: "server_error", err }), {
            status: 500,
            headers: corsHeaders
        });
    }
});
