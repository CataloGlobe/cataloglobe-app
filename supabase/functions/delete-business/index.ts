// @ts-nocheck
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serializeError, isFKViolation } from "../_shared/errors.ts";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json"
};

function json(status: number, body: Record<string, unknown>) {
    return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

serve(async req => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

    try {
        const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
        const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
        const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

        if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
            return json(500, { error: "server_misconfigured" });
        }

        // Step 1: validate Authorization header
        const authHeader = req.headers.get("Authorization");
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            console.error("delete-business: Missing or malformed Authorization header");
            return json(401, { error: "unauthorized" });
        }

        // Step 2: parse body — expects { businessId: string } (activityId)
        let payload: { businessId?: string } | null = null;
        try {
            payload = await req.json();
        } catch {
            return json(400, { error: "invalid_json" });
        }

        const businessId = payload?.businessId?.trim();
        if (!businessId) return json(400, { error: "missing_business_id" });

        // Step 3: resolve the calling user from the JWT
        const supabaseUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
            global: { headers: { Authorization: authHeader } }
        });

        const { data: authData, error: authError } = await supabaseUser.auth.getUser();
        const userId = authData?.user?.id;

        if (authError || !userId) {
            console.error(
                `delete-business: Token validation failed: ${authError?.message || "No user ID"}`
            );
            return json(401, { error: "unauthorized" });
        }

        console.log(`delete-business: Authenticated request for user ${userId}, activity ${businessId}`);

        // Step 4: look up the activity via service_role (bypasses RLS)
        const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

        const { data: activity, error: activityError } = await supabaseAdmin
            .from("activities")
            .select("id, tenant_id, slug")
            .eq("id", businessId)
            .maybeSingle();

        if (activityError) {
            console.error("delete-business: Activity lookup failed:", activityError);
            return json(500, { error: "ownership_check_failed" });
        }

        if (!activity) {
            console.warn(`delete-business: Activity ${businessId} not found`);
            return json(404, { error: "not_found" });
        }

        // Step 5: verify the caller has an active owner or admin membership.
        //
        // We fetch role+status without pre-filtering so we can return a
        // precise error code for each failure mode instead of a generic 403.
        const { data: membership, error: membershipError } = await supabaseAdmin
            .from("tenant_memberships")
            .select("role, status")
            .eq("tenant_id", activity.tenant_id)
            .eq("user_id", userId)
            .maybeSingle();

        if (membershipError) {
            console.error("delete-business: Membership lookup failed:", membershipError);
            return json(500, { error: "ownership_check_failed" });
        }

        if (!membership) {
            console.warn(`delete-business: User ${userId} has no membership in tenant ${activity.tenant_id}`);
            return json(403, {
                error: "forbidden",
                code: "NOT_MEMBER",
                message: "Non appartieni a questa organizzazione"
            });
        }

        if (membership.status !== "active") {
            console.warn(`delete-business: User ${userId} membership status is "${membership.status}"`);
            return json(403, {
                error: "forbidden",
                code: "INACTIVE_MEMBERSHIP",
                message: "Il tuo accesso a questa organizzazione non è attivo"
            });
        }

        if (!["owner", "admin"].includes(membership.role)) {
            console.warn(`delete-business: User ${userId} has role "${membership.role}" — insufficient`);
            return json(403, {
                error: "forbidden",
                code: "INSUFFICIENT_ROLE",
                message: "Non hai i permessi per eliminare questa sede"
            });
        }

        console.log(`delete-business: User ${userId} authorized as ${membership.role} for tenant ${activity.tenant_id}`);

        // Step 6: delete the activity row (service_role, bypasses RLS).
        // Done BEFORE storage cleanup: if DELETE fails (e.g. unhandled FK),
        // storage stays intact and the activity row remains usable.
        const { error: deleteError } = await supabaseAdmin
            .from("activities")
            .delete()
            .eq("id", businessId);

        if (deleteError) {
            if (isFKViolation(deleteError)) {
                const info = serializeError(deleteError);
                console.error("delete-business: FK violation:", info);
                return json(409, {
                    error: "FK_VIOLATION",
                    code: "FK_VIOLATION",
                    message:
                        "Eliminazione bloccata da dati collegati alla sede. Contatta il supporto se il problema persiste.",
                    detail: info
                });
            }
            console.error("delete-business: Delete failed:", deleteError);
            throw deleteError;
        }

        // Step 6.5: cleanup orphan schedule_targets pointing to the deleted
        // activity. schedule_targets has no FK to activities (polymorphic
        // target_id), so dead rows survive activity deletion. Remove them,
        // then disable any schedule that ends up with zero targets and
        // apply_to_all=false (matches the "draft" definition in CLAUDE.md:
        // a rule without targets cannot apply).
        //
        // Errors here are logged but NOT propagated as 500: the activity is
        // already deleted, leftover orphans are UX degradation, not a blocker.
        let affectedSchedulesDisabled = 0;
        try {
            const { data: deletedTargets, error: targetsError } = await supabaseAdmin
                .from("schedule_targets")
                .delete()
                .eq("target_type", "activity")
                .eq("target_id", businessId)
                .select("schedule_id");

            if (targetsError) {
                console.warn(
                    "delete-business: schedule_targets cleanup failed:",
                    serializeError(targetsError)
                );
            } else if (deletedTargets && deletedTargets.length > 0) {
                const affectedScheduleIds = Array.from(
                    new Set(deletedTargets.map(r => r.schedule_id))
                );

                // Sequential loop: typically 1-3 schedules per activity.
                // Race window with concurrent activity deletions is theoretical
                // and accepted (read-committed semantics; each UPDATE sees the
                // prior DELETE committed within this transaction).
                for (const sid of affectedScheduleIds) {
                    const { count, error: countError } = await supabaseAdmin
                        .from("schedule_targets")
                        .select("*", { count: "exact", head: true })
                        .eq("schedule_id", sid);

                    if (countError) {
                        console.warn(
                            "delete-business: target count failed for schedule",
                            sid,
                            serializeError(countError)
                        );
                        continue;
                    }

                    if ((count ?? 0) === 0) {
                        const { error: updateError } = await supabaseAdmin
                            .from("schedules")
                            .update({ enabled: false })
                            .eq("id", sid)
                            .eq("apply_to_all", false);

                        if (updateError) {
                            console.warn(
                                "delete-business: schedule disable failed for",
                                sid,
                                serializeError(updateError)
                            );
                        } else {
                            affectedSchedulesDisabled++;
                        }
                    }
                }
            }
        } catch (cleanupErr) {
            console.warn(
                "delete-business: orphan cleanup unhandled error:",
                serializeError(cleanupErr)
            );
        }

        // Step 7: clean up storage files for this activity (best-effort).
        // Runs AFTER successful DELETE: if cleanup fails the activity is
        // already gone, so we surface success to the caller and only log.
        const safeSlug = (activity.slug || "activity")
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "")
            .slice(0, 60) || "activity";
        const folder = `${activity.tenant_id}/${safeSlug}__${activity.id}`;
        const storage = supabaseAdmin.storage.from("business-covers");

        try {
            const { data: files } = await storage.list(folder, { limit: 1000 });
            if (files && files.length > 0) {
                const paths = files.filter(f => f.id !== null).map(f => `${folder}/${f.name}`);
                if (paths.length > 0) {
                    const { error: removeErr } = await storage.remove(paths);
                    if (removeErr) {
                        console.warn("delete-business: Storage cleanup error:", removeErr.message);
                    }
                }
            }
        } catch (storageErr) {
            console.warn(
                "delete-business: Storage cleanup threw:",
                serializeError(storageErr)
            );
        }

        console.log(`delete-business: Activity ${businessId} deleted by user ${userId} (role: ${membership.role}); orphan schedules disabled: ${affectedSchedulesDisabled}`);

        return json(200, {
            success: true,
            affected_schedules_disabled: affectedSchedulesDisabled
        });
    } catch (err) {
        const info = serializeError(err);
        console.error("delete-business: Unhandled error:", info);
        return json(500, {
            error: "delete_failed",
            message: info.message,
            code: info.code,
            detail: info.details
        });
    }
});
