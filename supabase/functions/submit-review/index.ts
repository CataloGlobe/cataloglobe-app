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

    try {
        const body = (await req.json()) as Record<string, unknown>;

        // ── Validation ──────────────────────────────────────────────
        const activityId = body.activity_id;
        if (typeof activityId !== "string" || activityId.trim() === "") {
            return jsonResponse({ error: "activity_id è obbligatorio" }, 400);
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
            sessionId = body.session_id.trim();
        }

        // ── Supabase client (service_role) ──────────────────────────
        const supabase = createClient(
            Deno.env.get("SUPABASE_URL")!,
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
        );

        // ── Rate limiting ───────────────────────────────────────────
        if (sessionId) {
            const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

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
        const { error: insertError } = await supabase.from("reviews").insert({
            tenant_id: activity.tenant_id,
            activity_id: activityId,
            rating,
            rating_category: ratingCategory(rating),
            comment,
            source: "public_form",
            status: "approved",
            session_id: sessionId
        });

        if (insertError) throw insertError;

        return jsonResponse({ success: true }, 200);
    } catch (err) {
        console.error("[submit-review] error:", err);
        return jsonResponse({ error: "Errore durante il salvataggio della recensione" }, 500);
    }
});
