import { supabase } from "@/services/supabase/client";

export type LayoutTimeMode = "always" | "window";
export type RuleType = "layout" | "price" | "visibility";
export type RuleTargetType = "activity" | "activity_group";
export type VisibilityMode = "hide" | "disable";

export type PriceRuleProductOverride = {
    product_id: string;
    product_name: string | null;
    override_price: number;
    show_original_price: boolean;
};

export type VisibilityRuleProductOverride = {
    product_id: string;
    product_name: string | null;
    mode: VisibilityMode;
};

export type LayoutRuleFeaturedContent = {
    featured_content_id: string;
    slot: "hero" | "before_catalog" | "after_catalog";
    sort_order: number;
    featured_content_title?: string | null;
};

export type LayoutRule = {
    id: string;
    tenant_id: string;
    name: string | null;
    rule_type: RuleType;
    // Legacy single-target fields (kept for backward compat with runtime Edge Functions)
    target_type: string;
    target_id: string;
    target_group: {
        id: string;
        name: string;
        is_system: boolean;
    } | null;
    // Multi-target fields
    applyToAll: boolean;
    activityIds: string[];
    groupIds: string[];
    visibility_mode: VisibilityMode;
    priority: number;
    enabled: boolean;
    time_mode: LayoutTimeMode;
    days_of_week: number[] | null;
    time_from: string | null;
    time_to: string | null;
    start_at: string | null;
    end_at: string | null;
    created_at: string;
    layout: {
        style_id: string | null;
        catalog_id: string | null;
    } | null;
    price_overrides: PriceRuleProductOverride[];
    visibility_overrides: VisibilityRuleProductOverride[];
    featured_contents: LayoutRuleFeaturedContent[];
};

export type LayoutRuleOption = {
    id: string;
    name: string;
    tenant_id: string;
    is_system?: boolean;
    current_version?: { version: number } | null;
};

type RawScheduleRow = {
    id: string;
    tenant_id: string;
    name?: string | null;
    rule_type: RuleType;
    target_type: string;
    target_id: string;
    apply_to_all?: boolean | null;
    visibility_mode?: VisibilityMode | null;
    priority: number;
    enabled: boolean;
    time_mode: LayoutTimeMode;
    days_of_week: number[] | null;
    time_from: string | null;
    time_to: string | null;
    start_at: string | null;
    end_at: string | null;
    created_at: string;
};

type RawScheduleLayoutRow = {
    schedule_id: string;
    style_id: string | null;
    catalog_id: string | null;
};

type RawPriceOverrideRow = {
    schedule_id: string;
    product_id: string;
    override_price: number;
    show_original_price: boolean;
    product:
        | {
              name: string | null;
          }
        | {
              name: string | null;
          }[]
        | null;
};

type RawVisibilityOverrideRow = {
    schedule_id: string;
    product_id: string;
    visible: boolean;
    mode?: VisibilityMode | null;
    product:
        | {
              name: string | null;
          }
        | {
              name: string | null;
          }[]
        | null;
};

type RawScheduleFeaturedContentRow = {
    schedule_id: string;
    featured_content_id: string;
    slot: string;
    sort_order: number;
    featured_content:
        | {
              title: string;
          }
        | {
              title: string;
          }[]
        | null;
};

type ActivityGroupRow = {
    id: string;
    name: string;
    is_system: boolean;
};

type RawScheduleTargetRow = {
    schedule_id: string;
    target_type: string;
    target_id: string;
};

type RawStyleOptionRow = {
    id: string;
    name: string;
    tenant_id: string;
    is_system: boolean;
    current_version: { version: number } | { version: number }[] | null;
};

export type ProductGroupAssignmentOption = {
    product_id: string;
    group_id: string;
    tenant_id: string;
};

function normalizeOne<T>(value: T | T[] | null | undefined): T | null {
    if (!value) return null;
    return Array.isArray(value) ? (value[0] ?? null) : value;
}

function normalizeVisibilityMode(value: string | null | undefined): VisibilityMode | null {
    if (value === "hide" || value === "disable") return value;
    return null;
}

const systemActivityGroupIdByTenant = new Map<string, string>();

function isMissingColumnError(error: unknown, column: string): boolean {
    if (!error || typeof error !== "object") return false;
    const message = String((error as { message?: string }).message ?? "").toLowerCase();
    const needle = column.toLowerCase();
    return (
        message.includes(needle) &&
        (message.includes("column") ||
            message.includes("schema cache") ||
            message.includes("does not exist"))
    );
}

async function selectSchedulesWithNameFallback(tenantId: string): Promise<RawScheduleRow[]> {
    let includeName = true;
    let includeApplyToAll = true;
    let includeVisibilityMode = true;

    for (let attempt = 0; attempt < 8; attempt += 1) {
        const selectColumns = [
            "id",
            "tenant_id",
            ...(includeName ? ["name"] : []),
            "rule_type",
            "target_type",
            "target_id",
            ...(includeApplyToAll ? ["apply_to_all"] : []),
            ...(includeVisibilityMode ? ["visibility_mode"] : []),
            "priority",
            "enabled",
            "time_mode",
            "days_of_week",
            "time_from",
            "time_to",
            "start_at",
            "end_at",
            "created_at"
        ].join(", ");

        const result = await supabase
            .from("schedules")
            .select(selectColumns)
            .eq("tenant_id", tenantId)
            .order("priority", { ascending: true })
            .order("created_at", { ascending: false });

        if (!result.error) {
            return (result.data ?? []) as unknown as RawScheduleRow[];
        }

        const missingName = includeName && isMissingColumnError(result.error, "name");
        const missingApplyToAll =
            includeApplyToAll && isMissingColumnError(result.error, "apply_to_all");
        const missingVisibilityMode =
            includeVisibilityMode && isMissingColumnError(result.error, "visibility_mode");

        if (!missingName && !missingApplyToAll && !missingVisibilityMode) {
            throw result.error;
        }

        if (missingName) includeName = false;
        if (missingApplyToAll) includeApplyToAll = false;
        if (missingVisibilityMode) includeVisibilityMode = false;
    }

    throw new Error("Impossibile leggere schedules con lo schema corrente.");
}

async function insertScheduleWithNameFallback(
    payload: {
        tenant_id: string;
        rule_type: RuleType;
        target_type: string;
        target_id: string;
        priority: number;
        enabled: boolean;
        time_mode: LayoutTimeMode;
        days_of_week: number[] | null;
        time_from: string | null;
        time_to: string | null;
    },
    name?: string | null
): Promise<{ id: string }> {
    const normalizedName = name?.trim() ?? "";
    if (normalizedName.length > 0) {
        const withNameRes = await supabase
            .from("schedules")
            .insert({
                ...payload,
                name: normalizedName
            })
            .select("id")
            .single();

        if (!withNameRes.error) return withNameRes.data;
        if (!isMissingColumnError(withNameRes.error, "name")) throw withNameRes.error;
    }

    const withoutNameRes = await supabase
        .from("schedules")
        .insert(payload)
        .select("id")
        .single();

    if (withoutNameRes.error) throw withoutNameRes.error;
    return withoutNameRes.data;
}

async function updateScheduleWithNameFallback(input: {
    scheduleId: string;
    patch: {
        priority: number;
        enabled: boolean;
        time_mode: LayoutTimeMode;
        days_of_week: number[] | null;
        time_from: string | null;
        time_to: string | null;
        target_type?: RuleTargetType;
        target_id?: string;
    };
    name?: string | null;
}): Promise<void> {
    const normalizedName = input.name?.trim() ?? "";
    const patchWithName = {
        ...input.patch,
        name: normalizedName.length > 0 ? normalizedName : null
    };

    const withNameRes = await supabase
        .from("schedules")
        .update(patchWithName)
        .eq("id", input.scheduleId);

    if (!withNameRes.error) return;
    if (!isMissingColumnError(withNameRes.error, "name")) throw withNameRes.error;

    const withoutNameRes = await supabase
        .from("schedules")
        .update(input.patch)
        .eq("id", input.scheduleId);

    if (withoutNameRes.error) throw withoutNameRes.error;
}

async function updateScheduleVisibilityModeFallback(
    scheduleId: string,
    visibilityMode: VisibilityMode
): Promise<void> {
    const { error } = await supabase
        .from("schedules")
        .update({ visibility_mode: visibilityMode })
        .eq("id", scheduleId);

    if (error && !isMissingColumnError(error, "visibility_mode")) {
        throw error;
    }
}

async function selectVisibilityOverridesWithModeFallback(
    scheduleIds: string[]
): Promise<RawVisibilityOverrideRow[]> {
    if (scheduleIds.length === 0) return [];

    const withModeRes = await supabase
        .from("schedule_visibility_overrides")
        .select(
            `
            schedule_id,
            product_id,
            visible,
            mode,
            product:products(
                name
            )
            `
        )
        .in("schedule_id", scheduleIds);

    if (!withModeRes.error) {
        return (withModeRes.data ?? []) as RawVisibilityOverrideRow[];
    }

    if (!isMissingColumnError(withModeRes.error, "mode")) {
        throw withModeRes.error;
    }

    const withoutModeRes = await supabase
        .from("schedule_visibility_overrides")
        .select(
            `
            schedule_id,
            product_id,
            visible,
            product:products(
                name
            )
            `
        )
        .in("schedule_id", scheduleIds);

    if (withoutModeRes.error) throw withoutModeRes.error;
    return ((withoutModeRes.data ?? []) as RawVisibilityOverrideRow[]).map(row => ({
        ...row,
        mode: null
    }));
}

async function insertVisibilityOverridesWithModeFallback(
    tenantId: string,
    rows: Array<{ schedule_id: string; product_id: string; mode: VisibilityMode }>
): Promise<void> {
    if (rows.length === 0) return;

    const withModeRes = await supabase.from("schedule_visibility_overrides").insert(
        rows.map(row => ({
            tenant_id: tenantId,
            schedule_id: row.schedule_id,
            product_id: row.product_id,
            visible: false,
            mode: row.mode
        }))
    );

    if (!withModeRes.error) return;
    if (!isMissingColumnError(withModeRes.error, "mode")) throw withModeRes.error;

    const uniqueModes = Array.from(new Set(rows.map(row => row.mode)));
    if (uniqueModes.length > 1) {
        throw new Error(
            "Schema non aggiornato: impossibile salvare comportamenti visibility differenti per prodotto senza colonna mode."
        );
    }

    const withoutModeRes = await supabase.from("schedule_visibility_overrides").insert(
        rows.map(row => ({
            tenant_id: tenantId,
            schedule_id: row.schedule_id,
            product_id: row.product_id,
            visible: false
        }))
    );

    if (withoutModeRes.error) throw withoutModeRes.error;
}

export async function getSystemActivityGroupId(tenantId: string): Promise<string | null> {
    const cached = systemActivityGroupIdByTenant.get(tenantId);
    if (cached) return cached;

    const { data, error } = await supabase
        .from("activity_groups")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("is_system", true)
        .eq("name", "Tutte le sedi")
        .limit(1)
        .maybeSingle();

    if (error) throw error;

    const systemGroupId = data?.id ?? null;
    if (systemGroupId) {
        systemActivityGroupIdByTenant.set(tenantId, systemGroupId);
    }

    return systemGroupId;
}

export async function listLayoutRules(tenantId: string): Promise<LayoutRule[]> {
    const data = await selectSchedulesWithNameFallback(tenantId);
    const applyToAllByScheduleId = new Map(data.map(row => [row.id, row.apply_to_all]));

    const baseRules = data.map(row => ({
        id: row.id,
        tenant_id: row.tenant_id,
        name: row.name ?? null,
        rule_type: row.rule_type,
        target_type: row.target_type,
        target_id: row.target_id,
        target_group: null,
        // Will be populated below
        applyToAll: false,
        activityIds: [] as string[],
        groupIds: [] as string[],
        visibility_mode: row.visibility_mode ?? "hide",
        priority: row.priority,
        enabled: row.enabled,
        time_mode: row.time_mode,
        days_of_week: row.days_of_week,
        time_from: row.time_from,
        time_to: row.time_to,
        start_at: row.start_at,
        end_at: row.end_at,
        created_at: row.created_at,
        layout: null,
        price_overrides: [],
        visibility_overrides: [],
        featured_contents: []
    }));

    const layoutRuleIds = baseRules
        .filter(rule => rule.rule_type === "layout")
        .map(rule => rule.id);

    let layoutByScheduleId = new Map<
        string,
        { style_id: string | null; catalog_id: string | null }
    >();
    if (layoutRuleIds.length > 0) {
        const { data: layoutsData, error: layoutsError } = await supabase
            .from("schedule_layout")
            .select("schedule_id, style_id, catalog_id")
            .in("schedule_id", layoutRuleIds);

        if (layoutsError) throw layoutsError;

        layoutByScheduleId = new Map(
            ((layoutsData ?? []) as RawScheduleLayoutRow[]).map(layout => [
                layout.schedule_id,
                {
                    style_id: layout.style_id,
                    catalog_id: layout.catalog_id
                }
            ])
        );
    }

    const priceRuleIds = baseRules.filter(rule => rule.rule_type === "price").map(rule => rule.id);

    const priceOverridesByScheduleId = new Map<string, PriceRuleProductOverride[]>();
    if (priceRuleIds.length > 0) {
        const { data: priceOverridesData, error: priceOverridesError } = await supabase
            .from("schedule_price_overrides")
            .select(
                `
                schedule_id,
                product_id,
                override_price,
                show_original_price,
                product:products(
                    name
                )
                `
            )
            .in("schedule_id", priceRuleIds);

        if (priceOverridesError) throw priceOverridesError;

        for (const row of (priceOverridesData ?? []) as RawPriceOverrideRow[]) {
            const current = priceOverridesByScheduleId.get(row.schedule_id) ?? [];
            current.push({
                product_id: row.product_id,
                product_name: normalizeOne(row.product)?.name ?? null,
                override_price: Number(row.override_price),
                show_original_price: row.show_original_price
            });
            priceOverridesByScheduleId.set(row.schedule_id, current);
        }
    }

    const visibilityRuleIds = baseRules
        .filter(rule => rule.rule_type === "visibility")
        .map(rule => rule.id);

    const visibilityOverrideRowsByScheduleId = new Map<string, RawVisibilityOverrideRow[]>();
    if (visibilityRuleIds.length > 0) {
        const visibilityOverrideRows = await selectVisibilityOverridesWithModeFallback(
            visibilityRuleIds
        );
        for (const row of visibilityOverrideRows) {
            const current = visibilityOverrideRowsByScheduleId.get(row.schedule_id) ?? [];
            current.push(row);
            visibilityOverrideRowsByScheduleId.set(row.schedule_id, current);
        }
    }

    const allRuleIds = baseRules.map(r => r.id);

    // Load multi-target entries from join table
    const scheduleTargetsByScheduleId = new Map<string, RawScheduleTargetRow[]>();
    if (allRuleIds.length > 0) {
        const { data: targetsData, error: targetsError } = await supabase
            .from("schedule_targets")
            .select("schedule_id, target_type, target_id")
            .in("schedule_id", allRuleIds);

        if (!targetsError && targetsData) {
            for (const row of targetsData as RawScheduleTargetRow[]) {
                const arr = scheduleTargetsByScheduleId.get(row.schedule_id) ?? [];
                arr.push(row);
                scheduleTargetsByScheduleId.set(row.schedule_id, arr);
            }
        }
        // If schedule_targets doesn't exist yet (pre-migration), silently fall back
    }

    // Determine apply_to_all from DB column OR legacy system-group detection
    // We also need to resolve target_group for the legacy column
    const activityGroupIds = Array.from(
        new Set(
            baseRules
                .filter(rule => rule.target_type === "activity_group")
                .map(rule => rule.target_id)
        )
    );

    let groupById = new Map<string, ActivityGroupRow>();
    if (activityGroupIds.length > 0) {
        const { data: groupsData, error: groupsError } = await supabase
            .from("activity_groups")
            .select("id, name, is_system")
            .in("id", activityGroupIds);

        if (groupsError) throw groupsError;

        groupById = new Map(
            ((groupsData ?? []) as ActivityGroupRow[]).map(group => [group.id, group])
        );
    }

    const featuredContentsByScheduleId = new Map<string, LayoutRuleFeaturedContent[]>();
    if (layoutRuleIds.length > 0) {
        const { data: fcData, error: fcError } = await supabase
            .from("schedule_featured_contents")
            .select(
                `
                schedule_id,
                featured_content_id,
                slot,
                sort_order,
                featured_content:featured_contents(title)
            `
            )
            .in("schedule_id", layoutRuleIds)
            .order("sort_order", { ascending: true });

        if (fcError) throw fcError;

        for (const row of (fcData ?? []) as RawScheduleFeaturedContentRow[]) {
            const current = featuredContentsByScheduleId.get(row.schedule_id) ?? [];
            current.push({
                featured_content_id: row.featured_content_id,
                slot: row.slot as "hero" | "before_catalog" | "after_catalog",
                sort_order: row.sort_order,
                featured_content_title: normalizeOne(row.featured_content)?.title ?? null
            });
            featuredContentsByScheduleId.set(row.schedule_id, current);
        }
    }

    return baseRules.map(rule => {
        const targetGroup =
            rule.target_type === "activity_group" ? (groupById.get(rule.target_id) ?? null) : null;

        // Determine applyToAll:
        // - Prefer explicit apply_to_all column when available.
        // - Fall back to legacy system-group detection for old schemas.
        const targets = scheduleTargetsByScheduleId.get(rule.id) ?? [];
        const isLegacySystemGroup = targetGroup?.is_system === true;
        const rowApplyToAll = applyToAllByScheduleId.get(rule.id);
        const hasApplyToAllFlag = typeof rowApplyToAll === "boolean";

        // If apply_to_all is present on row, treat schema as migrated even when join-table is empty.
        const hasMigrated =
            hasApplyToAllFlag || scheduleTargetsByScheduleId.has(rule.id) || targets.length > 0;

        let applyToAll =
            typeof rowApplyToAll === "boolean" ? rowApplyToAll : isLegacySystemGroup;
        let activityIds: string[] = [];
        let groupIds: string[] = [];

        if (hasMigrated) {
            // targets is the source of truth if migration has run
            activityIds = targets.filter(t => t.target_type === "activity").map(t => t.target_id);
            groupIds = targets
                .filter(t => t.target_type === "activity_group")
                .map(t => t.target_id);
            if (typeof rowApplyToAll !== "boolean") {
                applyToAll = activityIds.length === 0 && groupIds.length === 0;
            }
        } else {
            // Legacy fallback: single target
            if (!isLegacySystemGroup) {
                if (rule.target_type === "activity") {
                    activityIds = [rule.target_id];
                } else if (rule.target_type === "activity_group") {
                    groupIds = [rule.target_id];
                }
            }
        }

        const visibilityOverrides =
            rule.rule_type === "visibility"
                ? (visibilityOverrideRowsByScheduleId.get(rule.id) ?? []).flatMap(row => {
                      if (row.visible === true) {
                          // Legacy explicit "visible=true" rows mean "do not impact this product".
                          return [];
                      }

                      const modeFromRow = normalizeVisibilityMode(row.mode ?? null);
                      const legacyMode =
                          row.visible === false ? (rule.visibility_mode ?? "hide") : null;
                      const effectiveMode = modeFromRow ?? legacyMode;

                      if (!effectiveMode) return [];

                      return [
                          {
                              product_id: row.product_id,
                              product_name: normalizeOne(row.product)?.name ?? null,
                              mode: effectiveMode
                          }
                      ];
                  })
                : [];

        return {
            ...rule,
            target_group: targetGroup,
            applyToAll,
            activityIds,
            groupIds,
            visibility_mode: rule.visibility_mode ?? "hide",
            layout: rule.rule_type === "layout" ? (layoutByScheduleId.get(rule.id) ?? null) : null,
            price_overrides:
                rule.rule_type === "price" ? (priceOverridesByScheduleId.get(rule.id) ?? []) : [],
            visibility_overrides: visibilityOverrides,
            featured_contents:
                rule.rule_type === "layout" ? (featuredContentsByScheduleId.get(rule.id) ?? []) : []
        };
    });
}

export async function listLayoutRuleOptions(tenantId: string): Promise<{
    activities: LayoutRuleOption[];
    activityGroups: LayoutRuleOption[];
    catalogs: LayoutRuleOption[];
    styles: LayoutRuleOption[];
    products: LayoutRuleOption[];
    productGroups: LayoutRuleOption[];
    productGroupItems: ProductGroupAssignmentOption[];
    featuredContents: LayoutRuleOption[];
}> {
    const [
        activitiesRes,
        activityGroupsRes,
        catalogsRes,
        stylesRes,
        productsRes,
        productGroupsRes,
        productGroupItemsRes,
        featuredRes
    ] =
        await Promise.all([
            supabase
                .from("activities")
                .select("id, name, tenant_id")
                .eq("tenant_id", tenantId)
                .order("name", { ascending: true }),
            supabase
                .from("activity_groups")
                .select("id, name, tenant_id, is_system")
                .eq("tenant_id", tenantId)
                .order("name", { ascending: true }),
            supabase
                .from("catalogs")
                .select("id, name, tenant_id")
                .eq("tenant_id", tenantId)
                .order("name", { ascending: true }),
            supabase
                .from("styles")
                .select(
                    "id, name, tenant_id, is_system, current_version:style_versions!current_version_id(version)"
                )
                .eq("tenant_id", tenantId)
                .eq("is_active", true)
                .order("name", { ascending: true }),
            supabase
                .from("products")
                .select("id, name, tenant_id")
                .eq("tenant_id", tenantId)
                .order("name", { ascending: true }),
            supabase
                .from("product_groups")
                .select("id, name, tenant_id")
                .order("name", { ascending: true }),
            supabase
                .from("product_group_items")
                .select("product_id, group_id, tenant_id"),
            supabase
                .from("featured_contents")
                .select("id, title, tenant_id")
                .eq("tenant_id", tenantId)
                .eq("status", "published")
                .order("title", { ascending: true })
        ]);

    if (activitiesRes.error) throw activitiesRes.error;
    if (activityGroupsRes.error) throw activityGroupsRes.error;
    if (catalogsRes.error) throw catalogsRes.error;
    if (stylesRes.error) throw stylesRes.error;
    if (productsRes.error) throw productsRes.error;
    if (productGroupsRes.error) throw productGroupsRes.error;
    if (productGroupItemsRes.error) throw productGroupItemsRes.error;
    if (featuredRes.error) throw featuredRes.error;

    return {
        activities: (activitiesRes.data ?? []) as LayoutRuleOption[],
        activityGroups: (activityGroupsRes.data ?? []) as LayoutRuleOption[],
        catalogs: (catalogsRes.data ?? []) as LayoutRuleOption[],
        styles: ((stylesRes.data ?? []) as RawStyleOptionRow[]).map(s => ({
            id: s.id,
            name: s.name,
            tenant_id: s.tenant_id,
            is_system: s.is_system,
            current_version: Array.isArray(s.current_version)
                ? s.current_version[0]
                : s.current_version
        })),
        products: (productsRes.data ?? []) as LayoutRuleOption[],
        productGroups: (productGroupsRes.data ?? []) as LayoutRuleOption[],
        productGroupItems: (productGroupItemsRes.data ?? []) as ProductGroupAssignmentOption[],
        featuredContents: (
            (featuredRes.data ?? []) as { id: string; title: string; tenant_id: string }[]
        ).map(fc => ({ id: fc.id, name: fc.title, tenant_id: fc.tenant_id }))
    };
}

export async function createLayoutRule(input: {
    tenantId: string;
    name?: string;
    targetType: "activity" | "activity_group";
    targetId: string;
    catalogId: string;
    styleId: string;
    priority: number;
    enabled: boolean;
    timeMode: LayoutTimeMode;
    daysOfWeek: number[] | null;
    timeFrom: string | null;
    timeTo: string | null;
    featuredContents: Array<{
        featuredContentId: string;
        slot: "hero" | "before_catalog" | "after_catalog";
        sortOrder: number;
    }>;
}): Promise<void> {
    const schedule = await insertScheduleWithNameFallback(
        {
            tenant_id: input.tenantId,
            rule_type: "layout",
            target_type: input.targetType,
            target_id: input.targetId,
            priority: input.priority,
            enabled: input.enabled,
            time_mode: input.timeMode,
            days_of_week: input.daysOfWeek,
            time_from: input.timeFrom,
            time_to: input.timeTo
        },
        input.name
    );

    const scheduleId = schedule.id;

    const { error: layoutError } = await supabase.from("schedule_layout").insert({
        tenant_id: input.tenantId,
        schedule_id: scheduleId,
        style_id: input.styleId,
        catalog_id: input.catalogId
    });

    if (layoutError) {
        await supabase.from("schedules").delete().eq("id", scheduleId);
        throw layoutError;
    }

    if (input.featuredContents && input.featuredContents.length > 0) {
        const { error: fcError } = await supabase.from("schedule_featured_contents").insert(
            input.featuredContents.map(fc => ({
                tenant_id: input.tenantId,
                schedule_id: scheduleId,
                featured_content_id: fc.featuredContentId,
                slot: fc.slot,
                sort_order: fc.sortOrder
            }))
        );

        if (fcError) {
            await supabase.from("schedules").delete().eq("id", scheduleId);
            throw fcError;
        }
    }
}

export async function createPriceRule(input: {
    tenantId: string;
    name?: string;
    targetType: "activity" | "activity_group";
    targetId: string;
    priority: number;
    enabled: boolean;
    timeMode: LayoutTimeMode;
    daysOfWeek: number[] | null;
    timeFrom: string | null;
    timeTo: string | null;
    products: Array<{
        productId: string;
        overridePrice: number;
        showOriginalPrice: boolean;
    }>;
}): Promise<void> {
    if (input.products.length === 0) {
        throw new Error("At least one product is required for price rules.");
    }

    const schedule = await insertScheduleWithNameFallback(
        {
            tenant_id: input.tenantId,
            rule_type: "price",
            target_type: input.targetType,
            target_id: input.targetId,
            priority: input.priority,
            enabled: input.enabled,
            time_mode: input.timeMode,
            days_of_week: input.daysOfWeek,
            time_from: input.timeFrom,
            time_to: input.timeTo
        },
        input.name
    );

    const scheduleId = schedule.id;

    const { error: overridesError } = await supabase.from("schedule_price_overrides").insert(
        input.products.map(product => ({
            tenant_id: input.tenantId,
            schedule_id: scheduleId,
            product_id: product.productId,
            override_price: product.overridePrice,
            show_original_price: product.showOriginalPrice
        }))
    );

    if (!overridesError) return;

    await supabase.from("schedules").delete().eq("id", scheduleId);
    throw overridesError;
}

export async function createVisibilityRule(input: {
    tenantId: string;
    name?: string;
    targetType: "activity" | "activity_group";
    targetId: string;
    priority: number;
    enabled: boolean;
    timeMode: LayoutTimeMode;
    daysOfWeek: number[] | null;
    timeFrom: string | null;
    timeTo: string | null;
    products: Array<{
        productId: string;
        mode: VisibilityMode;
    }>;
}): Promise<void> {
    if (input.products.length === 0) {
        throw new Error("At least one product is required for visibility rules.");
    }

    const schedule = await insertScheduleWithNameFallback(
        {
            tenant_id: input.tenantId,
            rule_type: "visibility",
            target_type: input.targetType,
            target_id: input.targetId,
            priority: input.priority,
            enabled: input.enabled,
            time_mode: input.timeMode,
            days_of_week: input.daysOfWeek,
            time_from: input.timeFrom,
            time_to: input.timeTo
        },
        input.name
    );

    const scheduleId = schedule.id;
    await updateScheduleVisibilityModeFallback(scheduleId, input.products[0]?.mode ?? "hide");

    try {
        await insertVisibilityOverridesWithModeFallback(
            input.tenantId,
            input.products.map(product => ({
                schedule_id: scheduleId,
                product_id: product.productId,
                mode: product.mode
            }))
        );
        return;
    } catch (error) {
        await supabase.from("schedules").delete().eq("id", scheduleId);
        throw error;
    }
}

export async function updateLayoutRule(input: {
    scheduleId: string;
    tenantId: string;
    name?: string | null;
    targetType?: "activity" | "activity_group";
    targetId?: string;
    catalogId: string;
    styleId: string;
    priority: number;
    enabled: boolean;
    timeMode: LayoutTimeMode;
    daysOfWeek: number[] | null;
    timeFrom: string | null;
    timeTo: string | null;
    featuredContents?: Array<{
        featuredContentId: string;
        slot: "hero" | "before_catalog" | "after_catalog";
        sortOrder: number;
    }>;
}): Promise<void> {
    const schedulePatch: {
        priority: number;
        enabled: boolean;
        time_mode: LayoutTimeMode;
        days_of_week: number[] | null;
        time_from: string | null;
        time_to: string | null;
        target_type?: "activity" | "activity_group";
        target_id?: string;
    } = {
        priority: input.priority,
        enabled: input.enabled,
        time_mode: input.timeMode,
        days_of_week: input.daysOfWeek,
        time_from: input.timeFrom,
        time_to: input.timeTo
    };

    if (input.targetType && input.targetId) {
        schedulePatch.target_type = input.targetType;
        schedulePatch.target_id = input.targetId;
    }

    await updateScheduleWithNameFallback({
        scheduleId: input.scheduleId,
        patch: schedulePatch,
        name: input.name
    });

    const { data: existingLayout, error: existingLayoutError } = await supabase
        .from("schedule_layout")
        .select("id")
        .eq("schedule_id", input.scheduleId)
        .maybeSingle();

    if (existingLayoutError) throw existingLayoutError;

    if (existingLayout?.id) {
        const { error: layoutUpdateError } = await supabase
            .from("schedule_layout")
            .update({
                style_id: input.styleId,
                catalog_id: input.catalogId
            })
            .eq("id", existingLayout.id);

        if (layoutUpdateError) throw layoutUpdateError;
    } else {
        const { error: layoutInsertError } = await supabase.from("schedule_layout").insert({
            tenant_id: input.tenantId,
            schedule_id: input.scheduleId,
            style_id: input.styleId,
            catalog_id: input.catalogId
        });
        if (layoutInsertError) throw layoutInsertError;
    }

    if (input.featuredContents !== undefined) {
        // Delete existing
        const { error: delError } = await supabase
            .from("schedule_featured_contents")
            .delete()
            .eq("schedule_id", input.scheduleId);

        if (delError) throw delError;

        // Insert new
        if (input.featuredContents.length > 0) {
            const { error: fcInsertError } = await supabase
                .from("schedule_featured_contents")
                .insert(
                    input.featuredContents.map(fc => ({
                        tenant_id: input.tenantId,
                        schedule_id: input.scheduleId,
                        featured_content_id: fc.featuredContentId,
                        slot: fc.slot,
                        sort_order: fc.sortOrder
                    }))
                );

            if (fcInsertError) throw fcInsertError;
        }
    }
}

export async function getLayoutRuleById(ruleId: string, tenantId: string): Promise<LayoutRule | null> {
    const rules = await listLayoutRules(tenantId);
    return rules.find(rule => rule.id === ruleId) ?? null;
}

export async function createRuleDraft(input: {
    tenantId: string;
    ruleType: RuleType;
    name: string;
    priority?: number;
}): Promise<string> {
    const systemGroupId = await getSystemActivityGroupId(input.tenantId);
    if (!systemGroupId) {
        throw new Error("Gruppo di sistema 'Tutte le sedi' mancante.");
    }

    const schedule = await insertScheduleWithNameFallback(
        {
            tenant_id: input.tenantId,
            rule_type: input.ruleType,
            target_type: "activity_group",
            target_id: systemGroupId,
            priority: input.priority ?? 10,
            enabled: false,
            time_mode: "always",
            days_of_week: null,
            time_from: null,
            time_to: null
        },
        input.name
    );

    const { error: applyToAllError } = await supabase
        .from("schedules")
        .update({ apply_to_all: true })
        .eq("id", schedule.id);
    if (applyToAllError && !isMissingColumnError(applyToAllError, "apply_to_all")) {
        throw applyToAllError;
    }

    const { error: deleteTargetsError } = await supabase
        .from("schedule_targets")
        .delete()
        .eq("schedule_id", schedule.id);
    if (deleteTargetsError && !isMissingColumnError(deleteTargetsError, "schedule_targets")) {
        console.warn("schedule_targets delete failed:", deleteTargetsError);
    }

    if (input.ruleType === "visibility") {
        await updateScheduleVisibilityModeFallback(schedule.id, "hide");
    }

    return schedule.id;
}

export async function updateRule(input: {
    scheduleId: string;
    tenantId: string;
    ruleType: RuleType;
    name?: string | null;
    // Multi-target fields
    applyToAll: boolean;
    activityIds: string[];
    groupIds: string[];
    // Legacy fallback target (kept for backward compat with Edge Functions)
    targetType: RuleTargetType;
    targetId: string;
    priority: number;
    enabled: boolean;
    timeMode: LayoutTimeMode;
    daysOfWeek: number[] | null;
    timeFrom: string | null;
    timeTo: string | null;
    layout?: {
        catalogId: string | null;
        styleId: string | null;
        featuredContents: Array<{
            featuredContentId: string;
            slot: "hero" | "before_catalog" | "after_catalog";
            sortOrder: number;
        }>;
    };
    priceProducts?: Array<{
        productId: string;
        overridePrice: number;
        showOriginalPrice: boolean;
    }>;
    visibilityProductOverrides?: Array<{
        productId: string;
        mode: VisibilityMode;
    }>;
}): Promise<void> {
    // Update schedules (legacy target fields kept in sync + apply_to_all)
    const { error: scheduleUpdateError } = await supabase
        .from("schedules")
        .update({
            apply_to_all: input.applyToAll,
            target_type: input.targetType,
            target_id: input.targetId
        })
        .eq("id", input.scheduleId);
    if (scheduleUpdateError) {
        if (!isMissingColumnError(scheduleUpdateError, "apply_to_all")) {
            throw scheduleUpdateError;
        }

        const { error: legacyTargetUpdateError } = await supabase
            .from("schedules")
            .update({
                target_type: input.targetType,
                target_id: input.targetId
            })
            .eq("id", input.scheduleId);

        if (legacyTargetUpdateError) throw legacyTargetUpdateError;
    }

    await updateScheduleWithNameFallback({
        scheduleId: input.scheduleId,
        patch: {
            priority: input.priority,
            enabled: input.enabled,
            time_mode: input.timeMode,
            days_of_week: input.daysOfWeek,
            time_from: input.timeFrom,
            time_to: input.timeTo
        },
        name: input.name
    });

    // Sync join table: delete existing targets, then insert new ones
    const { error: deleteTargetsError } = await supabase
        .from("schedule_targets")
        .delete()
        .eq("schedule_id", input.scheduleId);
    if (deleteTargetsError && !isMissingColumnError(deleteTargetsError, "schedule_targets")) {
        // Silently ignore if table doesn't exist yet (pre-migration)
        console.warn("schedule_targets delete failed (pre-migration?):", deleteTargetsError);
    }

    if (!input.applyToAll) {
        const targetRows: Array<{ schedule_id: string; target_type: string; target_id: string }> = [
            ...input.activityIds.map(id => ({
                schedule_id: input.scheduleId,
                target_type: "activity" as const,
                target_id: id
            })),
            ...input.groupIds.map(id => ({
                schedule_id: input.scheduleId,
                target_type: "activity_group" as const,
                target_id: id
            }))
        ];

        if (targetRows.length > 0) {
            const { error: insertTargetsError } = await supabase
                .from("schedule_targets")
                .insert(targetRows);
            if (
                insertTargetsError &&
                !isMissingColumnError(insertTargetsError, "schedule_targets")
            ) {
                console.warn("schedule_targets insert failed:", insertTargetsError);
            }
        }
    }

    if (input.ruleType === "layout") {
        const { data: existingLayout, error: existingLayoutError } = await supabase
            .from("schedule_layout")
            .select("id")
            .eq("schedule_id", input.scheduleId)
            .maybeSingle();

        if (existingLayoutError) throw existingLayoutError;

        const styleId = input.layout?.styleId ?? null;

        if (styleId !== null) {
            const layoutPatch = {
                style_id: styleId,
                catalog_id: input.layout?.catalogId ?? null
            };

            if (existingLayout?.id) {
                const { error: layoutUpdateError } = await supabase
                    .from("schedule_layout")
                    .update(layoutPatch)
                    .eq("id", existingLayout.id);

                if (layoutUpdateError) throw layoutUpdateError;
            } else {
                const { error: layoutInsertError } = await supabase.from("schedule_layout").insert({
                    tenant_id: input.tenantId,
                    schedule_id: input.scheduleId,
                    ...layoutPatch
                });
                if (layoutInsertError) throw layoutInsertError;
            }
        }
        // styleId is null → rule stays draft, skip insert/update silently

        const { error: deleteFcError } = await supabase
            .from("schedule_featured_contents")
            .delete()
            .eq("schedule_id", input.scheduleId);
        if (deleteFcError) throw deleteFcError;

        const featuredContents = input.layout?.featuredContents ?? [];
        if (featuredContents.length > 0) {
            const { error: insertFcError } = await supabase
                .from("schedule_featured_contents")
                .insert(
                    featuredContents.map(fc => ({
                        tenant_id: input.tenantId,
                        schedule_id: input.scheduleId,
                        featured_content_id: fc.featuredContentId,
                        slot: fc.slot,
                        sort_order: fc.sortOrder
                    }))
                );
            if (insertFcError) throw insertFcError;
        }
        return;
    }

    if (input.ruleType === "price") {
        const { error: deleteError } = await supabase
            .from("schedule_price_overrides")
            .delete()
            .eq("schedule_id", input.scheduleId);
        if (deleteError) throw deleteError;

        const products = input.priceProducts ?? [];
        if (products.length > 0) {
            const { error: insertError } = await supabase
                .from("schedule_price_overrides")
                .insert(
                    products.map(product => ({
                        tenant_id: input.tenantId,
                        schedule_id: input.scheduleId,
                        product_id: product.productId,
                        override_price: product.overridePrice,
                        show_original_price: product.showOriginalPrice
                    }))
                );
            if (insertError) throw insertError;
        }
        return;
    }

    const visibilityProductOverrides = input.visibilityProductOverrides ?? [];
    await updateScheduleVisibilityModeFallback(
        input.scheduleId,
        visibilityProductOverrides[0]?.mode ?? "hide"
    );

    const { error: deleteError } = await supabase
        .from("schedule_visibility_overrides")
        .delete()
        .eq("schedule_id", input.scheduleId);
    if (deleteError) throw deleteError;

    if (visibilityProductOverrides.length > 0) {
        await insertVisibilityOverridesWithModeFallback(
            input.tenantId,
            visibilityProductOverrides.map(product => ({
                schedule_id: input.scheduleId,
                product_id: product.productId,
                mode: product.mode
            }))
        );
    }
}

export async function deleteLayoutRule(scheduleId: string): Promise<void> {
    const { error } = await supabase.from("schedules").delete().eq("id", scheduleId);

    if (error) throw error;
}

export async function updateScheduleEnabled(scheduleId: string, enabled: boolean): Promise<void> {
    const { error } = await supabase.from("schedules").update({ enabled }).eq("id", scheduleId);

    if (error) throw error;
}
