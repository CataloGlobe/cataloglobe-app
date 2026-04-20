// @ts-nocheck
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "npm:resend@4";

const resend = new Resend(Deno.env.get("RESEND_API_KEY")!);

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

        // ── Confirmation email (best-effort) ────────────────────────
        resend.emails.send({
            from: "CataloGlobe <noreply@cataloglobe.com>",
            to: email,
            subject: "Sei nella lista d'attesa di CataloGlobe!",
            html: `
     <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 24px;">
       <h2 style="font-size: 22px; font-weight: 700; color: #1a1a2e; margin: 0 0 16px;">
         Grazie per il tuo interesse!
       </h2>
       <p style="font-size: 15px; line-height: 1.6; color: #55536a; margin: 0 0 12px;">
         Sei nella lista d'attesa di CataloGlobe. Ti contatteremo appena la piattaforma sarà disponibile.
       </p>
       <p style="font-size: 15px; line-height: 1.6; color: #55536a; margin: 0 0 24px;">
         Nel frattempo, se hai domande o vuoi saperne di più, rispondi a questa email.
       </p>
       <p style="font-size: 13px; color: #9895a8; margin: 0;">
         — Il team CataloGlobe
       </p>
     </div>
`
        }).catch((err: unknown) => {
            console.error("[join-waitlist] Resend error:", err);
        });

        return jsonResponse({ success: true }, 200);
    } catch (err) {
        console.error("[join-waitlist] error:", err);
        return jsonResponse({ success: false, error: "server_error" }, 500);
    }
});
