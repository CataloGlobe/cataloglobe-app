// @ts-nocheck
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
        return jsonResponse({ error: "Metodo non consentito" }, 405);
    }

    // ── Extract IP (preparatorio per rate limit per IP) ─────────────
    // NOTA: il rate limit basato su request_ip richiede la colonna
    // `request_ip TEXT` sulla tabella reviews — migration pendente.
    // Il codice è predisposto ma il check DB è disabilitato finché
    // la migration non viene applicata.
    const requestIp: string =
        (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() ||
        req.headers.get("x-real-ip") ||
        "unknown";

    try {
        const body = (await req.json()) as Record<string, unknown>;

        // ── Validation ──────────────────────────────────────────────
        const activityId = body.activity_id;
        if (typeof activityId !== "string" || activityId.trim() === "") {
            return jsonResponse({ error: "activity_id è obbligatorio" }, 400);
        }
        // UUID = 36 chars max
        if (activityId.trim().length > 36) {
            return jsonResponse({ error: "activity_id non valido" }, 400);
        }

        const rating = body.rating;
        if (typeof rating !== "number" || !Number.isInteger(rating) || rating < 1 || rating > 5) {
            return jsonResponse({ error: "rating deve essere un intero tra 1 e 5" }, 400);
        }

        let comment: string | null = null;
        if (body.comment !== undefined && body.comment !== null) {
            if (typeof body.comment !== "string") {
                return jsonResponse({ error: "comment deve essere una stringa" }, 400);
            }
            const trimmed = body.comment.trim();
            comment = trimmed.length > 0 ? trimmed.slice(0, 2000) : null;
        }

        let sessionId: string | null = null;
        if (body.session_id !== undefined && body.session_id !== null) {
            if (typeof body.session_id !== "string" || body.session_id.trim() === "") {
                return jsonResponse({ error: "session_id non valido" }, 400);
            }
            if (body.session_id.trim().length > 100) {
                return jsonResponse({ error: "session_id non valido" }, 400);
            }
            sessionId = body.session_id.trim();
        }

        // ── Supabase client (service_role) ──────────────────────────
        const supabase = createClient(
            Deno.env.get("SUPABASE_URL")!,
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
        );

        // ── Rate limiting ───────────────────────────────────────────
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

        // Check globale per IP: max 10 review per IP nelle ultime 24h
        if (requestIp !== "unknown") {
            const { data: ipReviews, error: ipRlError } = await supabase
                .from("reviews")
                .select("id")
                .eq("request_ip", requestIp)
                .gte("created_at", twentyFourHoursAgo);

            if (ipRlError) throw ipRlError;

            if (ipReviews && ipReviews.length >= 10) {
                return jsonResponse({ error: "Troppe richieste. Riprova più tardi." }, 429);
            }
        }

        if (sessionId) {
            // Check: stessa session_id + stessa activity nelle ultime 24h
            const { data: existing, error: rlError } = await supabase
                .from("reviews")
                .select("id")
                .eq("session_id", sessionId)
                .eq("activity_id", activityId)
                .gte("created_at", twentyFourHoursAgo)
                .limit(1);

            if (rlError) throw rlError;

            if (existing && existing.length > 0) {
                return jsonResponse(
                    { error: "Hai già lasciato una recensione di recente. Riprova più tardi." },
                    429
                );
            }
        }

        // ── Lookup activity → tenant_id ─────────────────────────────
        const { data: activity, error: activityError } = await supabase
            .from("activities")
            .select("id, tenant_id")
            .eq("id", activityId)
            .maybeSingle();

        if (activityError) throw activityError;

        if (!activity) {
            return jsonResponse({ error: "Attività non trovata" }, 404);
        }

        // ── Insert review ───────────────────────────────────────────
        // status: "pending" — le review vengono approvate manualmente.
        // La RLS anon filtra già status = 'approved' per la pagina pubblica.
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
        return jsonResponse({ error: "Errore durante il salvataggio della recensione" }, 500);
    }
});
