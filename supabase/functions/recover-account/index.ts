// @ts-nocheck
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json"
};

function json(status: number, body: Record<string, unknown>) {
    return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

serve(async (req: Request) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
        console.error(
            JSON.stringify({ event: "recover_account_error", reason: "server_misconfigured" })
        );
        return json(500, { error: "server_misconfigured" });
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // -------------------------------------------------------------------------
    // Step 1 — Parse and validate request body
    //
    // Banned users have no valid session, so recovery is email-based.
    // No JWT is required — supabaseAdmin looks up the user directly.
    // -------------------------------------------------------------------------
    let email: string;
    try {
        const body = await req.json();
        email = (body?.email ?? "").trim().toLowerCase();
    } catch {
        return json(400, { error: "invalid_json" });
    }

    if (!email || !email.includes("@")) {
        return json(400, { error: "invalid_email" });
    }

    // -------------------------------------------------------------------------
    // Step 2 — Resolve user_id from email
    //
    // Supabase admin listUsers does not support email filtering directly,
    // so we paginate until we find a matching record.
    // -------------------------------------------------------------------------
    let userId: string | null = null;
    let page = 1;
    const perPage = 1000;

    while (true) {
        const { data: listData, error: listError } = await supabaseAdmin.auth.admin.listUsers({
            page,
            perPage
        });

        if (listError) {
            console.error(
                JSON.stringify({
                    event: "recover_account_list_failed",
                    detail: listError.message
                })
            );
            return json(500, { error: "user_lookup_failed" });
        }

        const match = listData.users.find(
            u => (u.email ?? "").toLowerCase() === email
        );

        if (match) {
            userId = match.id;

            // -------------------------------------------------------------------------
            // Safety check: account_deleted_at and banned_until must be consistent.
            //
            // If the delete-account ban step previously failed after mark_account_deleted
            // succeeded (and the compensating clear also failed), the user has
            // account_deleted_at set but is not banned. Re-apply the ban so the two
            // states are in sync before the recovery window check runs.
            // -------------------------------------------------------------------------
            const isBanned =
                match.banned_until != null &&
                new Date(match.banned_until).getTime() > Date.now();

            if (!isBanned) {
                const { error: rebanError } = await supabaseAdmin.auth.admin.updateUserById(
                    match.id,
                    { ban_duration: "876000h" }
                );
                if (rebanError) {
                    console.error(
                        JSON.stringify({
                            event: "recover_account_reban_failed",
                            user_id: match.id,
                            error_message: rebanError.message
                        })
                    );
                    // Non-fatal: proceed. The profile check will enforce the window.
                } else {
                    console.log(
                        JSON.stringify({
                            event: "recover_account_reban_applied",
                            user_id: match.id
                        })
                    );
                }
            }

            break;
        }

        if (listData.users.length < perPage) break;
        page++;
    }

    if (!userId) {
        return json(404, { error: "user_not_found" });
    }

    // -------------------------------------------------------------------------
    // Step 3 — Check account state
    //
    // profiles.account_deleted_at is the authoritative source for the deletion
    // timestamp. It is set by mark_account_deleted() in the delete-account flow
    // and cleared by clear_account_deleted() during recovery.
    // profiles.id is the FK referencing auth.users(id).
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
        return json(400, { error: "account_not_deleted" });
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
    //
    // Clears account_deleted_at so the account no longer appears as pending
    // deletion. Must succeed before unlock: if it fails, the state is dirty
    // (user is unbanned but timestamp remains) and the caller must retry.
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
    // Step 5b — Audit: record account recovery
    //
    // Inserted after clear_account_deleted succeeds and before unlock so the
    // auth.users FK reference is valid (user is unbanned and still exists).
    // Non-blocking: a failure here does not abort the recovery flow.
    // -------------------------------------------------------------------------
    const { error: auditError } = await supabaseAdmin
        .from("v2_audit_events")
        .insert({
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
        // Non-blocking: continue.
    }

    // -------------------------------------------------------------------------
    // Step 6 — Unlock tenants
    //
    // Called with service_role because auth.uid() = NULL in this context —
    // the Edge Function has no user session. unlock_owned_tenants() accepts
    // p_user_id explicitly and validates it internally.
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
        // Partial success: account is restored but tenants remain locked.
        return json(207, {
            error: "partial_success",
            message: "account restored but tenants still locked"
        });
    }

    // -------------------------------------------------------------------------
    // Step 7 — Success
    // -------------------------------------------------------------------------
    console.log(
        JSON.stringify({
            event: "recover_account_success",
            user_id: userId,
            tenants_unlocked: unlockCount
        })
    );

    return json(200, {
        success: true,
        tenants_unlocked: unlockCount ?? 0
    });
});
