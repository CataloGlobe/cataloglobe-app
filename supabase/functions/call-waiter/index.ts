// @ts-nocheck
//
// call-waiter — customer-side endpoint. Cliente preme "Chiama il cameriere"
// dall'OrderingSheet. Imposta `customer_sessions.waiter_called_at = now()`
// con rate-limit temporale di 60s (a differenza di request-bill che e' one-shot
// idempotente). Lo staff vedra' la chiamata nella view tavoli admin.
//
// Pipeline:
//   1. Auth via custom JWT (verifyCustomerJwt) -> customer_session_id
//   2. Rate limit generico per session (anti-burst)
//   3. Load sessione + valida expires_at > now() (404 se scaduta/inesistente)
//   4. Gate temporale 60s sulla colonna: se waiter_called_at e' recente, ritorna
//      il timestamp esistente con rate_limited=true
//   5. Altrimenti UPDATE waiter_called_at = now(), ritorna rate_limited=false
//
// Risposta 200: { waiter_called_at: string; rate_limited: boolean }

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyCustomerJwt } from "../_shared/customerJwt.ts";
import { checkRateLimit, RateLimitExceededError } from "../_shared/rateLimit.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Rate limit generico anti-burst: 10 req/min per session.
// Il vero gate semantico e' temporale a 60s sulla colonna waiter_called_at
// (UI risponde con rate_limited=true senza errore). Questo limit copre gli
// abusi/bot, lasciando spazio per click ripetuti dell'utente nel frattempo.
const RATE_LIMIT_PER_SESSION_PER_MIN = 10;
const WAITER_CALL_COOLDOWN_SECONDS = 60;

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
        // -- JWT verify --
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

        // -- Rate limit anti-burst --
        try {
            await checkRateLimit(supabaseService, {
                key: `call-waiter:session:${sessionId}`,
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

        // -- Load sessione + valida expires_at --
        const { data: existing, error: fetchErr } = await supabaseService
            .from("customer_sessions")
            .select("id, expires_at, waiter_called_at")
            .eq("id", sessionId)
            .maybeSingle();

        if (fetchErr) {
            console.error("[call-waiter] fetch error:", fetchErr.message);
            return jsonResponse(500, { code: "INTERNAL_ERROR", message: "Errore interno." });
        }

        if (!existing) {
            return jsonResponse(404, {
                code: "SESSION_NOT_FOUND",
                message: "Sessione non trovata."
            });
        }

        const nowMs = Date.now();
        const expiresMs = Date.parse(existing.expires_at);
        if (!Number.isFinite(expiresMs) || expiresMs <= nowMs) {
            return jsonResponse(404, {
                code: "SESSION_NOT_FOUND",
                message: "Sessione non trovata."
            });
        }

        // -- Gate temporale 60s --
        if (existing.waiter_called_at) {
            const lastMs = Date.parse(existing.waiter_called_at);
            if (Number.isFinite(lastMs) && (nowMs - lastMs) < WAITER_CALL_COOLDOWN_SECONDS * 1000) {
                return jsonResponse(200, {
                    waiter_called_at: existing.waiter_called_at,
                    rate_limited: true
                });
            }
        }

        // -- UPDATE waiter_called_at --
        const nowIso = new Date(nowMs).toISOString();
        const { data: updated, error: updateErr } = await supabaseService
            .from("customer_sessions")
            .update({ waiter_called_at: nowIso })
            .eq("id", sessionId)
            .select("id, waiter_called_at")
            .maybeSingle();

        if (updateErr) {
            console.error("[call-waiter] update error:", updateErr.message);
            return jsonResponse(500, { code: "INTERNAL_ERROR", message: "Errore interno." });
        }

        if (!updated) {
            // Race: row sparita tra fetch e update (close-table concorrente).
            return jsonResponse(404, {
                code: "SESSION_NOT_FOUND",
                message: "Sessione non trovata."
            });
        }

        console.log("[call-waiter] called", {
            event: "waiter_called",
            session_id: sessionId,
            waiter_called_at: updated.waiter_called_at
        });

        return jsonResponse(200, {
            waiter_called_at: updated.waiter_called_at,
            rate_limited: false
        });
    } catch (e) {
        console.error("[call-waiter] internal error:", (e as Error)?.message);
        return jsonResponse(500, { code: "INTERNAL_ERROR", message: "Errore interno." });
    }
});
