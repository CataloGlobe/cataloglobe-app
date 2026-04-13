// @ts-nocheck
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@17?target=deno";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json"
};

function json(status: number, body: Record<string, unknown>) {
    return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

interface TenantAction {
    tenant_id: string;
    action: "transfer" | "lock";
    new_owner_user_id?: string;
}

interface RequestPayload {
    actions: TenantAction[];
}

serve(async (req: Request) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
        console.error(
            JSON.stringify({ event: "delete_account_error", reason: "server_misconfigured" })
        );
        return json(500, { error: "server_misconfigured" });
    }

    // -------------------------------------------------------------------------
    // Step 1 — Auth: verify caller identity from JWT
    // -------------------------------------------------------------------------
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return json(401, { error: "unauthorized" });
    }

    // supabaseUser uses the caller's JWT — RPC will run as auth.uid() = userId
    const supabaseUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: authHeader } }
    });

    const { data: authData, error: authError } = await supabaseUser.auth.getUser();
    const userId = authData?.user?.id;

    if (authError || !userId) {
        console.error(
            JSON.stringify({
                event: "delete_account_error",
                reason: "token_validation_failed",
                detail: authError?.message ?? "no user id"
            })
        );
        return json(401, { error: "unauthorized" });
    }

    // -------------------------------------------------------------------------
    // Parse and validate request body
    // -------------------------------------------------------------------------
    let payload: RequestPayload;
    try {
        payload = await req.json();
    } catch {
        return json(400, { error: "invalid_json" });
    }

    if (!Array.isArray(payload?.actions)) {
        return json(400, {
            error: "invalid_payload",
            message: "actions must be an array"
        });
    }

    // supabaseAdmin: service_role client — needed for mark_account_deleted and ban
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    console.log(
        JSON.stringify({
            event: "delete_account_started",
            user_id: userId,
            action_count: payload.actions.length
        })
    );

    // -------------------------------------------------------------------------
    // Step 1b — Pre-fetch Stripe subscription IDs for affected tenants
    //
    // Must happen BEFORE the RPC: transfer_ownership() resets Stripe fields
    // on transferred tenants, so the subscription_id would be lost after.
    // -------------------------------------------------------------------------
    const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");
    let stripeSubsToCancel: { tenant_id: string; stripe_subscription_id: string }[] = [];

    if (STRIPE_SECRET_KEY && payload.actions.length > 0) {
        const tenantIds = payload.actions.map((a: TenantAction) => a.tenant_id);
        try {
            const { data: tenantsStripe } = await supabaseAdmin
                .from("tenants")
                .select("id, stripe_subscription_id")
                .in("id", tenantIds)
                .not("stripe_subscription_id", "is", null);

            stripeSubsToCancel = (tenantsStripe ?? []).map((t: { id: string; stripe_subscription_id: string }) => ({
                tenant_id: t.id,
                stripe_subscription_id: t.stripe_subscription_id
            }));
        } catch (prefetchErr) {
            console.error(
                JSON.stringify({
                    event: "delete_account_stripe_prefetch_failed",
                    user_id: userId,
                    error: prefetchErr instanceof Error ? prefetchErr.message : String(prefetchErr)
                })
            );
            // Non-blocking: proceed without Stripe cancellation
        }
    }

    // -------------------------------------------------------------------------
    // Step 2 — RPC SQL: execute tenant operations atomically
    //
    // Called with the user's JWT so that auth.uid() resolves correctly inside
    // execute_account_deletion_tenant_ops(). transfer_ownership() in turn
    // relies on auth.uid() for its own ownership guards.
    // The RPC is idempotent: if active tenants are already handled it returns
    // immediately, enabling safe retry after a downstream failure.
    // -------------------------------------------------------------------------
    const { error: rpcError } = await supabaseUser.rpc("execute_account_deletion_tenant_ops", {
        p_actions: payload.actions
    });

    if (rpcError) {
        // RPC error messages embed a leading error code token (e.g. "not_authenticated: ...")
        const errorCode = rpcError.code || rpcError.message?.split(":")[0]?.trim() || "rpc_error";

        console.error(
            JSON.stringify({
                event: "delete_account_sql_failed",
                user_id: userId,
                error_code: rpcError.code,
                error_message: rpcError.message
            })
        );

        return json(400, {
            error: errorCode,
            message: rpcError.message
        });
    }

    console.log(JSON.stringify({ event: "delete_account_sql_success", user_id: userId }));

    // -------------------------------------------------------------------------
    // Step 2a — Cancel Stripe subscriptions (non-blocking)
    //
    // Cancels subscriptions for both locked and transferred tenants.
    // For transferred tenants, the RPC already reset the DB Stripe fields;
    // this call ensures the subscription is also cancelled in Stripe itself.
    // Failures are logged but do NOT block account deletion.
    // -------------------------------------------------------------------------
    if (stripeSubsToCancel.length > 0 && STRIPE_SECRET_KEY) {
        const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2025-04-30.basil" });
        for (const sub of stripeSubsToCancel) {
            try {
                await stripe.subscriptions.cancel(sub.stripe_subscription_id);
                console.log(
                    JSON.stringify({
                        event: "delete_account_stripe_canceled",
                        user_id: userId,
                        tenant_id: sub.tenant_id,
                        subscription_id: sub.stripe_subscription_id
                    })
                );
            } catch (stripeErr) {
                console.error(
                    JSON.stringify({
                        event: "delete_account_stripe_cancel_failed",
                        user_id: userId,
                        tenant_id: sub.tenant_id,
                        subscription_id: sub.stripe_subscription_id,
                        error: stripeErr instanceof Error ? stripeErr.message : String(stripeErr)
                    })
                );
                // Non-blocking: continue with account deletion
            }
        }
    }

    // -------------------------------------------------------------------------
    // Step 2b — Mark deletion timestamp
    //
    // Writes account_deleted_at = now() to profiles. This is the authoritative
    // source of truth for the 30-day recovery window and for purge-accounts.
    // Must succeed before the ban: if the ban call later fails, the timestamp
    // is already set and the recovery/purge flows function correctly.
    // -------------------------------------------------------------------------
    const { error: markError } = await supabaseAdmin.rpc("mark_account_deleted", {
        p_user_id: userId
    });

    if (markError) {
        console.error(
            JSON.stringify({
                event: "delete_account_mark_failed",
                user_id: userId,
                error_message: markError.message
            })
        );
        return json(500, {
            error: "mark_account_deleted_failed"
        });
    }

    console.log(JSON.stringify({ event: "delete_account_marked", user_id: userId }));

    // -------------------------------------------------------------------------
    // Step 3 — Admin API: ban user
    //
    // ban_duration '876000h' ≈ 100 years — effectively permanent.
    // This both disables the account and invalidates all active sessions
    // without hard-deleting the auth.users row (preserving the 30-day
    // recovery window handled by the purge-accounts cron).
    // -------------------------------------------------------------------------

    const { error: banError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
        ban_duration: "876000h"
    });

    if (banError) {
        console.error(
            JSON.stringify({
                event: "delete_account_sql_done_auth_failed",
                user_id: userId,
                error_message: banError.message
            })
        );

        // Compensate: clear account_deleted_at so the two states stay in sync.
        // If this also fails we log and continue — returning 503 either way.
        const { error: compensateError } = await supabaseAdmin.rpc("clear_account_deleted", {
            p_user_id: userId
        });
        if (compensateError) {
            console.error(
                JSON.stringify({
                    event: "delete_account_compensate_failed",
                    user_id: userId,
                    error_message: compensateError.message
                })
            );
        }

        return json(503, { error: "auth_step_failed" });
    }

    console.log(JSON.stringify({ event: "delete_account_success", user_id: userId }));

    return json(200, { success: true });
});
