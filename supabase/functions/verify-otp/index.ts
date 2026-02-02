// @ts-nocheck
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "@supabase/supabase-js";

/* ------------------------------------------------------------------
 * CONFIG
 * ------------------------------------------------------------------ */
const ORIGIN = Deno.env.get("SITE_ORIGIN") ?? "https://staging.cataloglobe.com";

const corsHeaders = {
    "Access-Control-Allow-Origin": ORIGIN,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS"
};

const OTP_TTL_MS = 5 * 60 * 1000; // 5 minuti
const MAX_ATTEMPTS = 3;

/* ------------------------------------------------------------------
 * UTILS
 * ------------------------------------------------------------------ */
async function hashOtp(code: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(code);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(hashBuffer))
        .map(b => b.toString(16).padStart(2, "0"))
        .join("");
}

/* ------------------------------------------------------------------
 * HANDLER
 * ------------------------------------------------------------------ */
serve(async req => {
    // CORS preflight
    if (req.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: corsHeaders });
    }

    try {
        /* --------------------------------------------------------------
         * AUTH: verifica JWT del chiamante
         * -------------------------------------------------------------- */
        const authHeader = req.headers.get("Authorization") ?? "";
        const token = authHeader.replace("Bearer ", "").trim();

        if (!token) {
            return new Response(JSON.stringify({ error: "missing_token" }), {
                status: 401,
                headers: corsHeaders
            });
        }

        // Client ANON → solo per validare il token
        const supabaseAuth = createClient(
            Deno.env.get("SUPABASE_URL")!,
            Deno.env.get("SUPABASE_ANON_KEY")!,
            { auth: { persistSession: false } }
        );

        const { data: authData, error: authError } = await supabaseAuth.auth.getUser(token);

        if (authError || !authData?.user) {
            return new Response(JSON.stringify({ error: "invalid_token" }), {
                status: 401,
                headers: corsHeaders
            });
        }

        const authUser = authData.user;

        /* --------------------------------------------------------------
         * INPUT
         * -------------------------------------------------------------- */
        const { userId, code } = await req.json();

        if (!userId || !code) {
            return new Response(JSON.stringify({ error: "invalid_request" }), {
                status: 400,
                headers: corsHeaders
            });
        }

        // 🔐 Il caller deve essere lo stesso user
        if (authUser.id !== userId) {
            return new Response(JSON.stringify({ error: "forbidden" }), {
                status: 403,
                headers: corsHeaders
            });
        }

        /* --------------------------------------------------------------
         * DB (SERVICE ROLE)
         * -------------------------------------------------------------- */
        const supabase = createClient(
            Deno.env.get("SUPABASE_URL")!,
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
            { auth: { persistSession: false } }
        );

        // Recupero ultimo OTP
        const { data: otp, error } = await supabase
            .from("otps")
            .select("id, code, created_at, attempts")
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

        /* --------------------------------------------------------------
         * TENTATIVI
         * -------------------------------------------------------------- */
        if ((otp.attempts ?? 0) >= MAX_ATTEMPTS) {
            await supabase.from("otps").delete().eq("id", otp.id);

            return new Response(JSON.stringify({ error: "too_many_attempts" }), {
                status: 429,
                headers: corsHeaders
            });
        }

        /* --------------------------------------------------------------
         * SCADENZA
         * -------------------------------------------------------------- */
        const expired = Date.now() - new Date(otp.created_at).getTime() > OTP_TTL_MS;

        if (expired) {
            await supabase.from("otps").delete().eq("id", otp.id);

            return new Response(JSON.stringify({ error: "expired" }), {
                status: 401,
                headers: corsHeaders
            });
        }

        /* --------------------------------------------------------------
         * VERIFICA CODICE
         * -------------------------------------------------------------- */
        const codeHash = await hashOtp(code);

        if (codeHash !== otp.code) {
            await supabase
                .from("otps")
                .update({ attempts: (otp.attempts ?? 0) + 1 })
                .eq("id", otp.id);

            return new Response(JSON.stringify({ error: "invalid" }), {
                status: 401,
                headers: corsHeaders
            });
        }

        /* --------------------------------------------------------------
         * SUCCESS → OTP MONOUSO
         * -------------------------------------------------------------- */
        await supabase.from("otps").delete().eq("id", otp.id);

        return new Response(JSON.stringify({ success: true }), {
            status: 200,
            headers: corsHeaders
        });
    } catch (err) {
        console.error("[verify-otp] unexpected error", err);

        return new Response(JSON.stringify({ error: "server_error" }), {
            status: 500,
            headers: corsHeaders
        });
    }
});
