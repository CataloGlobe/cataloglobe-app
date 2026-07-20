// @ts-nocheck
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "npm:resend@4";
import { createStripeClient, reactivateStripeSubIfScheduled } from "../_shared/stripe-helpers.ts";
import { checkRateLimit, RateLimitExceededError, extractClientIp, hashIp } from "../_shared/rateLimit.ts";
import { COMPANY, getEmailFooterHtml, getEmailFooterText } from "../_shared/company-config.ts";
import {
    OTP_TTL_MS,
    COOLDOWN_MS,
    WINDOW_MS,
    MAX_SENDS_PER_WINDOW,
    LOCK_MINUTES,
    generateOtp,
    hashOtp
} from "../_shared/otpCore.ts";

const RATE_LIMIT_PER_IP_PER_WINDOW = 5;
const RATE_LIMIT_WINDOW_SECONDS = 900;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

// Floor for step-A ("send code") response latency. Both the "account is
// recoverable, OTP just sent" and "not recoverable" branches are padded up
// to this duration so response timing cannot be used as an enumeration
// oracle (email send is the slow, variable-latency operation).
const SEND_STEP_MIN_RESPONSE_MS = 500;

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json"
};

function json(status: number, body: Record<string, unknown>) {
    return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

async function sleepRemaining(startedAtMs: number, minDurationMs: number) {
    const elapsed = Date.now() - startedAtMs;
    const remaining = minDurationMs - elapsed;
    if (remaining > 0) await new Promise(resolve => setTimeout(resolve, remaining));
}

interface ResolvedUser {
    userId: string;
    bannedUntil: string | null;
}

// -------------------------------------------------------------------------
// Resolve user_id (+ current banned_until) from email. Pure lookup — no
// mutation. Supabase admin listUsers does not support email filtering
// directly, so we paginate until we find a matching record.
//
// Deliberately does NOT touch ban state here: this is reachable from Step A
// with just an {email}, no proof of possession, so it must never mutate an
// account that hasn't already been confirmed as deleted. The ban-resync
// safety net (see isEligibleForRecoveryOtp) only runs after that check.
// -------------------------------------------------------------------------
async function resolveUserId(
    supabaseAdmin: ReturnType<typeof createClient>,
    email: string
): Promise<ResolvedUser | null> {
    let page = 1;
    const perPage = 1000;

    while (true) {
        const { data: listData, error: listError } = await supabaseAdmin.auth.admin.listUsers({
            page,
            perPage
        });

        if (listError) {
            console.error(
                JSON.stringify({ event: "recover_account_list_failed", detail: listError.message })
            );
            return null;
        }

        const match = listData.users.find(u => (u.email ?? "").toLowerCase() === email);

        if (match) {
            return { userId: match.id, bannedUntil: match.banned_until ?? null };
        }

        if (listData.users.length < perPage) return null;
        page++;
    }
}

// Returns true if this user_id currently has account_deleted_at set (i.e. is
// in principle recoverable, regardless of whether the 30-day window already
// expired — the window check itself only happens after OTP verification,
// see the module comment on handleVerifyStep).
//
// Safety-net reban: only reached here, after account_deleted_at IS
// confirmed set. If account_deleted_at is set but the user isn't currently
// banned (a prior delete-account run may have failed partway through the
// ban step), re-apply the ban so state stays consistent. Never runs for an
// account that hasn't been confirmed deleted — an active account is never
// mutated by Step A.
async function isEligibleForRecoveryOtp(
    supabaseAdmin: ReturnType<typeof createClient>,
    userId: string,
    bannedUntil: string | null
): Promise<boolean> {
    const { data: profile, error } = await supabaseAdmin
        .from("profiles")
        .select("account_deleted_at")
        .eq("id", userId)
        .single();

    if (error) {
        console.error(
            JSON.stringify({
                event: "recover_account_profile_fetch_failed",
                user_id: userId,
                detail: error.message
            })
        );
        return false;
    }

    if (!profile.account_deleted_at) return false;

    const isBanned = bannedUntil != null && new Date(bannedUntil).getTime() > Date.now();

    if (!isBanned) {
        const { error: rebanError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
            ban_duration: "876000h"
        });
        if (rebanError) {
            console.error(
                JSON.stringify({
                    event: "recover_account_reban_failed",
                    user_id: userId,
                    error_message: rebanError.message
                })
            );
        } else {
            console.log(JSON.stringify({ event: "recover_account_reban_applied", user_id: userId }));
        }
    }

    return true;
}

// -------------------------------------------------------------------------
// Send a recovery OTP to an eligible user. Reuses the otp_challenges table
// and hash scheme from the send-otp/verify-otp 2FA flow, but is invoked
// server-side with service_role (no caller JWT — the caller has no session
// by definition, that's why they're recovering). Applies the same
// cooldown/window/lock anti-bombing rules as send-otp so repeatedly hitting
// step A for a victim's email doesn't flood their inbox.
// -------------------------------------------------------------------------
async function sendRecoveryOtp(
    supabaseAdmin: ReturnType<typeof createClient>,
    userId: string,
    email: string,
    otpPepper: string,
    resend: Resend
): Promise<void> {
    const now = new Date();
    const nowMs = now.getTime();

    const { data: challenge } = await supabaseAdmin
        .from("otp_challenges")
        .select("*")
        .eq("user_id", userId)
        .is("consumed_at", null)
        .maybeSingle();

    if (challenge?.locked_until && new Date(challenge.locked_until).getTime() > nowMs) {
        return; // locked — silently skip, uniform response handled by caller
    }

    if (challenge?.last_sent_at) {
        const elapsed = nowMs - new Date(challenge.last_sent_at).getTime();
        if (elapsed < COOLDOWN_MS) return; // cooldown — silently skip
    }

    let windowStart = challenge?.window_start_at ? new Date(challenge.window_start_at) : now;
    let sendCount = challenge?.send_count ?? 0;

    if (nowMs - windowStart.getTime() > WINDOW_MS) {
        windowStart = now;
        sendCount = 0;
    }
    sendCount += 1;

    if (sendCount > MAX_SENDS_PER_WINDOW) {
        const lockedUntil = new Date(nowMs + LOCK_MINUTES * 60 * 1000);
        if (challenge?.id) {
            await supabaseAdmin
                .from("otp_challenges")
                .update({ locked_until: lockedUntil })
                .eq("id", challenge.id);
        }
        return; // rate-limited — silently skip
    }

    const otp = generateOtp();
    const codeHash = await hashOtp(otp, otpPepper);
    const expiresAt = new Date(nowMs + OTP_TTL_MS);

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
                locked_until: null,
                consumed_at: null
            })
            .eq("id", challenge.id);
        if (updErr) {
            console.error(
                JSON.stringify({ event: "recover_account_otp_update_failed", user_id: userId })
            );
            return;
        }
    } else {
        const { error: insErr } = await supabaseAdmin.from("otp_challenges").insert({
            user_id: userId,
            code_hash: codeHash,
            expires_at: expiresAt,
            attempts: 0,
            max_attempts: 5,
            last_sent_at: now,
            send_count: sendCount,
            window_start_at: windowStart
        });
        if (insErr) {
            console.error(
                JSON.stringify({ event: "recover_account_otp_insert_failed", user_id: userId })
            );
            return;
        }
    }

    await supabaseAdmin.from("otp_send_audit").insert({
        auth_user_id: userId,
        jwt_session_id: null,
        latest_known_session_id_for_user: null,
        session_id_rotated: false,
        expected_session_match: null,
        request_ip: null,
        user_agent: null,
        caller_origin: null,
        triggered_by: "recover_account",
        outcome: "sent",
        send_count_in_window: sendCount
    });

    await resend.emails.send({
        from: COMPANY.email.sender,
        reply_to: COMPANY.contact.support,
        to: email,
        subject: "Codice di recupero account",
        html: `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background:#f9fafb;padding:40px">
        <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px">
          <h1 style="margin:0 0 16px;font-size:22px;color:#111827">Recupero account</h1>
          <p style="margin:0 0 24px;font-size:15px;color:#374151">
            Usa questo codice per confermare il recupero del tuo account <strong>CataloGlobe</strong>.
          </p>
          <div style="text-align:center;margin:32px 0">
            <div style="display:inline-block;padding:16px 24px;font-size:28px;letter-spacing:4px;font-weight:700;background:#111827;color:#ffffff;border-radius:10px">
              ${otp}
            </div>
          </div>
          <p style="margin:24px 0 0;font-size:14px;color:#6b7280">
            Il codice scade tra 5 minuti. Se non hai richiesto tu il recupero, ignora questa email.
          </p>
          ${getEmailFooterHtml()}
        </div>
      </div>
    `,
        text: `Codice di recupero account CataloGlobe: ${otp}\n\nUsa questo codice per confermare il recupero del tuo account. Il codice scade tra 5 minuti. Se non hai richiesto tu il recupero, ignora questa email.\n\n${getEmailFooterText()}`
    });
}

// -------------------------------------------------------------------------
// Step A — {email}: always responds 200 {step:"otp_required"} regardless of
// whether the account is recoverable (anti-enumeration). Only sends a real
// email when the account has account_deleted_at set — including accounts
// past the 30-day window but not yet purged, so that the *real* outcome
// (recovered vs. window-expired) is only revealed in step B, after the
// caller has proven email possession via the OTP.
// -------------------------------------------------------------------------
async function handleSendStep(
    supabaseAdmin: ReturnType<typeof createClient>,
    email: string,
    otpPepper: string,
    resend: Resend
) {
    const startedAt = Date.now();

    const resolved = await resolveUserId(supabaseAdmin, email);
    if (resolved) {
        const eligible = await isEligibleForRecoveryOtp(
            supabaseAdmin,
            resolved.userId,
            resolved.bannedUntil
        );
        if (eligible) {
            try {
                await sendRecoveryOtp(supabaseAdmin, resolved.userId, email, otpPepper, resend);
            } catch (e) {
                console.error(
                    JSON.stringify({
                        event: "recover_account_send_otp_error",
                        user_id: resolved.userId
                    })
                );
            }
        }
    }

    await sleepRemaining(startedAt, SEND_STEP_MIN_RESPONSE_MS);
    return json(200, { step: "otp_required" });
}

// -------------------------------------------------------------------------
// Step B — {email, code}: verifies the OTP server-side against
// otp_challenges for the user_id resolved from email. Bad code, expired
// code, locked challenge, and "account not actually recoverable" all
// collapse into the same generic error — none of them tell the caller
// which case occurred. Only after the code verifies do we check the 30-day
// window and reveal recovery_window_expired (legitimate UX, safe because
// reaching this point already proves the caller received the email).
// -------------------------------------------------------------------------
async function handleVerifyStep(
    supabaseAdmin: ReturnType<typeof createClient>,
    email: string,
    code: string,
    otpPepper: string
) {
    const genericFailure = () => json(400, { success: false, error: "invalid_or_expired" });

    const resolved = await resolveUserId(supabaseAdmin, email);
    if (!resolved) return genericFailure();
    const { userId } = resolved;

    const now = new Date();
    const nowMs = now.getTime();

    const { data: challenge } = await supabaseAdmin
        .from("otp_challenges")
        .select("*")
        .eq("user_id", userId)
        .is("consumed_at", null)
        .maybeSingle();

    if (!challenge) return genericFailure();

    if (new Date(challenge.expires_at).getTime() < nowMs) {
        await supabaseAdmin
            .from("otp_challenges")
            .update({ consumed_at: now })
            .eq("id", challenge.id);
        return genericFailure();
    }

    const maxAttempts = challenge.max_attempts ?? 5;

    if (challenge.locked_until && new Date(challenge.locked_until).getTime() > nowMs) {
        return json(429, { success: false, error: "locked" });
    }

    const hash = await hashOtp(code, otpPepper);

    if (hash !== challenge.code_hash) {
        const attempts = (challenge.attempts ?? 0) + 1;
        const locked = attempts >= maxAttempts ? new Date(nowMs + LOCK_MINUTES * 60 * 1000) : null;

        await supabaseAdmin
            .from("otp_challenges")
            .update({ attempts, ...(locked ? { locked_until: locked } : {}) })
            .eq("id", challenge.id);

        return genericFailure();
    }

    // Code correct — consume it (single use) before doing anything else.
    await supabaseAdmin
        .from("otp_challenges")
        .update({ consumed_at: now, attempts: (challenge.attempts ?? 0) + 1 })
        .eq("id", challenge.id);

    // -------------------------------------------------------------------------
    // profiles.account_deleted_at is the authoritative source for the deletion
    // timestamp. It is set by mark_account_deleted() in the delete-account flow
    // and cleared by clear_account_deleted() during recovery.
    // -------------------------------------------------------------------------
    const { data: profile, error: profileError } = await supabaseAdmin
        .from("profiles")
        .select("account_deleted_at")
        .eq("id", userId)
        .single();

    if (profileError) {
        console.error(
            JSON.stringify({
                event: "recover_account_profile_fetch_failed",
                user_id: userId,
                detail: profileError.message
            })
        );
        return json(500, { error: "profile_fetch_failed" });
    }

    if (!profile.account_deleted_at) {
        // Verified OTP but account state changed underneath (e.g. already
        // recovered from another tab). Collapse into the generic failure.
        return genericFailure();
    }

    const deletedAt = new Date(profile.account_deleted_at).getTime();

    if (Date.now() - deletedAt > THIRTY_DAYS_MS) {
        return json(410, { error: "recovery_window_expired" });
    }

    console.log(JSON.stringify({ event: "recover_account_started", user_id: userId }));

    // -------------------------------------------------------------------------
    // Step 4 — Reactivate user
    //
    // Setting ban_duration to "none" clears banned_until and re-enables the
    // account. All sessions remain invalidated — the user must sign in again.
    // -------------------------------------------------------------------------
    const { error: unbanError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
        ban_duration: "none"
    });

    if (unbanError) {
        console.error(
            JSON.stringify({
                event: "recover_account_auth_failed",
                user_id: userId,
                error_message: unbanError.message
            })
        );
        return json(503, { error: "auth_step_failed" });
    }

    // -------------------------------------------------------------------------
    // Step 5 — Clear deletion timestamp
    // -------------------------------------------------------------------------
    const { error: clearError } = await supabaseAdmin.rpc("clear_account_deleted", {
        p_user_id: userId
    });

    if (clearError) {
        console.error(
            JSON.stringify({
                event: "recover_account_clear_failed",
                user_id: userId,
                error_message: clearError.message
            })
        );
        return json(500, { error: "clear_account_deleted_failed" });
    }

    // -------------------------------------------------------------------------
    // Step 5b — Audit: record account recovery. Non-blocking.
    // -------------------------------------------------------------------------
    const { error: auditError } = await supabaseAdmin.from("audit_events").insert({
        event_type: "account_recovered",
        actor_user_id: userId,
        target_user_id: userId,
        payload: {}
    });

    if (auditError) {
        console.error(
            JSON.stringify({
                event: "recover_account_audit_failed",
                user_id: userId,
                detail: auditError.message
            })
        );
    }

    // -------------------------------------------------------------------------
    // Step 6 — Unlock tenants
    // -------------------------------------------------------------------------
    const { data: unlockCount, error: unlockError } = await supabaseAdmin.rpc(
        "unlock_owned_tenants",
        { p_user_id: userId }
    );

    if (unlockError) {
        console.error(
            JSON.stringify({
                event: "recover_account_unlock_failed",
                user_id: userId,
                error_message: unlockError.message
            })
        );
        return json(207, {
            error: "partial_success",
            message: "account restored but tenants still locked"
        });
    }

    // -------------------------------------------------------------------------
    // Step 6b — Reactivate Stripe subscriptions for unlocked tenants
    // -------------------------------------------------------------------------
    let subscriptionsReactivated = 0;
    const stripe = createStripeClient();

    if (stripe) {
        const { data: ownedTenants, error: ownedFetchErr } = await supabaseAdmin
            .from("tenants")
            .select("id, stripe_subscription_id")
            .eq("owner_user_id", userId)
            .is("deleted_at", null)
            .not("stripe_subscription_id", "is", null);

        if (ownedFetchErr) {
            console.error(
                JSON.stringify({
                    event: "recover_account_stripe_fetch_failed",
                    user_id: userId,
                    error: ownedFetchErr.message
                })
            );
        } else {
            for (const t of ownedTenants ?? []) {
                const result = await reactivateStripeSubIfScheduled(
                    stripe,
                    t.stripe_subscription_id,
                    { user_id: userId, tenant_id: t.id, flow: "recover-account" }
                );
                if (result === "reactivated") subscriptionsReactivated++;
            }
        }
    } else {
        console.warn(
            JSON.stringify({ event: "recover_account_stripe_skipped_no_key", user_id: userId })
        );
    }

    console.log(
        JSON.stringify({
            event: "recover_account_success",
            user_id: userId,
            tenants_unlocked: unlockCount,
            subscriptions_reactivated: subscriptionsReactivated
        })
    );

    return json(200, {
        success: true,
        tenants_unlocked: unlockCount ?? 0,
        subscriptions_reactivated: subscriptionsReactivated
    });
}

serve(async (req: Request) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const OTP_PEPPER = Deno.env.get("OTP_PEPPER");
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !OTP_PEPPER || !RESEND_API_KEY) {
        console.error(
            JSON.stringify({ event: "recover_account_error", reason: "server_misconfigured" })
        );
        return json(500, { error: "server_misconfigured" });
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const resend = new Resend(RESEND_API_KEY);

    // -------------------------------------------------------------------------
    // Step 0 — Rate limit (per IP). Applies to both step A and step B calls.
    // -------------------------------------------------------------------------
    try {
        const ipHash = await hashIp(extractClientIp(req));
        await checkRateLimit(supabaseAdmin, {
            key: `recover-account:ip:${ipHash}`,
            limit: RATE_LIMIT_PER_IP_PER_WINDOW,
            windowSeconds: RATE_LIMIT_WINDOW_SECONDS
        });
    } catch (e) {
        if (e instanceof RateLimitExceededError) {
            return json(429, { error: "rate_limited", retry_after_seconds: e.retryAfterSeconds });
        }
        throw e;
    }

    // -------------------------------------------------------------------------
    // Step 1 — Parse and validate request body
    //
    // No JWT is required — the caller has no valid session by definition
    // (that's why they're recovering). Identity is proven via OTP, not auth.
    // -------------------------------------------------------------------------
    let email: string;
    let code: string | null;
    try {
        const body = await req.json();
        email = (body?.email ?? "").trim().toLowerCase();
        const rawCode = typeof body?.code === "string" ? body.code.replace(/\D/g, "") : "";
        code = rawCode.length === 6 ? rawCode : null;
    } catch {
        return json(400, { error: "invalid_json" });
    }

    if (!email || !email.includes("@")) {
        return json(400, { error: "invalid_email" });
    }

    if (code) {
        return await handleVerifyStep(supabaseAdmin, email, code, OTP_PEPPER);
    }
    return await handleSendStep(supabaseAdmin, email, OTP_PEPPER, resend);
});
