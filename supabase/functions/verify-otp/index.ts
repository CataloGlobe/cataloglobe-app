// @ts-nocheck
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type JwtPayload = {
    sub?: string;
    sid?: string;
    exp?: number;
};

/* ================= CONFIG ================= */
const LOCK_MINUTES = 15;

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
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

async function sha256(value: string): Promise<string> {
    const data = new TextEncoder().encode(value);
    const hash = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(hash))
        .map(b => b.toString(16).padStart(2, "0"))
        .join("");
}

serve(async req => {
    console.log("HEADERS", Object.fromEntries(req.headers.entries()));

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

    const jwt = authHeader.replace("Bearer ", "");

    let payload: JwtPayload;
    try {
        payload = JSON.parse(atob(jwt.split(".")[1]));
    } catch {
        return json(401, { error: "unauthorized" });
    }

    const userId = payload.sub;
    const sessionId = payload.session_id;

    if (!userId || !sessionId) {
        return json(401, { error: "unauthorized" });
    }

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

    // lock
    if (challenge.locked_until && new Date(challenge.locked_until).getTime() > nowMs) {
        return json(429, { error: "locked" });
    }

    const hash = await sha256(code + OTP_PEPPER);

    // mismatch -> attempts++ e forse lock
    if (hash !== challenge.code_hash) {
        const attempts = (challenge.attempts ?? 0) + 1;

        const update: Record<string, unknown> = { attempts };
        if (attempts >= (challenge.max_attempts ?? 5)) {
            update.locked_until = new Date(nowMs + LOCK_MINUTES * 60 * 1000);
        }

        await supabaseAdmin.from("otp_challenges").update(update).eq("id", challenge.id);

        return json(400, { error: "invalid_or_expired" });
    }

    // success -> consumo (e attempts++ per audit)
    await supabaseAdmin
        .from("otp_challenges")
        .update({ consumed_at: now, attempts: (challenge.attempts ?? 0) + 1 })
        .eq("id", challenge.id);

    if (!sessionId) {
        console.error("verify-otp: missing session_id");
        return json(500, { error: "session_error" });
    }

    const { error: insertErr } = await supabaseAdmin.from("otp_session_verifications").upsert(
        {
            session_id: sessionId,
            user_id: userId,
            verified_at: new Date()
        },
        { onConflict: "session_id" }
    );

    if (insertErr) {
        console.error("verify-otp: otp_session_verifications insert failed", insertErr);
        return json(500, { error: "db_error" });
    }

    return json(200, { ok: true });
});
