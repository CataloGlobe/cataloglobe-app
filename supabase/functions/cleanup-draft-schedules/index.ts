// @ts-nocheck
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ---------------------------------------------------------------------------
// cleanup-draft-schedules
//
// Scheduled edge function that permanently deletes abandoned draft schedules
// older than 7 days. A schedule is considered an abandoned draft when:
//   - enabled = false
//   - created_at < now() - 7 days
//   - AND it is incomplete (missing required data for its type)
//
// Security:
//   - verify_jwt = false (called by pg_cron, not by users)
//   - Validates PURGE_SECRET header (x-purge-secret) against env var
//   - Uses SERVICE_ROLE_KEY (bypasses RLS)
//
// Related tables (schedule_targets, schedule_layout, schedule_price_overrides,
// schedule_visibility_overrides, schedule_featured_contents) all have
// ON DELETE CASCADE from schedules — deleting the schedule row auto-cleans them.
// ---------------------------------------------------------------------------

const RETENTION_DAYS = 7;

function json(status: number, body: Record<string, unknown>) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" }
    });
}

serve(async req => {
    if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const PURGE_SECRET = Deno.env.get("PURGE_SECRET");

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
        console.error("cleanup-draft-schedules: Missing required env vars");
        return json(500, { error: "server_misconfigured" });
    }

    if (PURGE_SECRET) {
        const incomingSecret = req.headers.get("x-purge-secret");
        if (!incomingSecret || incomingSecret !== PURGE_SECRET) {
            console.error("cleanup-draft-schedules: Invalid or missing x-purge-secret header");
            return json(401, { error: "unauthorized" });
        }
    } else {
        console.error("cleanup-draft-schedules: PURGE_SECRET env var not configured");
        return json(500, { error: "server_misconfigured" });
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();

    // Fetch all disabled schedules older than RETENTION_DAYS
    const { data: candidates, error: fetchErr } = await supabaseAdmin
        .from("schedules")
        .select("id, rule_type, apply_to_all")
        .eq("enabled", false)
        .lt("created_at", cutoff)
        .order("created_at", { ascending: true });

    if (fetchErr) {
        console.error("cleanup-draft-schedules: Failed to fetch candidates:", fetchErr.message);
        return json(500, { error: "fetch_failed", detail: fetchErr.message });
    }

    const total = candidates?.length ?? 0;
    console.log(`cleanup-draft-schedules: Found ${total} disabled schedule(s) older than ${RETENTION_DAYS} days`);

    if (total === 0) {
        return json(200, { deleted: 0, ids: [] });
    }

    const candidateIds = candidates!.map(c => c.id);

    // Batch-fetch related data to determine which candidates are true drafts
    const [layoutRes, priceRes, visibilityRes, featuredRes, targetsRes] = await Promise.all([
        supabaseAdmin.from("schedule_layout").select("schedule_id").in("schedule_id", candidateIds),
        supabaseAdmin.from("schedule_price_overrides").select("schedule_id").in("schedule_id", candidateIds),
        supabaseAdmin.from("schedule_visibility_overrides").select("schedule_id").in("schedule_id", candidateIds),
        supabaseAdmin.from("schedule_featured_contents").select("schedule_id").in("schedule_id", candidateIds),
        supabaseAdmin.from("schedule_targets").select("schedule_id").in("schedule_id", candidateIds),
    ]);

    const hasLayout = new Set((layoutRes.data ?? []).map(r => r.schedule_id));
    const hasPrice = new Set((priceRes.data ?? []).map(r => r.schedule_id));
    const hasVisibility = new Set((visibilityRes.data ?? []).map(r => r.schedule_id));
    const hasFeatured = new Set((featuredRes.data ?? []).map(r => r.schedule_id));
    const hasTargets = new Set((targetsRes.data ?? []).map(r => r.schedule_id));

    // Determine which schedules are incomplete drafts
    const draftIds: string[] = [];

    for (const candidate of candidates!) {
        const { id, rule_type, apply_to_all } = candidate;

        // No target = draft (unless apply_to_all)
        if (!apply_to_all && !hasTargets.has(id)) {
            draftIds.push(id);
            continue;
        }

        // Type-specific checks
        if (rule_type === "layout" && !hasLayout.has(id)) {
            draftIds.push(id);
            continue;
        }
        if (rule_type === "featured" && !hasFeatured.has(id)) {
            draftIds.push(id);
            continue;
        }
        if (rule_type === "price" && !hasPrice.has(id)) {
            draftIds.push(id);
            continue;
        }
        if (rule_type === "visibility" && !hasVisibility.has(id)) {
            draftIds.push(id);
            continue;
        }
    }

    console.log(`cleanup-draft-schedules: ${draftIds.length} of ${total} are incomplete drafts`);

    if (draftIds.length === 0) {
        return json(200, { deleted: 0, ids: [] });
    }

    // Delete — CASCADE handles all related rows
    const { error: deleteErr } = await supabaseAdmin
        .from("schedules")
        .delete()
        .in("id", draftIds);

    if (deleteErr) {
        console.error("cleanup-draft-schedules: Delete failed:", deleteErr.message);
        return json(500, { error: "delete_failed", detail: deleteErr.message });
    }

    console.log(`cleanup-draft-schedules: Successfully deleted ${draftIds.length} abandoned draft(s)`);
    return json(200, { deleted: draftIds.length, ids: draftIds });
});
