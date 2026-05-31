// @ts-nocheck
//
// request-bill — customer-side endpoint. Cliente preme "Chiedi il conto"
// dall'OrderingSheet tab Ordini. Imposta `customer_sessions.bill_requested_at = now()`
// idempotente (no double-trigger se gia richiesto). Lo staff vedra il
// badge nella pagina Tavoli admin.
//
// Pipeline:
//   1. Auth via custom JWT (verifyCustomerJwt) → customer_session_id
//   2. Rate limit: 1 req per minuto per session
//   3. UPDATE customer_sessions con guard bill_requested_at IS NULL
//   4. Se gia richiesto: fetch stato + ritorna already_requested=true
//   5. Reply 200 con bill_requested_at timestamp

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyCustomerJwt } from "../_shared/customerJwt.ts";
import { checkRateLimit, RateLimitExceededError } from "../_shared/rateLimit.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const RATE_LIMIT_PER_SESSION_PER_MIN = 1;

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS"
};

function jsonResponse(status: number, body: unknown, extraHeaders: Record<string, string> = {}): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
            ...extraHeaders
        }
    });
}

serve(async (req: Request) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }
    if (req.method !== "POST") {
        return jsonResponse(405, { code: "METHOD_NOT_ALLOWED", message: "Metodo non consentito." });
    }

    try {
        // ── JWT verify ──
        const authHeader = req.headers.get("Authorization");
        if (!authHeader?.startsWith("Bearer ")) {
            return jsonResponse(401, { code: "MISSING_JWT", message: "Token mancante." });
        }
        const jwt = authHeader.slice(7);

        let claims;
        try {
            claims = await verifyCustomerJwt(jwt);
        } catch {
            return jsonResponse(401, {
                code: "SESSION_EXPIRED",
                message: "Sessione scaduta, scansiona di nuovo il QR."
            });
        }

        const sessionId = claims.customer_session_id;
        if (!sessionId) {
            return jsonResponse(401, { code: "INVALID_TOKEN", message: "Token non valido." });
        }

        const supabaseService = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
            auth: { persistSession: false, autoRefreshToken: false }
        });

        // ── Rate limit ──
        try {
            await checkRateLimit(supabaseService, {
                key: `request-bill:session:${sessionId}`,
                limit: RATE_LIMIT_PER_SESSION_PER_MIN,
                windowSeconds: 60
            });
        } catch (e) {
            if (e instanceof RateLimitExceededError) {
                return jsonResponse(429, {
                    code: "RATE_LIMITED",
                    message: "Troppe richieste, riprova tra poco.",
                    retry_after_seconds: e.retryAfterSeconds
                }, { "Retry-After": String(e.retryAfterSeconds) });
            }
            throw e;
        }

        // ── Idempotent UPDATE: solo se bill_requested_at NULL ──
        const nowIso = new Date().toISOString();
        const { data, error } = await supabaseService
            .from("customer_sessions")
            .update({ bill_requested_at: nowIso })
            .eq("id", sessionId)
            .is("bill_requested_at", null)
            .select("id, bill_requested_at")
            .maybeSingle();

        if (error) {
            console.error("[request-bill] update error:", error.message);
            return jsonResponse(500, { code: "INTERNAL_ERROR", message: "Errore interno." });
        }

        if (!data) {
            // No row matched: o gia richiesto o session non trovata
            const { data: existing, error: fetchErr } = await supabaseService
                .from("customer_sessions")
                .select("id, bill_requested_at")
                .eq("id", sessionId)
                .maybeSingle();

            if (fetchErr || !existing) {
                return jsonResponse(404, {
                    code: "SESSION_NOT_FOUND",
                    message: "Sessione non trovata."
                });
            }

            return jsonResponse(200, {
                bill_requested_at: existing.bill_requested_at,
                already_requested: true
            });
        }

        console.log("[request-bill] requested", {
            event: "bill_requested",
            session_id: sessionId,
            bill_requested_at: data.bill_requested_at
        });

        return jsonResponse(200, {
            bill_requested_at: data.bill_requested_at,
            already_requested: false
        });
    } catch (e) {
        console.error("[request-bill] internal error:", (e as Error)?.message);
        return jsonResponse(500, { code: "INTERNAL_ERROR", message: "Errore interno." });
    }
});
