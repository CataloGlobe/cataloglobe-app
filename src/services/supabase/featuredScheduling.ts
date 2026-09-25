import { supabase } from "@/services/supabase/client";
import { revalidatePublicCatalogForTenant } from "@services/publicCatalog/revalidatePublicCatalog";
import { daysOfWeekForDb } from "@utils/scheduleDays";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FeaturedRuleContent = {
    featured_content_id: string;
    slot: "before_catalog" | "after_catalog";
    sort_order: number;
    featured_content_title?: string | null;
};

export type FeaturedRule = {
    id: string;
    name: string;
    tenant_id: string;
    rule_type: "featured";
    enabled: boolean;
    priority: number;
    display_order: number;
    priority_level: string;
    time_mode: "always" | "window";
    days_of_week: number[] | null;
    time_from: string | null;
    time_to: string | null;
    start_at: string | null;
    end_at: string | null;
    apply_to_all: boolean;
    target_type: string | null;
    target_id: string | null;
    activityIds: string[];
    groupIds: string[];
    created_at: string;
    featured_contents: FeaturedRuleContent[];
};

// ---------------------------------------------------------------------------
// Internal raw row types
// ---------------------------------------------------------------------------

type RawScheduleRow = {
    id: string;
    tenant_id: string;
    name: string | null;
    rule_type: string;
    target_type: string | null;
    target_id: string | null;
    apply_to_all: boolean | null;
    priority: number;
    priority_level: string | null;
    display_order: number | null;
    enabled: boolean;
    time_mode: "always" | "window";
    days_of_week: number[] | null;
    time_from: string | null;
    time_to: string | null;
    start_at: string | null;
    end_at: string | null;
    created_at: string;
};

type RawScheduleFeaturedContentRow = {
    schedule_id: string;
    featured_content_id: string;
    slot: string;
    sort_order: number;
    featured_content:
        | { title: string }
        | { title: string }[]
        | null;
};

type RawScheduleTargetLookupRow = {
    schedule_id: string;
    target_type: string;
    target_id: string;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizeOne<T>(value: T | T[] | null | undefined): T | null {
    if (!value) return null;
    return Array.isArray(value) ? (value[0] ?? null) : value;
}

// ---------------------------------------------------------------------------
// listFeaturedRules
// ---------------------------------------------------------------------------

export async function listFeaturedRules(tenantId: string): Promise<FeaturedRule[]> {
    const { data: schedules, error: schedulesError } = await supabase
        .from("schedules")
        .select(
            `id, tenant_id, name, rule_type, target_type, target_id,
             apply_to_all, priority, priority_level, display_order,
             enabled, time_mode, days_of_week, time_from, time_to,
             start_at, end_at, created_at`
        )
        .eq("tenant_id", tenantId)
        .eq("rule_type", "featured")
        .order("display_order", { ascending: true })
        .order("created_at", { ascending: false });

    if (schedulesError) throw schedulesError;

    const baseRules = (schedules ?? []) as unknown as RawScheduleRow[];
    if (baseRules.length === 0) return [];

    const ruleIds = baseRules.map(r => r.id);

    // Load featured contents
    const featuredContentsByScheduleId = new Map<string, FeaturedRuleContent[]>();
    {
        const { data: fcData, error: fcError } = await supabase
            .from("schedule_featured_contents")
            .select(
                `schedule_id, featured_content_id, slot, sort_order,
                 featured_content:featured_contents(title)`
            )
            .in("schedule_id", ruleIds)
            .order("sort_order", { ascending: true });

        if (fcError) throw fcError;

        for (const row of (fcData ?? []) as unknown as RawScheduleFeaturedContentRow[]) {
            const current = featuredContentsByScheduleId.get(row.schedule_id) ?? [];
            current.push({
                featured_content_id: row.featured_content_id,
                slot: row.slot as "before_catalog" | "after_catalog",
                sort_order: row.sort_order,
                featured_content_title: normalizeOne(row.featured_content)?.title ?? null,
            });
            featuredContentsByScheduleId.set(row.schedule_id, current);
        }
    }

    // Multi-target: activityIds/groupIds letti da schedule_targets (passo 3).
    // apply_to_all resta valutato per primo e vince sempre su qualsiasi
    // target specifico — stesso contratto del resolver (scheduleResolver.ts).
    const targetsByScheduleId = new Map<string, { activityIds: string[]; groupIds: string[] }>();
    {
        const { data: targetsData, error: targetsError } = await supabase
            .from("schedule_targets")
            .select("schedule_id, target_type, target_id")
            .in("schedule_id", ruleIds);

        if (targetsError) throw targetsError;

        for (const row of (targetsData ?? []) as RawScheduleTargetLookupRow[]) {
            const entry = targetsByScheduleId.get(row.schedule_id) ?? {
                activityIds: [],
                groupIds: []
            };
            if (row.target_type === "activity") {
                entry.activityIds.push(row.target_id);
            } else if (row.target_type === "activity_group") {
                entry.groupIds.push(row.target_id);
            }
            targetsByScheduleId.set(row.schedule_id, entry);
        }
    }

    return baseRules.map((rule): FeaturedRule => {
        const applyToAll = rule.apply_to_all === true;
        const targets = targetsByScheduleId.get(rule.id);
        const activityIds = applyToAll ? [] : (targets?.activityIds ?? []);
        const groupIds = applyToAll ? [] : (targets?.groupIds ?? []);

        return {
            id: rule.id,
            name: rule.name ?? "",
            tenant_id: rule.tenant_id,
            rule_type: "featured",
            enabled: rule.enabled,
            priority: rule.priority,
            display_order: rule.display_order ?? 0,
            priority_level: rule.priority_level ?? "medium",
            time_mode: rule.time_mode,
            days_of_week: rule.days_of_week,
            time_from: rule.time_from,
            time_to: rule.time_to,
            start_at: rule.start_at,
            end_at: rule.end_at,
            apply_to_all: applyToAll,
            target_type: rule.target_type,
            target_id: rule.target_id,
            activityIds,
            groupIds,
            created_at: rule.created_at,
            featured_contents: featuredContentsByScheduleId.get(rule.id) ?? [],
        };
    });
}

// ---------------------------------------------------------------------------
// createFeaturedRuleDraft
// ---------------------------------------------------------------------------

export async function createFeaturedRuleDraft(input: {
    tenantId: string;
    name: string;
}): Promise<string> {
    const { data: schedule, error: scheduleError } = await supabase
        .from("schedules")
        .insert({
            tenant_id: input.tenantId,
            name: input.name,
            rule_type: "featured",
            target_type: null,
            target_id: null,
            apply_to_all: true,
            priority: 21,
            priority_level: "medium",
            display_order: 0,
            enabled: false,
            time_mode: "always",
            days_of_week: null,
            time_from: null,
            time_to: null,
            start_at: null,
            end_at: null,
        })
        .select("id")
        .single();

    if (scheduleError) throw scheduleError;
    void revalidatePublicCatalogForTenant(input.tenantId);
    return schedule.id;
}

// ---------------------------------------------------------------------------
// updateFeaturedRule
// ---------------------------------------------------------------------------

export async function updateFeaturedRule(input: {
    id: string;
    tenantId: string;
    name: string;
    enabled: boolean;
    startAt: string | null;
    endAt: string | null;
    timeFrom: string | null;
    timeTo: string | null;
    daysOfWeek: number[] | null;
    alwaysActive: boolean;
    targetMode: "all" | "activities" | "groups";
    activityIds: string[];
    groupIds: string[];
    featuredContents: FeaturedRuleContent[];
}): Promise<void> {
    const applyToAll = input.targetMode === "all";

    // Derive legacy target fields
    let legacyTargetType: string | null = null;
    let legacyTargetId: string | null = null;

    if (!applyToAll) {
        if (input.activityIds.length > 0) {
            legacyTargetType = "activity";
            legacyTargetId = input.activityIds[0];
        } else if (input.groupIds.length > 0) {
            legacyTargetType = "activity_group";
            legacyTargetId = input.groupIds[0];
        }
    }

    // Update schedule row
    const { error: scheduleError } = await supabase
        .from("schedules")
        .update({
            name: input.name,
            enabled: input.enabled,
            time_mode: input.alwaysActive ? "always" : "window",
            days_of_week: input.alwaysActive ? null : daysOfWeekForDb(input.daysOfWeek),
            time_from: input.alwaysActive ? null : input.timeFrom,
            time_to: input.alwaysActive ? null : input.timeTo,
            start_at: input.startAt,
            end_at: input.endAt,
            apply_to_all: applyToAll,
            target_type: legacyTargetType,
            target_id: legacyTargetId,
        })
        .eq("id", input.id)
        .eq("tenant_id", input.tenantId);

    if (scheduleError) throw scheduleError;

    // Inline columns (target_type/target_id/apply_to_all) written above are
    // the shim for Edge/resolver. schedule_targets — the actual multi-target
    // set — is written separately by the caller (update_schedule_targets
    // RPC, useRuleDetail.ts), not here: this function doesn't know the
    // full target list, only the legacy single target it just derived.

    // Delete + re-insert featured contents
    const { error: deleteFcError } = await supabase
        .from("schedule_featured_contents")
        .delete()
        .eq("schedule_id", input.id);

    if (deleteFcError) throw deleteFcError;

    if (input.featuredContents.length > 0) {
        const { error: insertFcError } = await supabase
            .from("schedule_featured_contents")
            .insert(
                input.featuredContents.map(fc => ({
                    tenant_id: input.tenantId,
                    schedule_id: input.id,
                    featured_content_id: fc.featured_content_id,
                    slot: fc.slot,
                    sort_order: fc.sort_order,
                }))
            );

        if (insertFcError) throw insertFcError;
    }

    void revalidatePublicCatalogForTenant(input.tenantId);
}

// ---------------------------------------------------------------------------
// deleteFeaturedRule
// ---------------------------------------------------------------------------

export async function deleteFeaturedRule(
    id: string,
    tenantId: string
): Promise<void> {
    const { error } = await supabase
        .from("schedules")
        .delete()
        .eq("id", id)
        .eq("tenant_id", tenantId);

    if (error) throw error;

    void revalidatePublicCatalogForTenant(tenantId);
}

// ---------------------------------------------------------------------------
// reorderFeaturedRules
// ---------------------------------------------------------------------------

export async function reorderFeaturedRules(
    tenantId: string,
    updates: Array<{ id: string; display_order: number }>
): Promise<void> {
    if (updates.length === 0) return;

    for (const u of updates) {
        const { error } = await supabase
            .from("schedules")
            .update({ display_order: u.display_order })
            .eq("id", u.id)
            .eq("tenant_id", tenantId);

        if (error) throw error;
    }

    void revalidatePublicCatalogForTenant(tenantId);
}
