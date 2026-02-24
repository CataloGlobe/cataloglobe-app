import { supabase } from "../client";

export type LayoutTimeMode = "always" | "window";
export type RuleType = "layout" | "price" | "visibility";

export type PriceRuleProductOverride = {
    product_id: string;
    product_name: string | null;
    override_price: number;
    show_original_price: boolean;
};

export type VisibilityRuleProductOverride = {
    product_id: string;
    product_name: string | null;
    visible: boolean;
};

export type LayoutRule = {
    id: string;
    tenant_id: string;
    rule_type: RuleType;
    target_type: string;
    target_id: string;
    target_group: {
        id: string;
        name: string;
        is_system: boolean;
    } | null;
    priority: number;
    enabled: boolean;
    time_mode: LayoutTimeMode;
    days_of_week: number[] | null;
    time_from: string | null;
    time_to: string | null;
    created_at: string;
    layout: {
        style_id: string | null;
        catalog_id: string | null;
    } | null;
    price_overrides: PriceRuleProductOverride[];
    visibility_overrides: VisibilityRuleProductOverride[];
};

export type LayoutRuleOption = {
    id: string;
    name: string;
    tenant_id: string;
};

type RawScheduleRow = {
    id: string;
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
    product:
        | {
              name: string | null;
          }
        | {
              name: string | null;
          }[]
        | null;
};

type ActivityGroupRow = {
    id: string;
    name: string;
    is_system: boolean;
};

function normalizeOne<T>(value: T | T[] | null | undefined): T | null {
    if (!value) return null;
    return Array.isArray(value) ? (value[0] ?? null) : value;
}

const systemActivityGroupIdByTenant = new Map<string, string>();

export async function getSystemActivityGroupId(tenantId: string): Promise<string | null> {
    const cached = systemActivityGroupIdByTenant.get(tenantId);
    if (cached) return cached;

    const { data, error } = await supabase
        .from("v2_activity_groups")
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

export async function listLayoutRules(): Promise<LayoutRule[]> {
    const { data, error } = await supabase
        .from("v2_schedules")
        .select(
            `
            id,
            tenant_id,
            rule_type,
            target_type,
            target_id,
            priority,
            enabled,
            time_mode,
            days_of_week,
            time_from,
            time_to,
            created_at
            `
        )
        .order("priority", { ascending: true })
        .order("created_at", { ascending: false });

    if (error) throw error;

    const baseRules = ((data ?? []) as RawScheduleRow[]).map(row => ({
        id: row.id,
        tenant_id: row.tenant_id,
        rule_type: row.rule_type,
        target_type: row.target_type,
        target_id: row.target_id,
        target_group: null,
        priority: row.priority,
        enabled: row.enabled,
        time_mode: row.time_mode,
        days_of_week: row.days_of_week,
        time_from: row.time_from,
        time_to: row.time_to,
        created_at: row.created_at,
        layout: null,
        price_overrides: [],
        visibility_overrides: []
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
            .from("v2_schedule_layout")
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
            .from("v2_schedule_price_overrides")
            .select(
                `
                schedule_id,
                product_id,
                override_price,
                show_original_price,
                product:v2_products(
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

    const visibilityOverridesByScheduleId = new Map<string, VisibilityRuleProductOverride[]>();
    if (visibilityRuleIds.length > 0) {
        const { data: visibilityOverridesData, error: visibilityOverridesError } = await supabase
            .from("v2_schedule_visibility_overrides")
            .select(
                `
                schedule_id,
                product_id,
                visible,
                product:v2_products(
                    name
                )
                `
            )
            .in("schedule_id", visibilityRuleIds);

        if (visibilityOverridesError) throw visibilityOverridesError;

        for (const row of (visibilityOverridesData ?? []) as RawVisibilityOverrideRow[]) {
            const current = visibilityOverridesByScheduleId.get(row.schedule_id) ?? [];
            current.push({
                product_id: row.product_id,
                product_name: normalizeOne(row.product)?.name ?? null,
                visible: row.visible
            });
            visibilityOverridesByScheduleId.set(row.schedule_id, current);
        }
    }

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
            .from("v2_activity_groups")
            .select("id, name, is_system")
            .in("id", activityGroupIds);

        if (groupsError) throw groupsError;

        groupById = new Map(
            ((groupsData ?? []) as ActivityGroupRow[]).map(group => [group.id, group])
        );
    }

    return baseRules.map(rule => ({
        ...rule,
        target_group:
            rule.target_type === "activity_group" ? (groupById.get(rule.target_id) ?? null) : null,
        layout: rule.rule_type === "layout" ? (layoutByScheduleId.get(rule.id) ?? null) : null,
        price_overrides:
            rule.rule_type === "price" ? (priceOverridesByScheduleId.get(rule.id) ?? []) : [],
        visibility_overrides:
            rule.rule_type === "visibility"
                ? (visibilityOverridesByScheduleId.get(rule.id) ?? [])
                : []
    }));
}

export async function listLayoutRuleOptions(): Promise<{
    activities: LayoutRuleOption[];
    catalogs: LayoutRuleOption[];
    styles: LayoutRuleOption[];
    products: LayoutRuleOption[];
}> {
    const [activitiesRes, catalogsRes, stylesRes, productsRes] = await Promise.all([
        supabase
            .from("v2_activities")
            .select("id, name, tenant_id")
            .order("name", { ascending: true }),
        supabase
            .from("v2_catalogs")
            .select("id, name, tenant_id")
            .order("name", { ascending: true }),
        supabase
            .from("v2_styles")
            .select("id, name, tenant_id")
            .eq("is_active", true)
            .order("name", { ascending: true }),
        supabase
            .from("v2_products")
            .select("id, name, tenant_id")
            .order("name", { ascending: true })
    ]);

    if (activitiesRes.error) throw activitiesRes.error;
    if (catalogsRes.error) throw catalogsRes.error;
    if (stylesRes.error) throw stylesRes.error;
    if (productsRes.error) throw productsRes.error;

    return {
        activities: (activitiesRes.data ?? []) as LayoutRuleOption[],
        catalogs: (catalogsRes.data ?? []) as LayoutRuleOption[],
        styles: (stylesRes.data ?? []) as LayoutRuleOption[],
        products: (productsRes.data ?? []) as LayoutRuleOption[]
    };
}

export async function createLayoutRule(input: {
    tenantId: string;
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
}): Promise<void> {
    const { data: schedule, error: scheduleError } = await supabase
        .from("v2_schedules")
        .insert({
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
        })
        .select("id")
        .single();

    if (scheduleError) throw scheduleError;

    const scheduleId = schedule.id;

    const { error: layoutError } = await supabase.from("v2_schedule_layout").insert({
        schedule_id: scheduleId,
        style_id: input.styleId,
        catalog_id: input.catalogId
    });

    if (!layoutError) return;

    await supabase.from("v2_schedules").delete().eq("id", scheduleId);
    throw layoutError;
}

export async function createPriceRule(input: {
    tenantId: string;
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

    const { data: schedule, error: scheduleError } = await supabase
        .from("v2_schedules")
        .insert({
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
        })
        .select("id")
        .single();

    if (scheduleError) throw scheduleError;

    const scheduleId = schedule.id;

    const { error: overridesError } = await supabase.from("v2_schedule_price_overrides").insert(
        input.products.map(product => ({
            schedule_id: scheduleId,
            product_id: product.productId,
            override_price: product.overridePrice,
            show_original_price: product.showOriginalPrice
        }))
    );

    if (!overridesError) return;

    await supabase.from("v2_schedules").delete().eq("id", scheduleId);
    throw overridesError;
}

export async function createVisibilityRule(input: {
    tenantId: string;
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
        visible: boolean;
    }>;
}): Promise<void> {
    if (input.products.length === 0) {
        throw new Error("At least one product is required for visibility rules.");
    }

    const { data: schedule, error: scheduleError } = await supabase
        .from("v2_schedules")
        .insert({
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
        })
        .select("id")
        .single();

    if (scheduleError) throw scheduleError;

    const scheduleId = schedule.id;

    const { error: overridesError } = await supabase
        .from("v2_schedule_visibility_overrides")
        .insert(
            input.products.map(product => ({
                schedule_id: scheduleId,
                product_id: product.productId,
                visible: product.visible
            }))
        );

    if (!overridesError) return;

    await supabase.from("v2_schedules").delete().eq("id", scheduleId);
    throw overridesError;
}

export async function updateLayoutRule(input: {
    scheduleId: string;
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

    const { error: scheduleError } = await supabase
        .from("v2_schedules")
        .update(schedulePatch)
        .eq("id", input.scheduleId);

    if (scheduleError) throw scheduleError;

    const { data: existingLayout, error: existingLayoutError } = await supabase
        .from("v2_schedule_layout")
        .select("id")
        .eq("schedule_id", input.scheduleId)
        .maybeSingle();

    if (existingLayoutError) throw existingLayoutError;

    if (existingLayout?.id) {
        const { error: layoutUpdateError } = await supabase
            .from("v2_schedule_layout")
            .update({
                style_id: input.styleId,
                catalog_id: input.catalogId
            })
            .eq("id", existingLayout.id);

        if (layoutUpdateError) throw layoutUpdateError;
        return;
    }

    const { error: layoutInsertError } = await supabase.from("v2_schedule_layout").insert({
        schedule_id: input.scheduleId,
        style_id: input.styleId,
        catalog_id: input.catalogId
    });

    if (layoutInsertError) throw layoutInsertError;
}

export async function deleteLayoutRule(scheduleId: string): Promise<void> {
    const { error } = await supabase.from("v2_schedules").delete().eq("id", scheduleId);

    if (error) throw error;
}
