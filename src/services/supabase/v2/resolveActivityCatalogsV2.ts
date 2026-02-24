import { supabase } from "../client";

type ResolvedCollections = {
    primary: string | null;
    overlay: string | null;
};

type ScheduleSlot = "primary" | "overlay";

type V2CatalogItem = {
    id: string;
    visible: boolean;
    effective_visible?: boolean;
    product_id: string | null;
    effective_price: number | null;
    original_price?: number | null;
};

type V2CatalogSection = {
    id: string;
    items: V2CatalogItem[];
};

type V2Catalog = {
    id: string;
    sections: V2CatalogSection[];
};

type V2ActivityScheduleRow = {
    id: string;
    activity_id: string;
    catalog_id: string;
    slot: ScheduleSlot | null;
    days_of_week: number[] | null;
    start_time: string | null;
    end_time: string | null;
    priority: number;
    is_active: boolean;
    created_at: string;
    catalog: V2Catalog | null;
};

type RawProductRow = {
    id: string;
    base_price: number | null;
};

type RawCatalogItemRow = {
    id: string;
    order_index: number | null;
    visible: boolean | null;
    product: RawProductRow | RawProductRow[] | null;
};

type RawCatalogSectionRow = {
    id: string;
    order_index: number | null;
    items: RawCatalogItemRow[] | RawCatalogItemRow | null;
};

type RawCatalogRow = {
    id: string;
    sections: RawCatalogSectionRow[] | RawCatalogSectionRow | null;
};

type RawScheduleLayoutRow = {
    catalog_id: string | null;
};

type RawLayoutRuleRow = {
    id: string;
    priority: number;
    created_at: string;
    time_mode: "always" | "window";
    days_of_week: number[] | null;
    time_from: string | null;
    time_to: string | null;
    layout: RawScheduleLayoutRow[] | RawScheduleLayoutRow | null;
};

type RawActivityGroupMemberRow = {
    group_id: string;
};

type RawPriceRuleRow = {
    id: string;
    priority: number;
    created_at: string;
    time_mode: "always" | "window";
    days_of_week: number[] | null;
    time_from: string | null;
    time_to: string | null;
};

type RawVisibilityRuleRow = {
    id: string;
    priority: number;
    created_at: string;
    time_mode: "always" | "window";
    days_of_week: number[] | null;
    time_from: string | null;
    time_to: string | null;
};

type PriceOverrideRow = {
    product_id: string;
    override_price: number;
    show_original_price: boolean;
};

type VisibilityOverrideRow = {
    product_id: string;
    visible: boolean;
};

type OverrideRow = {
    product_id: string;
    visible_override: boolean | null;
};

function normalizeOne<T>(value: T | T[] | null | undefined): T | null {
    if (!value) return null;
    return Array.isArray(value) ? value[0] ?? null : value;
}

function normalizeMany<T>(value: T[] | T | null | undefined): T[] {
    if (!value) return [];
    return Array.isArray(value) ? value : [value];
}

function normalizeCatalog(raw: RawCatalogRow | RawCatalogRow[] | null): V2Catalog | null {
    const catalog = normalizeOne(raw);
    if (!catalog) return null;

    const sections = normalizeMany(catalog.sections)
        .slice()
        .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))
        .map(section => {
            const items = normalizeMany(section.items)
                .slice()
                .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))
                .map(item => {
                    const product = normalizeOne(item.product);
                    return {
                        id: item.id,
                        visible: item.visible ?? true,
                        product_id: product?.id ?? null,
                        effective_price: product?.base_price ?? null
                    };
                });

            return {
                id: section.id,
                items
            };
        });

    return {
        id: catalog.id,
        sections
    };
}

async function loadCatalogById(catalogId: string): Promise<V2Catalog | null> {
    const { data, error } = await supabase
        .from("v2_catalogs")
        .select(
            `
            id,
            sections:v2_catalog_sections(
              id,
              order_index,
              items:v2_catalog_items(
                id,
                order_index,
                visible,
                product:v2_products(
                  id,
                  base_price
                )
              )
            )
            `
        )
        .eq("id", catalogId)
        .maybeSingle();

    if (error) throw error;

    const normalizedCatalog = normalizeCatalog((data as RawCatalogRow | null) ?? null);
    const sectionsCount = normalizedCatalog?.sections.length ?? 0;
    const itemsCount =
        normalizedCatalog?.sections.reduce((total, section) => total + section.items.length, 0) ?? 0;

    // DEBUG START
    console.log("[resolveActivityCatalogsV2][loadCatalogById] catalog counts", {
        catalogId,
        sectionsCount,
        itemsCount
    });
    // DEBUG END

    return normalizedCatalog;
}

function isTimeRuleActiveNow(
    rule: Pick<
        RawLayoutRuleRow,
        "time_mode" | "days_of_week" | "time_from" | "time_to"
    >,
    now: Date
): boolean {
    if (rule.time_mode === "always") return true;

    const day = now.getDay();
    const nowMinutes = toMinutes(now.toTimeString().slice(0, 5));
    if (nowMinutes === null) return false;

    if (rule.days_of_week !== null && !rule.days_of_week.includes(day)) {
        return false;
    }

    if (!rule.time_from || !rule.time_to) {
        return true;
    }

    const from = toMinutes(rule.time_from);
    const to = toMinutes(rule.time_to);
    if (from === null || to === null) return false;

    // Step 8: assumiamo from < to e niente cross-midnight.
    return from <= nowMinutes && nowMinutes < to;
}

async function findLayoutCatalogId(activityId: string, now: Date): Promise<string | null> {
    const [activityRulesRes, groupMembersRes] = await Promise.all([
        supabase
            .from("v2_schedules")
            .select(
                `
                id,
                priority,
                created_at,
                time_mode,
                days_of_week,
                time_from,
                time_to,
                layout:v2_schedule_layout(
                    catalog_id
                )
                `
            )
            .eq("rule_type", "layout")
            .eq("enabled", true)
            .eq("target_type", "activity")
            .eq("target_id", activityId)
            .order("priority", { ascending: true })
            .order("created_at", { ascending: true }),
        supabase
            .from("v2_activity_group_members")
            .select("group_id")
            .eq("activity_id", activityId)
    ]);

    if (activityRulesRes.error) throw activityRulesRes.error;
    if (groupMembersRes.error) throw groupMembersRes.error;

    const activityRows = (activityRulesRes.data ?? []) as RawLayoutRuleRow[];
    const groupIds = Array.from(
        new Set(((groupMembersRes.data ?? []) as RawActivityGroupMemberRow[]).map(row => row.group_id))
    );

    let activityGroupRows: RawLayoutRuleRow[] = [];
    if (groupIds.length > 0) {
        const { data, error } = await supabase
            .from("v2_schedules")
            .select(
                `
                id,
                priority,
                created_at,
                time_mode,
                days_of_week,
                time_from,
                time_to,
                layout:v2_schedule_layout(
                    catalog_id
                )
                `
            )
            .eq("rule_type", "layout")
            .eq("enabled", true)
            .eq("target_type", "activity_group")
            .in("target_id", groupIds)
            .order("priority", { ascending: true })
            .order("created_at", { ascending: true });

        if (error) throw error;
        activityGroupRows = (data ?? []) as RawLayoutRuleRow[];
    }

    const rows = [...activityRows, ...activityGroupRows].sort((a, b) => {
        if (a.priority !== b.priority) return a.priority - b.priority;
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });
    const validRows = rows.filter(row => isTimeRuleActiveNow(row, now));
    const selectedRule =
        validRows.find(row => (normalizeOne(row.layout)?.catalog_id ?? null) !== null) ?? null;
    const catalogId = normalizeOne(selectedRule?.layout)?.catalog_id ?? null;

    // DEBUG START
    console.log("[resolveActivityCatalogsV2][findLayoutCatalogId] candidates", {
        activityId,
        fromActivity: activityRows.length,
        fromActivityGroup: activityGroupRows.length,
        total: rows.length,
        valid: validRows.length,
        now: now.toISOString()
    });
    console.log("[resolveActivityCatalogsV2][findLayoutCatalogId] valid rules", {
        activityId,
        ruleIds: validRows.map(row => row.id)
    });
    console.log("[resolveActivityCatalogsV2][findLayoutCatalogId] selected", {
        activityId,
        selectedRuleId: selectedRule?.id ?? null,
        catalogId
    });
    // DEBUG END

    return catalogId;
}

export async function findActivePriceRuleScheduleId(
    activityId: string,
    now: Date
): Promise<string | null> {
    const [activityRulesRes, groupMembersRes] = await Promise.all([
        supabase
            .from("v2_schedules")
            .select(
                `
                id,
                priority,
                created_at,
                time_mode,
                days_of_week,
                time_from,
                time_to
                `
            )
            .eq("rule_type", "price")
            .eq("enabled", true)
            .eq("target_type", "activity")
            .eq("target_id", activityId)
            .order("priority", { ascending: true })
            .order("created_at", { ascending: true }),
        supabase
            .from("v2_activity_group_members")
            .select("group_id")
            .eq("activity_id", activityId)
    ]);

    if (activityRulesRes.error) throw activityRulesRes.error;
    if (groupMembersRes.error) throw groupMembersRes.error;

    const activityRows = (activityRulesRes.data ?? []) as RawPriceRuleRow[];
    const groupIds = Array.from(
        new Set(((groupMembersRes.data ?? []) as RawActivityGroupMemberRow[]).map(row => row.group_id))
    );

    let activityGroupRows: RawPriceRuleRow[] = [];
    if (groupIds.length > 0) {
        const { data, error } = await supabase
            .from("v2_schedules")
            .select(
                `
                id,
                priority,
                created_at,
                time_mode,
                days_of_week,
                time_from,
                time_to
                `
            )
            .eq("rule_type", "price")
            .eq("enabled", true)
            .eq("target_type", "activity_group")
            .in("target_id", groupIds)
            .order("priority", { ascending: true })
            .order("created_at", { ascending: true });

        if (error) throw error;
        activityGroupRows = (data ?? []) as RawPriceRuleRow[];
    }

    const rows = [...activityRows, ...activityGroupRows].sort((a, b) => {
        if (a.priority !== b.priority) return a.priority - b.priority;
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });
    const candidatePriceRules = rows;
    console.log("PRICE candidate rules:", candidatePriceRules);
    const validRows = rows.filter(row => isTimeRuleActiveNow(row, now));
    const selectedRule = validRows[0] ?? null;
    const winningPriceRule = selectedRule;
    console.log("PRICE winning rule:", winningPriceRule?.id);

    // DEBUG START
    console.log("[resolveActivityCatalogsV2][findActivePriceRuleScheduleId] candidates", {
        activityId,
        fromActivity: activityRows.length,
        fromActivityGroup: activityGroupRows.length,
        total: rows.length,
        valid: validRows.length,
        now: now.toISOString()
    });
    console.log("[resolveActivityCatalogsV2][findActivePriceRuleScheduleId] selected", {
        activityId,
        selectedScheduleId: selectedRule?.id ?? null
    });
    // DEBUG END

    return selectedRule?.id ?? null;
}

async function findActiveVisibilityRuleScheduleId(activityId: string, now: Date): Promise<string | null> {
    const [activityRulesRes, groupMembersRes] = await Promise.all([
        supabase
            .from("v2_schedules")
            .select(
                `
                id,
                priority,
                created_at,
                time_mode,
                days_of_week,
                time_from,
                time_to
                `
            )
            .eq("rule_type", "visibility")
            .eq("enabled", true)
            .eq("target_type", "activity")
            .eq("target_id", activityId)
            .order("priority", { ascending: true })
            .order("created_at", { ascending: true }),
        supabase
            .from("v2_activity_group_members")
            .select("group_id")
            .eq("activity_id", activityId)
    ]);

    if (activityRulesRes.error) throw activityRulesRes.error;
    if (groupMembersRes.error) throw groupMembersRes.error;

    const activityRows = (activityRulesRes.data ?? []) as RawVisibilityRuleRow[];
    const groupIds = Array.from(
        new Set(((groupMembersRes.data ?? []) as RawActivityGroupMemberRow[]).map(row => row.group_id))
    );

    let activityGroupRows: RawVisibilityRuleRow[] = [];
    if (groupIds.length > 0) {
        const { data, error } = await supabase
            .from("v2_schedules")
            .select(
                `
                id,
                priority,
                created_at,
                time_mode,
                days_of_week,
                time_from,
                time_to
                `
            )
            .eq("rule_type", "visibility")
            .eq("enabled", true)
            .eq("target_type", "activity_group")
            .in("target_id", groupIds)
            .order("priority", { ascending: true })
            .order("created_at", { ascending: true });

        if (error) throw error;
        activityGroupRows = (data ?? []) as RawVisibilityRuleRow[];
    }

    const rows = [...activityRows, ...activityGroupRows].sort((a, b) => {
        if (a.priority !== b.priority) return a.priority - b.priority;
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });
    const validRows = rows.filter(row => isTimeRuleActiveNow(row, now));
    const selectedRule = validRows[0] ?? null;

    console.log("[resolveActivityCatalogsV2][findActiveVisibilityRuleScheduleId] selected", {
        activityId,
        selectedScheduleId: selectedRule?.id ?? null,
        candidates: rows.length,
        valid: validRows.length
    });

    return selectedRule?.id ?? null;
}

function applyVisibilityOverridesToCatalog(
    catalog: V2Catalog | null,
    overridesByProductId: Record<string, VisibilityOverrideRow>
): V2Catalog | null {
    if (!catalog) return null;

    return {
        ...catalog,
        sections: catalog.sections
            .map(section => ({
                ...section,
                items: section.items
                    .map(item => {
                        if (!item.product_id) {
                            const effectiveVisible = item.visible;
                            return {
                                ...item,
                                effective_visible: effectiveVisible
                            };
                        }

                        const override = overridesByProductId[item.product_id];
                        const effectiveVisible = override?.visible ?? item.visible;

                        return {
                            ...item,
                            effective_visible: effectiveVisible
                        };
                    })
                    .filter(item => (item.effective_visible ?? item.visible) === true)
            }))
            .filter(section => section.items.length > 0)
    };
}

function applyPriceOverridesToCatalog(
    catalog: V2Catalog | null,
    overridesByProductId: Record<string, PriceOverrideRow>
): V2Catalog | null {
    if (!catalog) return null;

    return {
        ...catalog,
        sections: catalog.sections.map(section => ({
            ...section,
            items: section.items.map(item => {
                if (!item.product_id) return item;

                const override = overridesByProductId[item.product_id];
                console.log(
                    "Product price check:",
                    item.product_id,
                    "base:",
                    item.effective_price,
                    "override:",
                    override?.override_price
                );
                if (!override) return item;

                return {
                    ...item,
                    effective_price: override.override_price,
                    ...(override.show_original_price ? { original_price: item.effective_price } : {})
                };
            })
        }))
    };
}

function toMinutes(hhmm: string | null): number | null {
    if (!hhmm) return null;
    const [h, m] = hhmm.slice(0, 5).split(":").map(Number);
    if (Number.isNaN(h) || Number.isNaN(m)) return null;
    return h * 60 + m;
}

function prevDay(d: number) {
    return (d + 6) % 7;
}

function scheduleIncludesDay(days: number[] | null, day: number) {
    if (days == null) return true;
    return days.includes(day);
}

function isScheduleActive(schedule: V2ActivityScheduleRow, now: Date) {
    if (!schedule.is_active) return false;

    const day = now.getDay();
    const time = toMinutes(now.toTimeString().slice(0, 5));
    if (time === null) return false;

    const start = toMinutes(schedule.start_time);
    const end = toMinutes(schedule.end_time);

    if (start === null || end === null) {
        return scheduleIncludesDay(schedule.days_of_week, day);
    }

    if (start === end) {
        return scheduleIncludesDay(schedule.days_of_week, day);
    }

    if (start < end) {
        if (!scheduleIncludesDay(schedule.days_of_week, day)) return false;
        return start <= time && time < end;
    }

    const isStartDayActive = scheduleIncludesDay(schedule.days_of_week, day) && time >= start;
    const isNextDayActive = scheduleIncludesDay(schedule.days_of_week, prevDay(day)) && time < end;

    return isStartDayActive || isNextDayActive;
}

function compareScheduleWinner(a: V2ActivityScheduleRow, b: V2ActivityScheduleRow) {
    if (a.priority !== b.priority) return b.priority - a.priority;

    const aStart = toMinutes(a.start_time) ?? -1;
    const bStart = toMinutes(b.start_time) ?? -1;
    if (aStart !== bStart) return bStart - aStart;

    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
}

function pickWinner(schedules: V2ActivityScheduleRow[]): V2ActivityScheduleRow | null {
    if (schedules.length === 0) return null;
    if (schedules.length === 1) return schedules[0];
    return schedules.slice().sort(compareScheduleWinner)[0];
}

function pickFallbackPrimary(
    schedules: V2ActivityScheduleRow[],
    now: Date
): V2ActivityScheduleRow | null {
    const day = now.getDay();
    const time = toMinutes(now.toTimeString().slice(0, 5));
    if (time === null) return null;

    const primary = schedules.filter(s => s.is_active && s.slot === "primary");
    if (primary.length === 0) return null;

    const affectsDay = (s: V2ActivityScheduleRow, d: number) => {
        const start = toMinutes(s.start_time);
        const end = toMinutes(s.end_time);

        if (start === null || end === null) return scheduleIncludesDay(s.days_of_week, d);
        if (start === end) return scheduleIncludesDay(s.days_of_week, d);
        if (start < end) return scheduleIncludesDay(s.days_of_week, d);

        return (
            scheduleIncludesDay(s.days_of_week, d) ||
            scheduleIncludesDay(s.days_of_week, prevDay(d))
        );
    };

    const todayCandidates = primary.filter(s => affectsDay(s, day));

    const pastEndedToday = todayCandidates.filter(s => {
        const start = toMinutes(s.start_time);
        const end = toMinutes(s.end_time);

        if (start === null || end === null) return false;
        if (start === end) return false;
        if (start < end) return end <= time;
        return false;
    });

    if (pastEndedToday.length > 0) {
        return pastEndedToday.slice().sort((a, b) => {
            const aEnd = toMinutes(a.end_time) ?? -1;
            const bEnd = toMinutes(b.end_time) ?? -1;
            if (aEnd !== bEnd) return bEnd - aEnd;
            return compareScheduleWinner(a, b);
        })[0];
    }

    const nextStartingToday = todayCandidates
        .filter(s => {
            const start = toMinutes(s.start_time);
            const end = toMinutes(s.end_time);

            if (start === null || end === null) return false;
            if (start === end) return false;
            return start >= time;
        })
        .sort((a, b) => {
            const aStart = toMinutes(a.start_time) ?? 24 * 60;
            const bStart = toMinutes(b.start_time) ?? 24 * 60;
            if (aStart !== bStart) return aStart - bStart;
            return compareScheduleWinner(a, b);
        });

    if (nextStartingToday.length > 0) return nextStartingToday[0];

    const ranked = primary
        .map(s => {
            const start = toMinutes(s.start_time) ?? 24 * 60;
            const days = s.days_of_week ?? [];
            const overnight =
                (toMinutes(s.start_time) ?? 0) > (toMinutes(s.end_time) ?? Number.MAX_SAFE_INTEGER);

            let bestDeltaDays = 7;
            for (let delta = 0; delta < 7; delta++) {
                const d = (day + delta) % 7;
                const ok = days.includes(d) || (overnight && days.includes(prevDay(d)));
                if (ok) {
                    bestDeltaDays = delta;
                    break;
                }
            }

            return { s, bestDeltaDays, start };
        })
        .sort((a, b) => {
            if (a.bestDeltaDays !== b.bestDeltaDays) return a.bestDeltaDays - b.bestDeltaDays;
            if (a.start !== b.start) return a.start - b.start;
            return compareScheduleWinner(a.s, b.s);
        });

    return ranked[0]?.s ?? null;
}

function hasRenderableItems(
    schedule: V2ActivityScheduleRow,
    overridesByProductId: Record<string, OverrideRow>
) {
    const sections = schedule.catalog?.sections ?? [];

    for (const section of sections) {
        for (const item of section.items) {
            if (!item.product_id) continue;
            const override = overridesByProductId[item.product_id];
            const visible = override?.visible_override ?? item.effective_visible ?? item.visible;
            if (visible) return true;
        }
    }

    return false;
}

export async function resolveActivityCatalogsV2(
    activityId: string,
    now: Date = new Date()
): Promise<ResolvedCollections> {
    const layoutCatalogId = await findLayoutCatalogId(activityId, now);

    // DEBUG START
    console.log("[resolveActivityCatalogsV2] layoutCatalogId", {
        activityId,
        layoutCatalogId
    });
    // DEBUG END

    let schedules: V2ActivityScheduleRow[] = [];

    if (!layoutCatalogId) {
        return {
            primary: null,
            overlay: null
        };
    }

    const layoutCatalog = await loadCatalogById(layoutCatalogId);

    const sectionsCount = layoutCatalog?.sections.length ?? 0;
    const itemsCount =
        layoutCatalog?.sections.reduce((total, section) => total + section.items.length, 0) ?? 0;

    // DEBUG START
    console.log("[resolveActivityCatalogsV2] layoutCatalog loaded", {
        activityId,
        layoutCatalog,
        sectionsCount,
        itemsCount
    });
    // DEBUG END

    schedules = [
        {
            id: `layout-rule:${activityId}`,
            activity_id: activityId,
            catalog_id: layoutCatalogId,
            slot: "primary",
            days_of_week: null,
            start_time: null,
            end_time: null,
            priority: Number.MAX_SAFE_INTEGER,
            is_active: true,
            created_at: new Date(0).toISOString(),
            catalog: layoutCatalog
        }
    ];

    const productIds = Array.from(
        new Set(
            schedules.flatMap(schedule =>
                (schedule.catalog?.sections ?? []).flatMap(section =>
                    section.items
                        .map(item => item.product_id)
                        .filter((id): id is string => Boolean(id))
                )
            )
        )
    );

    const visibilityOverridesByProductId: Record<string, VisibilityOverrideRow> = {};
    const overridesByProductId: Record<string, OverrideRow> = {};
    const priceOverridesByProductId: Record<string, PriceOverrideRow> = {};

    const activeVisibilityRuleScheduleId = await findActiveVisibilityRuleScheduleId(activityId, now);
    if (activeVisibilityRuleScheduleId && productIds.length > 0) {
        const { data: visibilityOverrideData, error: visibilityOverrideError } = await supabase
            .from("v2_schedule_visibility_overrides")
            .select("product_id, visible")
            .eq("schedule_id", activeVisibilityRuleScheduleId)
            .in("product_id", productIds);

        if (visibilityOverrideError) throw visibilityOverrideError;

        for (const row of (visibilityOverrideData ?? []) as VisibilityOverrideRow[]) {
            visibilityOverridesByProductId[row.product_id] = row;
        }
    }

    schedules = schedules.map(schedule => ({
        ...schedule,
        catalog: applyVisibilityOverridesToCatalog(schedule.catalog, visibilityOverridesByProductId)
    }));

    const visibleProductIds = Array.from(
        new Set(
            schedules.flatMap(schedule =>
                (schedule.catalog?.sections ?? []).flatMap(section =>
                    section.items
                        .map(item => item.product_id)
                        .filter((id): id is string => Boolean(id))
                )
            )
        )
    );

    if (visibleProductIds.length > 0) {
        const { data: overrideData, error: overrideError } = await supabase
            .from("v2_activity_product_overrides")
            .select("product_id, visible_override")
            .eq("activity_id", activityId)
            .in("product_id", visibleProductIds);

        if (overrideError) throw overrideError;

        for (const row of (overrideData ?? []) as OverrideRow[]) {
            overridesByProductId[row.product_id] = row;
        }
    }

    const activePriceRuleScheduleId = await findActivePriceRuleScheduleId(activityId, now);

    if (activePriceRuleScheduleId && visibleProductIds.length > 0) {
        const { data: priceOverrideData, error: priceOverrideError } = await supabase
            .from("v2_schedule_price_overrides")
            .select("product_id, override_price, show_original_price")
            .eq("schedule_id", activePriceRuleScheduleId)
            .in("product_id", visibleProductIds);

        if (priceOverrideError) throw priceOverrideError;

        const overrides = (priceOverrideData ?? []) as PriceOverrideRow[];
        console.log("PRICE overrides loaded:", overrides);

        for (const row of overrides) {
            priceOverridesByProductId[row.product_id] = row;
        }
    }

    schedules = schedules.map(schedule => ({
        ...schedule,
        catalog: applyPriceOverridesToCatalog(schedule.catalog, priceOverridesByProductId)
    }));

    const schedulesWithItems = schedules.filter(schedule =>
        hasRenderableItems(schedule, overridesByProductId)
    );

    const activeNow = schedulesWithItems.filter(schedule => isScheduleActive(schedule, now));
    const activePrimary = pickWinner(activeNow.filter(schedule => schedule.slot === "primary"));
    const activeOverlay = pickWinner(activeNow.filter(schedule => schedule.slot === "overlay"));

    const fallbackPrimary = activePrimary ? null : pickFallbackPrimary(schedulesWithItems, now);
    const finalPrimary = activePrimary ?? fallbackPrimary;

    // DEBUG START
    console.log("[resolveActivityCatalogsV2] final state before return", {
        activityId,
        finalPrimary,
        schedulesLength: schedules.length,
        schedulesWithItemsLength: schedulesWithItems.length,
        activeNowLength: activeNow.length
    });
    // DEBUG END

    return {
        primary: finalPrimary?.catalog_id ?? null,
        overlay: activeOverlay?.catalog_id ?? null
    };
}
