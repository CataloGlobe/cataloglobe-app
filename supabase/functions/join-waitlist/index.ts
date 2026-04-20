// @ts-nocheck
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS"
};

const VALID_ACTIVITY_TYPES = ["ristorante", "bar", "hotel", "retail", "altro"] as const;

function jsonResponse(body: Record<string, unknown>, status: number) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
}

function isValidEmail(email: string): boolean {
    const atIndex = email.indexOf("@");
    if (atIndex < 1) return false;
    const domain = email.slice(atIndex + 1);
    return domain.includes(".");
}

serve(async (req: Request) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    if (req.method !== "POST") {
        return jsonResponse({ success: false, error: "method_not_allowed" }, 405);
    }

    try {
        const body = (await req.json()) as Record<string, unknown>;

        // ── Validation ──────────────────────────────────────────────
        const rawEmail = body.email;
        if (typeof rawEmail !== "string" || rawEmail.trim() === "") {
            return jsonResponse({ success: false, error: "invalid_email" }, 400);
        }
        const email = rawEmail.trim().toLowerCase();
        if (!isValidEmail(email)) {
            return jsonResponse({ success: false, error: "invalid_email" }, 400);
        }

        let name: string | null = null;
        if (body.name !== undefined && body.name !== null) {
            if (typeof body.name !== "string") {
                return jsonResponse({ success: false, error: "invalid_email" }, 400);
            }
            const trimmed = body.name.trim();
            name = trimmed.length > 0 ? trimmed : null;
        }

        let activityType: string | null = null;
        if (body.activity_type !== undefined && body.activity_type !== null) {
            if (typeof body.activity_type !== "string" || !VALID_ACTIVITY_TYPES.includes(body.activity_type as any)) {
                return jsonResponse({ success: false, error: "invalid_activity_type" }, 400);
            }
            activityType = body.activity_type;
        }

        // ── Supabase client (service_role) ──────────────────────────
        const supabase = createClient(
            Deno.env.get("SUPABASE_URL")!,
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
        );

        // ── Insert ──────────────────────────────────────────────────
        const { error: insertError } = await supabase.from("waitlist").insert({
            email,
            name,
            activity_type: activityType
        });

        if (insertError) {
            // Duplicate email — respond success, don't leak existence
            if (insertError.code === "23505") {
                return jsonResponse({ success: true, message: "already_registered" }, 200);
            }
            throw insertError;
        }

        return jsonResponse({ success: true }, 200);
    } catch (err) {
        console.error("[join-waitlist] error:", err);
        return jsonResponse({ success: false, error: "server_error" }, 500);
    }
});
