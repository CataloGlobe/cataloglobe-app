// @ts-nocheck
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
    checkRateLimit,
    hashIp,
    RateLimitExceededError
} from "../_shared/rateLimit.ts";
import { VALID_SUBSCRIPTION_STATUSES } from "../_shared/checkOrderingState.ts";

// Limiti (stessi numeri di prima, ora atomici: due richieste in parallelo non
// passano più entrambe). Contatori in `rate_limit_buckets`, chiave con l'IP
// in hash, mai in chiaro.
const RATE_LIMIT_IP_PER_DAY = 10;
const RATE_LIMIT_SESSION_PER_DAY = 1;
const DAY_SECONDS = 24 * 60 * 60;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS"
};

function jsonResponse(body: Record<string, unknown>, status: number) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
}

/**
 * Catalogo messaggi errore strutturati. Mantengo italiano per backward compat
 * UX: il frontend pre-Prompt 18 legge data.error (campo legacy) e mostra
 * direttamente la stringa. Quando il Prompt 18 introduce i18next, il frontend
 * leggerà data.error_code e farà lookup chiavi i18n.
 *
 * TODO Prompt 18: rimuovere il campo data.error fallback dopo conferma
 * transizione del caller (ReviewsView.tsx).
 */
const ERROR_MESSAGES: Record<string, string> = {
    METHOD_NOT_ALLOWED:  "Metodo non consentito",
    INVALID_PAYLOAD:     "Dati non validi",
    INVALID_RATING:      "Il rating deve essere un intero tra 1 e 5",
    RATE_LIMIT_IP:       "Troppe richieste. Riprova più tardi.",
    RATE_LIMIT_SESSION:  "Hai già lasciato una recensione di recente.",
    ACTIVITY_NOT_FOUND:  "Attività non trovata",
    ACTIVITY_NOT_ACTIVE: "Questo locale al momento non riceve recensioni",
    SERVER_ERROR:        "Errore durante il salvataggio della recensione"
};

/**
 * Response error strutturata con error_code per i18n + campi legacy per
 * compat con il caller frontend pre-Prompt 18.
 */
function errorResponse(
    code: string,
    status: number,
    details?: Record<string, unknown>
): Response {
    const message = ERROR_MESSAGES[code] ?? "Si è verificato un errore";
    return new Response(
        JSON.stringify({
            error_code: code,
            // backward compat (deprecated): rimuovere post Prompt 18 quando
            // ReviewsView.tsx leggerà error_code + i18n lookup.
            error: message,
            message,
            ...(details ? { details } : {})
        }),
        {
            status,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
        }
    );
}

function ratingCategory(rating: number): "positive" | "neutral" | "negative" {
    if (rating >= 4) return "positive";
    if (rating === 3) return "neutral";
    return "negative";
}

serve(async (req: Request) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    if (req.method !== "POST") {
        return errorResponse("METHOD_NOT_ALLOWED", 405);
    }

    // ── IP del client ───────────────────────────────────────────
    // Nel contatore del limite va solo in hash; in `reviews.request_ip`
    // resta salvato com'era (da decidere se toglierlo).
    const requestIp: string =
        (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() ||
        req.headers.get("x-real-ip") ||
        "unknown";

    try {
        const body = (await req.json()) as Record<string, unknown>;

        // ── Validation ──────────────────────────────────────────────
        const activityId = body.activity_id;
        if (typeof activityId !== "string" || activityId.trim() === "") {
            return errorResponse("INVALID_PAYLOAD", 400, { field: "activity_id", reason: "required" });
        }
        if (!UUID_RE.test(activityId.trim())) {
            return errorResponse("INVALID_PAYLOAD", 400, { field: "activity_id", reason: "invalid" });
        }

        const rating = body.rating;
        if (typeof rating !== "number" || !Number.isInteger(rating) || rating < 1 || rating > 5) {
            return errorResponse("INVALID_RATING", 400);
        }

        let comment: string | null = null;
        if (body.comment !== undefined && body.comment !== null) {
            if (typeof body.comment !== "string") {
                return errorResponse("INVALID_PAYLOAD", 400, { field: "comment", reason: "type" });
            }
            const trimmed = body.comment.trim();
            comment = trimmed.length > 0 ? trimmed.slice(0, 2000) : null;
        }

        let sessionId: string | null = null;
        if (body.session_id !== undefined && body.session_id !== null) {
            if (typeof body.session_id !== "string" || body.session_id.trim() === "") {
                return errorResponse("INVALID_PAYLOAD", 400, { field: "session_id", reason: "type" });
            }
            // La colonna è uuid: un valore diverso finirebbe in un 500 all'insert.
            if (!UUID_RE.test(body.session_id.trim())) {
                return errorResponse("INVALID_PAYLOAD", 400, { field: "session_id", reason: "invalid" });
            }
            sessionId = body.session_id.trim();
        }

        // ── Supabase client (service_role) ──────────────────────────
        const supabase = createClient(
            Deno.env.get("SUPABASE_URL")!,
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
        );

        // ── Rate limiting (atomico, fail-closed) ────────────────────
        // Un errore del contatore arriva al catch esterno → 500: senza
        // contatore non si accettano recensioni.
        try {
            if (requestIp !== "unknown") {
                await checkRateLimit(supabase, {
                    key: `submit-review:ip:${await hashIp(requestIp)}`,
                    limit: RATE_LIMIT_IP_PER_DAY,
                    windowSeconds: DAY_SECONDS
                });
            }
        } catch (rlErr) {
            if (rlErr instanceof RateLimitExceededError) {
                return errorResponse("RATE_LIMIT_IP", 429);
            }
            throw rlErr;
        }

        if (sessionId) {
            try {
                await checkRateLimit(supabase, {
                    key: `submit-review:session:${activityId}:${sessionId}`,
                    limit: RATE_LIMIT_SESSION_PER_DAY,
                    windowSeconds: DAY_SECONDS
                });
            } catch (rlErr) {
                if (rlErr instanceof RateLimitExceededError) {
                    return errorResponse("RATE_LIMIT_SESSION", 429);
                }
                throw rlErr;
            }
        }

        // ── Lookup activity → tenant_id ─────────────────────────────
        const { data: activity, error: activityError } = await supabase
            .from("activities")
            .select("id, tenant_id, status")
            .eq("id", activityId)
            .maybeSingle();

        if (activityError) throw activityError;

        if (!activity) {
            return errorResponse("ACTIVITY_NOT_FOUND", 404);
        }

        // Solo sedi attive di un'azienda con abbonamento valido, come per
        // prenotazioni e ordini: prima bastava l'id di una sede qualsiasi.
        if (activity.status !== "active") {
            return errorResponse("ACTIVITY_NOT_ACTIVE", 409);
        }
        const { data: tenant, error: tenantError } = await supabase
            .from("tenants")
            .select("subscription_status, deleted_at")
            .eq("id", activity.tenant_id)
            .maybeSingle();
        if (tenantError) throw tenantError;
        if (
            !tenant ||
            tenant.deleted_at !== null ||
            !VALID_SUBSCRIPTION_STATUSES.has(tenant.subscription_status)
        ) {
            return errorResponse("ACTIVITY_NOT_ACTIVE", 409);
        }

        // ── Insert review ───────────────────────────────────────────
        // Feedback privato per il locale (R1): nessuna moderazione, nessuna
        // lettura pubblica. `status` resta al default storico e non si usa.
        const { error: insertError } = await supabase.from("reviews").insert({
            tenant_id: activity.tenant_id,
            activity_id: activityId,
            rating,
            rating_category: ratingCategory(rating),
            comment,
            source: "public_form",
            status: "pending",
            session_id: sessionId,
            request_ip: requestIp !== "unknown" ? requestIp : null
        });

        if (insertError) throw insertError;

        return jsonResponse({ success: true }, 200);
    } catch (err) {
        console.error("[submit-review] error:", err);
        return errorResponse("SERVER_ERROR", 500);
    }
});
