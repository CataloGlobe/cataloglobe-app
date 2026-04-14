import { supabase } from "@/services/supabase/client";

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

type RawScheduleTargetRow = {
    schedule_id: string;
    target_type: string;
    target_id: string;
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

    // Load multi-target entries
    const scheduleTargetsByScheduleId = new Map<string, RawScheduleTargetRow[]>();
    {
        const { data: targetsData, error: targetsError } = await supabase
            .from("schedule_targets")
            .select("schedule_id, target_type, target_id")
            .in("schedule_id", ruleIds);

        if (!targetsError && targetsData) {
            for (const row of targetsData as RawScheduleTargetRow[]) {
                const arr = scheduleTargetsByScheduleId.get(row.schedule_id) ?? [];
                arr.push(row);
                scheduleTargetsByScheduleId.set(row.schedule_id, arr);
            }
        }
    }

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

    return baseRules.map((rule): FeaturedRule => {
        const targets = scheduleTargetsByScheduleId.get(rule.id) ?? [];
        const applyToAll = rule.apply_to_all ?? (targets.length === 0);
        const activityIds = targets
            .filter(t => t.target_type === "activity")
            .map(t => t.target_id);
        const groupIds = targets
            .filter(t => t.target_type === "activity_group")
            .map(t => t.target_id);

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
            enabled: true,
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
    daysOfWeek: number[];
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
            days_of_week: input.alwaysActive ? null : input.daysOfWeek,
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

    // Sync schedule_targets join table
    const { error: deleteTargetsError } = await supabase
        .from("schedule_targets")
        .delete()
        .eq("schedule_id", input.id);

    if (deleteTargetsError) {
        console.warn("schedule_targets delete failed:", deleteTargetsError);
    }

    if (!applyToAll) {
        const targetRows: Array<{ schedule_id: string; target_type: string; target_id: string }> = [
            ...input.activityIds.map(id => ({
                schedule_id: input.id,
                target_type: "activity" as const,
                target_id: id,
            })),
            ...input.groupIds.map(id => ({
                schedule_id: input.id,
                target_type: "activity_group" as const,
                target_id: id,
            })),
        ];

        if (targetRows.length > 0) {
            const { error: insertTargetsError } = await supabase
                .from("schedule_targets")
                .insert(targetRows);

            if (insertTargetsError) {
                console.warn("schedule_targets insert failed:", insertTargetsError);
            }
        }
    }

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
}
