// @ts-nocheck
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "npm:resend@4";
import { COMPANY, getEmailFooterHtml, getEmailFooterText } from "../_shared/company-config.ts";
import { checkRateLimit, RateLimitExceededError, extractClientIp, hashIp } from "../_shared/rateLimit.ts";

const RATE_LIMIT_PER_IP_PER_WINDOW = 5;
const RATE_LIMIT_WINDOW_SECONDS = 300;

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

        // ── Rate limit (per IP) ───────────────────────────────────────
        try {
            const ipHash = await hashIp(extractClientIp(req));
            await checkRateLimit(supabase, {
                key: `join-waitlist:ip:${ipHash}`,
                limit: RATE_LIMIT_PER_IP_PER_WINDOW,
                windowSeconds: RATE_LIMIT_WINDOW_SECONDS
            });
        } catch (e) {
            if (e instanceof RateLimitExceededError) {
                return jsonResponse({ success: false, error: "rate_limited" }, 429);
            }
            throw e;
        }

        // ── Insert ──────────────────────────────────────────────────
        const { error: insertError } = await supabase.from("waitlist").insert({
            email,
            name,
            activity_type: activityType
        });

        // Duplicate email — same response shape as a new signup, no
        // "already_registered" flag and no second confirmation email, so a
        // caller cannot distinguish "new" from "already on the list" from
        // the response alone (anti-enumeration).
        const isDuplicate = insertError?.code === "23505";
        if (insertError && !isDuplicate) {
            throw insertError;
        }

        // ── Confirmation email (best-effort, only for genuinely new signups) ──
        if (!isDuplicate) resend.emails.send({
            from: COMPANY.email.sender,
            reply_to: COMPANY.contact.info,
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
       ${getEmailFooterHtml()}
     </div>
`,
            text: `Grazie per il tuo interesse!\n\nSei nella lista d'attesa di CataloGlobe. Ti contatteremo appena la piattaforma sarà disponibile.\n\nSe hai domande, rispondi a questa email.\n\n— Il team CataloGlobe\n\n${getEmailFooterText()}`
        }).catch((err: unknown) => {
            console.error("[join-waitlist] Resend error:", err);
        });

        return jsonResponse({ success: true }, 200);
    } catch (err) {
        console.error("[join-waitlist] error:", err);
        return jsonResponse({ success: false, error: "server_error" }, 500);
    }
});
