// @ts-nocheck
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { LOCK_MINUTES, sha256 } from "../_shared/otpCore.ts";

/* ================= CONFIG ================= */
const VERIFICATION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OTP_PEPPER = Deno.env.get("OTP_PEPPER")!;

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

    if (!OTP_PEPPER) return json(500, { error: "server_misconfigured" });

    let body: { code?: string };
    try {
        body = await req.json();
    } catch {
        return json(400, { error: "invalid_request" });
    }

    const rawCode = body.code ?? "";
    const code = rawCode.replace(/\D/g, ""); // solo cifre

    if (code.length !== 6) return json(400, { error: "invalid_code" });

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json(401, { error: "unauthorized" });

    const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: authHeader } }
    });

    const { data: authData, error: authError } = await supabaseAuth.auth.getUser();
    const userId = authData?.user?.id;

    if (authError || !userId) return json(401, { error: "unauthorized" });

    const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const now = new Date();
    const nowMs = now.getTime();

    const { data: challenge } = await supabaseAdmin
        .from("otp_challenges")
        .select("*")
        .eq("user_id", userId)
        .is("consumed_at", null)
        .maybeSingle();

    if (!challenge) return json(400, { error: "invalid_or_expired" });

    // scaduto -> consumo e stop
    if (new Date(challenge.expires_at).getTime() < nowMs) {
        await supabaseAdmin
            .from("otp_challenges")
            .update({ consumed_at: now })
            .eq("id", challenge.id);
        return json(400, { error: "invalid_or_expired" });
    }

    const maxAttempts = challenge.max_attempts ?? 5;

    // lock
    if (challenge.locked_until && new Date(challenge.locked_until).getTime() > nowMs) {
        return json(429, {
            error: "locked",
            attempts_left: 0,
            max_attempts: maxAttempts
        });
    }

    const hash = await sha256(code + OTP_PEPPER);

    // mismatch -> attempts++ e forse lock
    if (hash !== challenge.code_hash) {
        const attempts = (challenge.attempts ?? 0) + 1;

        const locked = attempts >= maxAttempts ? new Date(nowMs + LOCK_MINUTES * 60 * 1000) : null;

        await supabaseAdmin
            .from("otp_challenges")
            .update({
                attempts,
                ...(locked ? { locked_until: locked } : {})
            })
            .eq("id", challenge.id);

        return json(400, {
            error: "invalid_or_expired",
            attempts_left: Math.max(0, maxAttempts - attempts),
            max_attempts: maxAttempts
        });
    }

    // success -> consumo atomico (single use). WHERE consumed_at IS NULL
    // chiude la finestra TOCTOU tra la SELECT sopra e questa UPDATE: se due
    // richieste concorrenti leggono la stessa challenge non consumata e
    // calcolano entrambe un hash valido, solo una UPDATE puo' matchare
    // consumed_at IS NULL; l'altra vede 0 righe e viene rifiutata invece di
    // proseguire con una seconda verifica riuscita dello stesso codice.
    const { data: consumedRows, error: consumeError } = await supabaseAdmin
        .from("otp_challenges")
        .update({ consumed_at: now, attempts: (challenge.attempts ?? 0) + 1 })
        .eq("id", challenge.id)
        .is("consumed_at", null)
        .select("id");

    if (consumeError) {
        console.error("verify-otp: consume update failed", consumeError);
        return json(500, { error: "db_error" });
    }

    if (!consumedRows || consumedRows.length === 0) {
        // Persa la race — un'altra richiesta concorrente ha gia' consumato
        // questa challenge. Rifiuta come codice invalido/scaduto.
        return json(400, { error: "invalid_or_expired" });
    }

    const verifiedAt = new Date();
    const expiresAt = new Date(verifiedAt.getTime() + VERIFICATION_TTL_MS);

    const { error: insertErr } = await supabaseAdmin.from("otp_user_verifications").upsert(
        {
            user_id: userId,
            verified_at: verifiedAt.toISOString(),
            expires_at: expiresAt.toISOString()
        },
        { onConflict: "user_id" }
    );

    if (insertErr) {
        console.error("verify-otp: otp_user_verifications upsert failed", insertErr);
        return json(500, { error: "db_error" });
    }

    return json(200, { ok: true });
});
