// @ts-nocheck
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type JwtPayload = {
    sub?: string;
};

const COOLDOWN_MS = 60 * 1000;

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

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
    if (!userId) return json(401, { error: "unauthorized" });

    const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const now = new Date();
    const nowMs = now.getTime();

    const { data: challenge, error } = await supabaseAdmin
        .from("otp_challenges")
        .select("id,last_sent_at,attempts,max_attempts,expires_at,locked_until,consumed_at")
        .eq("user_id", userId)
        .is("consumed_at", null)
        .maybeSingle();

    if (error) return json(500, { error: "db_error" });

    if (!challenge) {
        return json(200, {
            resend_available_in: 0,
            attempts_used: null,
            attempts_left: null,
            max_attempts: null,
            expires_in: null,
            locked: false
        });
    }

    const lastSentAtMs = challenge.last_sent_at ? new Date(challenge.last_sent_at).getTime() : 0;
    const resendAvailableInMs = Math.max(0, COOLDOWN_MS - (nowMs - lastSentAtMs));

    const attemptsUsed = challenge.attempts ?? 0;
    const maxAttempts = challenge.max_attempts ?? 5;
    const attemptsLeft = Math.max(0, maxAttempts - attemptsUsed);

    const expiresAtMs = challenge.expires_at ? new Date(challenge.expires_at).getTime() : 0;
    const expiresInMs = Math.max(0, expiresAtMs - nowMs);

    const locked = !!challenge.locked_until && new Date(challenge.locked_until).getTime() > nowMs;

    return json(200, {
        resend_available_in: Math.ceil(resendAvailableInMs / 1000),
        attempts_used: attemptsUsed,
        attempts_left: attemptsLeft,
        max_attempts: maxAttempts,
        expires_in: Math.ceil(expiresInMs / 1000),
        locked
    });
});
