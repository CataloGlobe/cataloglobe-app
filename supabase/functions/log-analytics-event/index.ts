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

const VALID_EVENT_TYPES = new Set([
    "page_view",
    "product_detail_open",
    "selection_add",
    "selection_remove",
    "selection_sheet_open",
    "featured_click",
    "social_click",
    "search_performed",
    "tab_switch",
    "section_view",
    "review_submitted",
    "review_google_redirect"
]);

const VALID_DEVICE_TYPES = new Set(["mobile", "tablet", "desktop"]);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
        if (typeof activityId !== "string" || !UUID_RE.test(activityId)) {
            return jsonResponse({ error: "activity_id non valido" }, 400);
        }

        const eventType = body.event_type;
        if (typeof eventType !== "string" || !VALID_EVENT_TYPES.has(eventType)) {
            return jsonResponse({ error: "event_type non valido" }, 400);
        }

        const metadata = body.metadata ?? {};
        if (typeof metadata !== "object" || Array.isArray(metadata)) {
            return jsonResponse({ error: "metadata deve essere un oggetto" }, 400);
        }

        let sessionId: string | null = null;
        if (body.session_id != null) {
            if (typeof body.session_id !== "string" || !UUID_RE.test(body.session_id)) {
                return jsonResponse({ error: "session_id non valido" }, 400);
            }
            sessionId = body.session_id;
        }

        let deviceType: string | null = null;
        if (body.device_type != null) {
            if (typeof body.device_type !== "string" || !VALID_DEVICE_TYPES.has(body.device_type)) {
                return jsonResponse({ error: "device_type non valido" }, 400);
            }
            deviceType = body.device_type;
        }

        let screenWidth: number | null = null;
        if (body.screen_width != null) {
            if (typeof body.screen_width !== "number" || !Number.isInteger(body.screen_width)) {
                return jsonResponse({ error: "screen_width deve essere un intero" }, 400);
            }
            screenWidth = body.screen_width;
        }

        // ── Supabase client (service_role) ──────────────────────────
        const supabase = createClient(
            Deno.env.get("SUPABASE_URL")!,
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
        );

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

        // ── Insert event ────────────────────────────────────────────
        const { error: insertError } = await supabase.from("analytics_events").insert({
            tenant_id: activity.tenant_id,
            activity_id: activityId,
            event_type: eventType,
            metadata,
            session_id: sessionId,
            device_type: deviceType,
            screen_width: screenWidth
        });

        if (insertError) throw insertError;

        return jsonResponse({ ok: true }, 200);
    } catch (err) {
        console.error("[log-analytics-event] error:", err);
        return jsonResponse({ error: "Errore durante il salvataggio dell'evento" }, 500);
    }
});
