// @ts-nocheck
// =============================================================================
// submit-lead — form «Richiedi una demo» della landing di campagna.
//
// Pubblica (verify_jwt=false), CORS limitato ai domini dell'app (su staging
// anche alle anteprime Vercel del progetto).
//  1. honeypot: campo nascosto `website` valorizzato → 200 senza salvare;
//  2. validazione server (`_shared/leadValidation.ts`, stesse regole del form);
//  3. rate limit: 5 invii validi/ora per IP (hash SHA-256 con salt);
//  4. insert in `public.leads` con service role (la tabella non ha policy).
//     La prova del consenso è tutta server: `consent_at` = ora dell'insert,
//     `consent_text` = versione dell'informativa in vigore
//     (`_shared/consentVersions.ts`, la stessa del frontend). Un eventuale
//     `consent_text` del client viene ignorato: non è verificabile;
//  5. email interna a LEADS_NOTIFY_EMAIL, best-effort: se fallisce si logga e
//     si risponde comunque successo, il contatto è già salvato.
//
// Secret: LEADS_NOTIFY_EMAIL (destinatario), LEADS_IP_SALT (salt dell'hash IP),
// RESEND_API_KEY (già presente, usato da `sendEmail`).
// =============================================================================

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildLeadNotificationEmail } from "../_shared/leadEmail.ts";
import { leadConsentText } from "../_shared/leadConsent.ts";
import { LEAD_LIMITS, cleanLeadMeta, validateLead } from "../_shared/leadValidation.ts";
import { normalizePhoneToE164 } from "../_shared/phoneNormalize.ts";
import { checkRateLimit, extractClientIp, hashIp, RateLimitExceededError } from "../_shared/rateLimit.ts";
import { sendEmail } from "../_shared/sendEmail.ts";

const RATE_LIMIT_PER_IP_PER_HOUR = 5;
const RATE_LIMIT_WINDOW_SECONDS = 3600;

const VARIANTS = new Set(["form", "signup"]);

// Stessa lista delle altre funzioni chiamate dal frontend.
const ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "https://staging.cataloglobe.com",
    "https://cataloglobe.com",
    "https://www.cataloglobe.com"
];

// Solo su staging: anteprime Vercel del progetto `cataloglobe-app` nel team
// `lorenzo-calzis-projects`, nelle due forme che Vercel genera
// (`<prefisso>-<hash di 9>-<team>` e `<prefisso>-git-<ramo>-<team>`). Il
// prefisso negli host generati è `cataloglobe` (visto sui deployment reali),
// non il nome completo del progetto: si accettano entrambi.
// Non tutto vercel.app. In produzione la lista resta quella sopra.
const STAGING_PROJECT_REF = "lxeawrpjfphgdspueiag";
const VERCEL_PREVIEW_ORIGIN = /^https:\/\/cataloglobe(?:-app)?-(?:[a-z0-9]{9}|git-[a-z0-9-]+)-lorenzo-calzis-projects\.vercel\.app$/;
const IS_STAGING = (Deno.env.get("SUPABASE_URL") ?? "").includes(`//${STAGING_PROJECT_REF}.`);

function isAllowedOrigin(origin: string): boolean {
    if (ALLOWED_ORIGINS.includes(origin)) return true;
    return IS_STAGING && VERCEL_PREVIEW_ORIGIN.test(origin);
}

function corsHeaders(req: Request): Record<string, string> {
    const origin = req.headers.get("origin") ?? "";
    const allowed = isAllowedOrigin(origin) ? origin : "";
    return {
        "Access-Control-Allow-Origin": allowed,
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Vary": "Origin"
    };
}

function json(req: Request, body: Record<string, unknown>, status: number): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders(req), "Content-Type": "application/json" }
    });
}

/** SHA-256 hex di salt + IP: quello che si salva in `leads.ip_hash`. */
async function saltedIpHash(ip: string, salt: string): Promise<string> {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${salt}:${ip}`));
    return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

serve(async (req: Request) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
    if (req.method !== "POST") return json(req, { error_code: "METHOD_NOT_ALLOWED" }, 405);

    let body: Record<string, unknown>;
    try {
        body = (await req.json()) as Record<string, unknown>;
        if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("not an object");
    } catch {
        return json(req, { error_code: "INVALID_PAYLOAD" }, 400);
    }

    // 1. Honeypot: un bot che compila tutto riceve la stessa risposta di un
    //    invio vero, e non impara nulla.
    if (typeof body.website === "string" && body.website.trim() !== "") {
        return json(req, { success: true }, 200);
    }

    try {
        const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

        // 2. Validazione.
        const result = validateLead(
            {
                name: body.name,
                venueName: body.venue_name,
                phone: body.phone,
                email: body.email,
                consent: body.consent,
                interests: body.interests
            },
            (raw) => normalizePhoneToE164(raw)
        );
        if (!result.ok) {
            return json(req, { error_code: "INVALID_PAYLOAD", details: { fields: result.errors } }, 400);
        }
        const lead = result.value;

        // 3. Rate limit per IP, contato solo sugli invii validi: chi corregge
        //    un campo non si brucia i tentativi. Senza salt il contatto passa
        //    lo stesso, senza ip_hash: un errore di configurazione non deve
        //    perdere lead.
        const ip = extractClientIp(req);
        const salt = Deno.env.get("LEADS_IP_SALT") ?? "";
        if (!salt) console.error("[submit-lead] LEADS_IP_SALT mancante: ip_hash non salvato");
        const ipHash = salt ? await saltedIpHash(ip, salt) : null;
        try {
            await checkRateLimit(supabase, {
                key: `submit-lead:ip:${ipHash ?? (await hashIp(ip))}`,
                limit: RATE_LIMIT_PER_IP_PER_HOUR,
                windowSeconds: RATE_LIMIT_WINDOW_SECONDS
            });
        } catch (e) {
            if (e instanceof RateLimitExceededError) return json(req, { error_code: "RATE_LIMITED" }, 429);
            throw e;
        }

        const variant = typeof body.variant === "string" && VARIANTS.has(body.variant) ? body.variant : null;
        const meta = {
            variant,
            utm_source: cleanLeadMeta(body.utm_source),
            utm_medium: cleanLeadMeta(body.utm_medium),
            utm_campaign: cleanLeadMeta(body.utm_campaign),
            utm_content: cleanLeadMeta(body.utm_content),
            utm_term: cleanLeadMeta(body.utm_term),
            referrer: cleanLeadMeta(body.referrer, LEAD_LIMITS.referrer),
            landing_path: cleanLeadMeta(body.landing_path)
        };

        // 4. Insert.
        const createdAt = new Date();
        const { error: insertError } = await supabase.from("leads").insert({
            created_at: createdAt.toISOString(),
            name: lead.name,
            venue_name: lead.venueName,
            phone: lead.phone,
            email: lead.email,
            interests: lead.interests,
            consent_at: createdAt.toISOString(),
            consent_text: leadConsentText(),
            ip_hash: ipHash,
            ...meta
        });
        if (insertError) throw insertError;

        // 5. Email interna, best-effort (`sendEmail` non lancia mai).
        const notifyTo = Deno.env.get("LEADS_NOTIFY_EMAIL");
        if (!notifyTo) {
            console.error("[submit-lead] LEADS_NOTIFY_EMAIL mancante: contatto salvato senza email");
        } else {
            await sendEmail({ to: notifyTo, ...buildLeadNotificationEmail(lead, meta, createdAt) });
        }

        return json(req, { success: true }, 200);
    } catch (err) {
        // Solo codice e messaggio: l'oggetto d'errore del DB può contenere la riga (dati personali).
        const e = err as { code?: unknown; message?: unknown };
        console.error("[submit-lead] error:", e?.code ?? "", e?.message ?? String(err));
        return json(req, { error_code: "SERVER_ERROR" }, 500);
    }
});
