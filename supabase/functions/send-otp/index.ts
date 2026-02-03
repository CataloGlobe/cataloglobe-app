// @ts-nocheck
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "npm:resend@4";

/* ================= CONFIG ================= */
const OTP_LENGTH = 6;
const OTP_TTL_MS = 5 * 60 * 1000; // 5 min
const COOLDOWN_MS = 60 * 1000; // 60 sec tra invii
const WINDOW_MS = 15 * 60 * 1000; // finestra rate limit
const MAX_SENDS_PER_WINDOW = 5;
const LOCK_MINUTES = 15;

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OTP_PEPPER = Deno.env.get("OTP_PEPPER")!;
const resend = new Resend(Deno.env.get("RESEND_API_KEY")!);

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json"
};

/* ================= UTILS ================= */
function json(status: number, body: Record<string, unknown>) {
    return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

function generateOtp(): string {
    const arr = new Uint32Array(1);
    crypto.getRandomValues(arr);
    return (arr[0] % 10 ** OTP_LENGTH).toString().padStart(OTP_LENGTH, "0");
}

async function sha256(value: string): Promise<string> {
    const data = new TextEncoder().encode(value);
    const hash = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(hash))
        .map(b => b.toString(16).padStart(2, "0"))
        .join("");
}

function firstForwardedFor(header: string | null) {
    if (!header) return null;
    // prende il primo IP della lista "client, proxy1, proxy2"
    return header.split(",")[0]?.trim() || null;
}

/* ================= HANDLER ================= */
serve(async req => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

    // Hard fail se manca un secret fondamentale (così lo scopri subito)
    if (!OTP_PEPPER) return json(500, { error: "server_misconfigured" });

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json(401, { error: "unauthorized" });

    // Client autenticato con JWT utente
    const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: authHeader } }
    });

    const { data: authData, error: authError } = await supabaseAuth.auth.getUser();
    const user = authData?.user;

    if (authError || !user?.id || !user.email) return json(401, { error: "unauthorized" });

    // Admin client (bypass RLS) per leggere/scrivere otp_challenges
    const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const now = new Date();
    const nowMs = now.getTime();

    // Prendi challenge attiva (se esiste)
    const { data: challenge } = await supabaseAdmin
        .from("otp_challenges")
        .select("*")
        .eq("user_id", user.id)
        .is("consumed_at", null)
        .maybeSingle();

    // LOCK
    if (challenge?.locked_until && new Date(challenge.locked_until).getTime() > nowMs) {
        return json(429, { error: "locked" });
    }

    // COOLDOWN
    if (challenge?.last_sent_at) {
        const last = new Date(challenge.last_sent_at).getTime();
        if (nowMs - last < COOLDOWN_MS) return json(429, { error: "cooldown" });
    }

    // RATE LIMIT WINDOW (usa window_start_at, non created_at)
    let windowStart = challenge?.window_start_at ? new Date(challenge.window_start_at) : now;
    let sendCount = challenge?.send_count ?? 0;

    if (nowMs - windowStart.getTime() > WINDOW_MS) {
        windowStart = now;
        sendCount = 0;
    }

    sendCount += 1;

    if (sendCount > MAX_SENDS_PER_WINDOW) {
        const lockedUntil = new Date(nowMs + LOCK_MINUTES * 60 * 1000);

        // se esiste una challenge attiva la aggiorno, altrimenti ne creo una “vuota” lockata
        if (challenge?.id) {
            await supabaseAdmin
                .from("otp_challenges")
                .update({ locked_until: lockedUntil })
                .eq("id", challenge.id);
        } else {
            await supabaseAdmin.from("otp_challenges").insert({
                user_id: user.id,
                code_hash: await sha256("000000" + OTP_PEPPER), // valore placeholder (non usato)
                created_at: now,
                expires_at: new Date(nowMs + OTP_TTL_MS),
                locked_until: lockedUntil,
                window_start_at: windowStart,
                send_count: sendCount,
                last_sent_at: now
            });
        }

        return json(429, { error: "rate_limited" });
    }

    // Genera OTP e hash
    const otp = generateOtp();
    const codeHash = await sha256(otp + OTP_PEPPER);
    const expiresAt = new Date(nowMs + OTP_TTL_MS);

    const requestIp = firstForwardedFor(req.headers.get("x-forwarded-for"));
    const userAgent = req.headers.get("user-agent");

    // Se esiste challenge attiva, la aggiorno (NO delete)
    if (challenge?.id) {
        const { error: updErr } = await supabaseAdmin
            .from("otp_challenges")
            .update({
                code_hash: codeHash,
                expires_at: expiresAt,
                attempts: 0,
                max_attempts: challenge.max_attempts ?? 5,
                last_sent_at: now,
                send_count: sendCount,
                window_start_at: windowStart,
                request_ip: requestIp,
                user_agent: userAgent,
                locked_until: null,
                consumed_at: null
            })
            .eq("id", challenge.id);

        if (updErr) return json(500, { error: "db_error" });
    } else {
        const { error: insErr } = await supabaseAdmin.from("otp_challenges").insert({
            user_id: user.id,
            code_hash: codeHash,
            expires_at: expiresAt,
            attempts: 0,
            max_attempts: 5,
            last_sent_at: now,
            send_count: sendCount,
            window_start_at: windowStart,
            request_ip: requestIp,
            user_agent: userAgent
        });

        if (insErr) return json(500, { error: "db_error" });
    }

    // Invia email
    await resend.emails.send({
        from: "Cataloglobe <noreply@cataloglobe.com>",
        to: user.email,
        subject: "Il tuo codice di verifica",
        html: `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background:#f9fafb;padding:40px">
        <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px">
          <h1 style="margin:0 0 16px;font-size:22px;color:#111827">Codice di accesso</h1>
          <p style="margin:0 0 24px;font-size:15px;color:#374151">
            Usa questo codice per completare l’accesso a <strong>Cataloglobe</strong>.
          </p>
          <div style="text-align:center;margin:32px 0">
            <div style="display:inline-block;padding:16px 24px;font-size:28px;letter-spacing:4px;font-weight:700;background:#111827;color:#ffffff;border-radius:10px">
              ${otp}
            </div>
          </div>
          <p style="margin:24px 0 0;font-size:14px;color:#6b7280">
            Il codice scade tra 5 minuti.
          </p>
        </div>
      </div>
    `
    });

    return json(200, { ok: true });
});
