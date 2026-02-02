// @ts-nocheck
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "https://esm.sh/resend@2.1.0";

/* ------------------------------------------------------------------
 * CONFIG
 * ------------------------------------------------------------------ */
const ORIGIN = Deno.env.get("SITE_ORIGIN") ?? "https://staging.cataloglobe.com";

const corsHeaders = {
    "Access-Control-Allow-Origin": ORIGIN,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json"
};

const RESEND_COOLDOWN_MS = 60_000; // 60s

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
        const { userId } = await req.json();

        if (!userId || userId !== authUser.id) {
            return new Response(JSON.stringify({ error: "forbidden" }), {
                status: 403,
                headers: corsHeaders
            });
        }

        const email = authUser.email!;
        const supabase = createClient(
            Deno.env.get("SUPABASE_URL")!,
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
            { auth: { persistSession: false } }
        );

        /* --------------------------------------------------------------
         * RATE LIMIT (server-side)
         * -------------------------------------------------------------- */
        const { data: lastOtp } = await supabase
            .from("otps")
            .select("created_at")
            .eq("user_id", userId)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

        if (lastOtp?.created_at) {
            const tooSoon =
                Date.now() - new Date(lastOtp.created_at).getTime() < RESEND_COOLDOWN_MS;

            if (tooSoon) {
                return new Response(JSON.stringify({ error: "too_many_requests" }), {
                    status: 429,
                    headers: corsHeaders
                });
            }
        }

        /* --------------------------------------------------------------
         * GENERA OTP
         * -------------------------------------------------------------- */
        const code = Math.floor(100000 + Math.random() * 900000).toString();
        const codeHash = await hashOtp(code);

        // cleanup OTP precedenti
        await supabase.from("otps").delete().eq("user_id", userId);

        const { error: insertError } = await supabase
            .from("otps")
            .insert({ user_id: userId, code: codeHash });

        if (insertError) {
            throw insertError;
        }

        /* --------------------------------------------------------------
         * SEND EMAIL
         * -------------------------------------------------------------- */
        const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

        await resend.emails.send({
            from: "Cataloglobe <updates@cataloglobe.com>",
            to: email,
            subject: "Il tuo codice di accesso Cataloglobe",
            html: `
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background:#f9fafb;padding:40px">
          <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px">
            <h1 style="margin:0 0 16px;font-size:22px;color:#111827">
              Codice di accesso
            </h1>
            <p style="margin:0 0 24px;font-size:15px;color:#374151">
              Usa questo codice per completare l’accesso a <strong>Cataloglobe</strong>.
            </p>
            <div style="text-align:center;margin:32px 0">
              <div style="display:inline-block;padding:16px 24px;font-size:28px;letter-spacing:4px;font-weight:700;background:#111827;color:#ffffff;border-radius:10px">
                ${code}
              </div>
            </div>
            <p style="margin:24px 0 0;font-size:14px;color:#6b7280">
              Il codice è valido per pochi minuti.
            </p>
          </div>
        </div>
      `
        });

        console.log("[send-otp] OTP sent to user", userId);

        return new Response(JSON.stringify({ success: true }), {
            status: 200,
            headers: corsHeaders
        });
    } catch (err) {
        console.error("[send-otp] unexpected error", err);
        return new Response(JSON.stringify({ error: "server_error" }), {
            status: 500,
            headers: corsHeaders
        });
    }
});
