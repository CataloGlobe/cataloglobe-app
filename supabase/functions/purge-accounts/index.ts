// @ts-nocheck
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@17?target=deno";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PURGE_BATCH_SIZE = 50;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_EXECUTION_MS = 20_000; // 20 seconds safe window

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type StepResult =
    | "ok"
    | "already_deleted"
    | "unexpectedly_active"
    | "missing_profile"
    | "skipped"
    | "error";

interface UserSteps {
    recheck: StepResult;
    auth_check: StepResult;
    rpc: StepResult;
    rpc_detail?: {
        invited_by_cleared: number;
        otp_rows_deleted: number;
        membership_rows_deleted: number;
    };
    auth_delete: StepResult;
    profile_delete: StepResult;
}

type UserStatus = "success" | "partial" | "skipped" | "error";

interface UserResult {
    user_id: string;
    status: UserStatus;
    reason?: string;
    dry_run: boolean;
    steps: UserSteps;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function json(status: number, body: Record<string, unknown>): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" }
    });
}

function isAuthNotFoundError(error: unknown): boolean {
    if (!error || typeof error !== "object") return false;

    const maybeError = error as { status?: number; code?: string; message?: string };

    if (maybeError.status === 404) return true;
    if (maybeError.code === "user_not_found") return true;

    const message = typeof maybeError.message === "string" ? maybeError.message.toLowerCase() : "";
    return message.includes("not found") || message.includes("user not found");
}

function emptySteps(): UserSteps {
    return {
        recheck: "skipped",
        auth_check: "skipped",
        rpc: "skipped",
        auth_delete: "skipped",
        profile_delete: "skipped"
    };
}

// ---------------------------------------------------------------------------
// Edge Function
// ---------------------------------------------------------------------------

serve(async (req: Request) => {
    if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

    // -------------------------------------------------------------------------
    // Setup: env + auth
    // -------------------------------------------------------------------------
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const PURGE_SECRET = Deno.env.get("PURGE_SECRET");

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !PURGE_SECRET) {
        console.error(JSON.stringify({ event: "purge_misconfigured" }));
        return json(500, { error: "server_misconfigured" });
    }

    const incomingSecret = req.headers.get("x-purge-secret");
    if (!incomingSecret || incomingSecret !== PURGE_SECRET) {
        console.error(JSON.stringify({ event: "purge_unauthorized" }));
        return json(401, { error: "unauthorized" });
    }

    // -------------------------------------------------------------------------
    // Parse request body
    // -------------------------------------------------------------------------
    const body = await req.json().catch(() => ({}));
    const dryRun: boolean = body.dry_run === true;

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false }
    });

    const cutoffIso = new Date(Date.now() - THIRTY_DAYS_MS).toISOString();

    const startedAt = Date.now();

    console.log(JSON.stringify({ event: "purge_run_started", dry_run: dryRun, cutoff: cutoffIso }));

    // -------------------------------------------------------------------------
    // Step 0: Safety net — cancel Stripe subs for locked tenants about to be purged
    //
    // The delete-account flow should have already cancelled these, but if that
    // step failed (e.g. Stripe was down), this ensures subscriptions are not
    // left active after the tenant data is hard-deleted.
    // Non-blocking: failures are logged but do not prevent the purge.
    // -------------------------------------------------------------------------
    const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");
    let stripeCleanupCount = 0;

    if (!dryRun && STRIPE_SECRET_KEY) {
        try {
            const { data: lockedWithStripe } = await supabase
                .from("tenants")
                .select("id, stripe_subscription_id")
                .not("locked_at", "is", null)
                .lt("locked_at", cutoffIso)
                .not("stripe_subscription_id", "is", null);

            if (lockedWithStripe?.length) {
                const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2025-04-30.basil" });
                for (const t of lockedWithStripe) {
                    try {
                        await stripe.subscriptions.cancel(t.stripe_subscription_id);
                        stripeCleanupCount++;
                        console.log(
                            JSON.stringify({
                                event: "purge_stripe_canceled",
                                tenant_id: t.id,
                                subscription_id: t.stripe_subscription_id
                            })
                        );
                    } catch (stripeErr) {
                        console.error(
                            JSON.stringify({
                                event: "purge_stripe_cancel_failed",
                                tenant_id: t.id,
                                subscription_id: t.stripe_subscription_id,
                                error: stripeErr instanceof Error ? stripeErr.message : String(stripeErr)
                            })
                        );
                    }
                }
            }
        } catch (fetchErr) {
            console.error(
                JSON.stringify({
                    event: "purge_stripe_prefetch_failed",
                    error: fetchErr instanceof Error ? fetchErr.message : String(fetchErr)
                })
            );
        }
    }

    console.log(
        JSON.stringify({
            event: "purge_stripe_cleanup_completed",
            stripe_subs_canceled: stripeCleanupCount,
            dry_run: dryRun
        })
    );

    // -------------------------------------------------------------------------
    // Step 1: Purge locked tenants (SQL RPC — runs before user loop)
    // -------------------------------------------------------------------------
    let tenantsPurged = 0;

    if (!dryRun) {
        const { data: tenantData, error: tenantsError } = await supabase.rpc(
            "purge_locked_expired_tenants"
        );

        if (tenantsError) {
            console.error(
                JSON.stringify({ event: "purge_tenants_failed", error: tenantsError.message })
            );
            return json(500, { error: "purge_tenants_failed", detail: tenantsError.message });
        }

        tenantsPurged = tenantData ?? 0;
    }

    console.log(
        JSON.stringify({
            event: "purge_tenants_completed",
            tenants_purged: tenantsPurged,
            dry_run: dryRun
        })
    );

    // -------------------------------------------------------------------------
    // Step 2: Fetch purge candidates
    //
    // profiles.id is the PK and FK to auth.users.id — NOT profiles.user_id.
    // Ordered oldest-first, capped at PURGE_BATCH_SIZE.
    // -------------------------------------------------------------------------
    const { data: candidates, error: candidatesError } = await supabase
        .from("profiles")
        .select("id, account_deleted_at")
        .not("account_deleted_at", "is", null)
        .lt("account_deleted_at", cutoffIso)
        .order("account_deleted_at", { ascending: true })
        .limit(PURGE_BATCH_SIZE);

    if (candidatesError) {
        console.error(
            JSON.stringify({
                event: "purge_candidates_fetch_failed",
                error: candidatesError.message
            })
        );
        return json(500, { error: "candidates_fetch_failed", detail: candidatesError.message });
    }

    const userIds: string[] = (candidates ?? []).map((p: { id: string }) => p.id);

    console.log(
        JSON.stringify({
            event: "purge_candidates_selected",
            count: userIds.length,
            dry_run: dryRun
        })
    );

    // -------------------------------------------------------------------------
    // Step 3: Process each candidate sequentially
    // -------------------------------------------------------------------------
    let succeeded = 0;
    let partial = 0;
    let skipped = 0;
    let errored = 0;

    for (const userId of userIds) {
        if (Date.now() - startedAt > MAX_EXECUTION_MS) {
            console.warn("[purge] execution time limit reached, stopping early");
            break;
        }

        const result = await processUser(userId, supabase, cutoffIso, dryRun);
        console.log(JSON.stringify({ event: "purge_user_result", ...result }));

        switch (result.status) {
            case "success":
                succeeded++;
                break;
            case "partial":
                partial++;
                break;
            case "skipped":
                skipped++;
                break;
            case "error":
                errored++;
                break;
        }
    }

    // -------------------------------------------------------------------------
    // Step 4: Final summary
    // -------------------------------------------------------------------------
    const summary = {
        success: true,
        dry_run: dryRun,
        tenants_purged: tenantsPurged,
        users_processed: userIds.length,
        users_succeeded: succeeded,
        users_partial: partial,
        users_skipped: skipped,
        users_errored: errored,
        batch_size: PURGE_BATCH_SIZE,
        timestamp: new Date().toISOString()
    };

    console.log(JSON.stringify({ event: "purge_run_completed", ...summary }));

    return json(200, summary);
});

// ---------------------------------------------------------------------------
// processUser: full per-user orchestration
// ---------------------------------------------------------------------------

async function processUser(
    userId: string,
    // deno-lint-ignore no-explicit-any
    supabase: any,
    cutoffIso: string,
    dryRun: boolean
): Promise<UserResult> {
    const steps = emptySteps();

    // -----------------------------------------------------------------------
    // Step A: Re-check eligibility in DB
    // -----------------------------------------------------------------------
    const { data: profile, error: recheckError } = await supabase
        .from("profiles")
        .select("id, account_deleted_at")
        .eq("id", userId)
        .maybeSingle();

    if (recheckError) {
        steps.recheck = "error";
        return {
            user_id: userId,
            status: "error",
            reason: `recheck_failed: ${recheckError.message}`,
            dry_run: dryRun,
            steps
        };
    }

    if (!profile) {
        // Profile row is already gone. Still attempt auth + profile cleanup passes.
        steps.recheck = "missing_profile";
    } else if (!profile.account_deleted_at) {
        // account was recovered between batch query and now
        steps.recheck = "skipped";
        return { user_id: userId, status: "skipped", reason: "recovered", dry_run: dryRun, steps };
    } else if (profile.account_deleted_at >= cutoffIso) {
        // window not yet expired (clock drift or race)
        steps.recheck = "skipped";
        return {
            user_id: userId,
            status: "skipped",
            reason: "window_not_expired",
            dry_run: dryRun,
            steps
        };
    } else {
        steps.recheck = "ok";
    }

    // -----------------------------------------------------------------------
    // Step B: Auth check via getUserById
    // -----------------------------------------------------------------------
    let authAlreadyDeleted = false;

    const { data: authData, error: authLookupError } =
        await supabase.auth.admin.getUserById(userId);

    if (authLookupError) {
        if (isAuthNotFoundError(authLookupError)) {
            // already deleted from auth — proceed to profile delete only
            authAlreadyDeleted = true;
            steps.auth_check = "already_deleted";
        } else {
            steps.auth_check = "error";
            return {
                user_id: userId,
                status: "error",
                reason: `auth_lookup_failed: ${authLookupError.message ?? "unknown"}`,
                dry_run: dryRun,
                steps
            };
        }
    } else {
        const bannedUntil: string | null = authData?.user?.banned_until ?? null;
        const isBanned = bannedUntil !== null && new Date(bannedUntil) > new Date();

        if (!isBanned) {
            // User is active — account was recovered but account_deleted_at not cleared.
            // This is a data inconsistency. Do NOT purge.
            steps.auth_check = "unexpectedly_active";
            return {
                user_id: userId,
                status: "skipped",
                reason: "unexpectedly_active",
                dry_run: dryRun,
                steps
            };
        }

        steps.auth_check = "ok";
    }

    // -----------------------------------------------------------------------
    // Step C: Call purge_user_data RPC
    // Skip if auth was already deleted (RPC was likely already run) or dry-run.
    // -----------------------------------------------------------------------
    if (dryRun) {
        steps.rpc = "skipped";
    } else if (authAlreadyDeleted) {
        // RPC may have already run on a previous attempt. Skip to avoid double-work.
        // It is idempotent, but we skip for cleaner logs.
        steps.rpc = "skipped";
    } else {
        const { data: rpcData, error: rpcError } = await supabase.rpc("purge_user_data", {
            p_user_id: userId
        });

        if (rpcError) {
            steps.rpc = "error";
            return {
                user_id: userId,
                status: "error",
                reason: `rpc_failed: ${rpcError.message}`,
                dry_run: dryRun,
                steps
            };
        }

        steps.rpc = "ok";
        if (rpcData) {
            steps.rpc_detail = {
                invited_by_cleared: rpcData.invited_by_cleared ?? 0,
                otp_rows_deleted: rpcData.otp_rows_deleted ?? 0,
                membership_rows_deleted: rpcData.membership_rows_deleted ?? 0
            };
        }
    }

    // -----------------------------------------------------------------------
    // Step C2: Audit account_purged
    //
    // Inserted BEFORE auth.admin.deleteUser() so the FK reference on
    // target_user_id (→ auth.users) is still valid. After auth deletion,
    // ON DELETE SET NULL will null target_user_id on this row — the
    // event_type and created_at are preserved.
    // Non-blocking: a failure here does not abort the purge flow.
    // -----------------------------------------------------------------------
    if (!dryRun && !authAlreadyDeleted) {
        const { error: auditError } = await supabase
            .from("v2_audit_events")
            .insert({
                event_type: "account_purged",
                target_user_id: userId,
                payload: {}
            });

        if (auditError) {
            console.error(
                JSON.stringify({
                    event: "purge_audit_insert_failed",
                    user_id: userId,
                    detail: auditError.message
                })
            );
            // Non-blocking: continue.
        }
    }

    // -----------------------------------------------------------------------
    // Step C3: Clean up avatars storage
    // Path convention: avatars/{userId}/avatar.jpg (or other ext)
    // Non-blocking: failure is logged but does not abort the purge flow.
    // Must run BEFORE auth.admin.deleteUser so the user folder is still
    // identifiable (though userId is known regardless).
    // -----------------------------------------------------------------------
    if (!dryRun && !authAlreadyDeleted) {
        try {
            const { data: avatarFiles, error: avatarListErr } = await supabase.storage
                .from("avatars")
                .list(userId, { limit: 100 });

            if (avatarListErr) {
                console.warn(
                    JSON.stringify({
                        event: "purge_avatar_list_failed",
                        user_id: userId,
                        detail: avatarListErr.message
                    })
                );
            } else if (avatarFiles && avatarFiles.length > 0) {
                const paths = avatarFiles
                    .filter((f: { id: string | null }) => f.id !== null)
                    .map((f: { name: string }) => `${userId}/${f.name}`);

                if (paths.length > 0) {
                    const { error: avatarRemoveErr } = await supabase.storage
                        .from("avatars")
                        .remove(paths);

                    if (avatarRemoveErr) {
                        console.warn(
                            JSON.stringify({
                                event: "purge_avatar_remove_failed",
                                user_id: userId,
                                detail: avatarRemoveErr.message
                            })
                        );
                    } else {
                        console.log(
                            JSON.stringify({
                                event: "purge_avatar_removed",
                                user_id: userId,
                                files_removed: paths.length
                            })
                        );
                    }
                }
            }
        } catch (avatarErr) {
            console.warn(
                JSON.stringify({
                    event: "purge_avatar_error",
                    user_id: userId,
                    detail: avatarErr instanceof Error ? avatarErr.message : String(avatarErr)
                })
            );
        }
    }

    // -----------------------------------------------------------------------
    // Step D: Delete auth user
    // -----------------------------------------------------------------------
    if (dryRun) {
        steps.auth_delete = "skipped";
    } else if (authAlreadyDeleted) {
        steps.auth_delete = "already_deleted";
    } else {
        const { error: deleteError } = await supabase.auth.admin.deleteUser(userId);

        if (deleteError) {
            if (isAuthNotFoundError(deleteError)) {
                // Deleted between Step B and now — treat as success
                steps.auth_delete = "already_deleted";
            } else {
                steps.auth_delete = "error";
                // Do NOT delete profile if auth deletion failed
                return {
                    user_id: userId,
                    status: "error",
                    reason: `auth_delete_failed: ${deleteError.message ?? "unknown"}`,
                    dry_run: dryRun,
                    steps
                };
            }
        } else {
            steps.auth_delete = "ok";
        }
    }

    // -----------------------------------------------------------------------
    // Step E: Delete profile row
    // Only reached after auth deletion confirmed (or auth was already gone).
    // -----------------------------------------------------------------------
    if (dryRun) {
        steps.profile_delete = "skipped";
        return { user_id: userId, status: "success", dry_run: dryRun, steps };
    }

    const { error: profileDeleteError, count } = await supabase
        .from("profiles")
        .delete({ count: "exact" })
        .eq("id", userId);

    if (profileDeleteError) {
        // Auth is deleted — this is recoverable on next run but is not blocking.
        steps.profile_delete = "error";
        return {
            user_id: userId,
            status: "partial",
            reason: `profile_delete_failed: ${profileDeleteError.message}`,
            dry_run: dryRun,
            steps
        };
    }

    steps.profile_delete = count === 0 ? "missing" : "ok";

    return { user_id: userId, status: "success", dry_run: dryRun, steps };
}
