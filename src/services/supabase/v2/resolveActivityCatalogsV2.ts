import { supabase } from "../client";

export type ResolvedVariant = {
    id: string;
    name: string;
    price?: number;
    attributes?: any[];
    allergens?: any[];
};

export type ResolvedOptionValue = {
    id: string;
    name: string;
    absolute_price: number | null;
    price_modifier: number | null;
};

export type ResolvedOptionGroup = {
    id: string;
    name: string;
    group_kind: "PRIMARY_PRICE" | "ADDON";
    pricing_mode: "ABSOLUTE" | "DELTA";
    is_required: boolean;
    max_selectable: number | null;
    values: ResolvedOptionValue[];
};

export type ResolvedProduct = {
    id: string;
    name: string;
    description?: string;
    price?: number;
    original_price?: number;
    /** Min absolute_price across PRIMARY_PRICE formats. Set when product has formats. */
    from_price?: number;
    is_visible: boolean;
    attributes?: any[];
    allergens?: any[];
    variants?: ResolvedVariant[];
    optionGroups?: ResolvedOptionGroup[];
};

export type ResolvedCategory = {
    id: string;
    name: string;
    level: number;
    sort_order: number;
    products: ResolvedProduct[];
};

export type ResolvedCatalog = {
    id: string;
    name: string;
    categories?: ResolvedCategory[];
};

export type ResolvedStyle = {
    id: string;
    name: string;
    config?: any;
};

export type ResolvedCollections = {
    style?: ResolvedStyle;
    featured?: {
        hero?: V2FeaturedContent[];
        before_catalog?: V2FeaturedContent[];
        after_catalog?: V2FeaturedContent[];
    };
    catalog?: ResolvedCatalog;
};

type ScheduleSlot = "primary" | "overlay";

export type V2FeaturedContent = {
    id: string;
    internal_name: string;
    title: string;
    subtitle: string | null;
    description: string | null;
    media_id: string | null;
    cta_text: string | null;
    cta_url: string | null;
    status: "draft" | "published";
    layout_style: string | null;
    pricing_mode: "none" | "per_item" | "bundle";
    bundle_price: number | null;
    show_original_total: boolean;
    products?: Array<{
        sort_order: number | null;
        note: string | null;
        product: {
            id: string;
            name: string;
            description: string | null;
            base_price: number | null;
        } | null;
    }>;
    created_at: string;
    updated_at: string;
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
    catalog?: ResolvedCatalog;
    styleData?: ResolvedStyle;
};

type RawAllergenRow = {
    allergen: {
        id: number;
        code: string;
        label_it: string;
        label_en: string;
    } | null;
};

type RawAttributeDefRow = {
    code: string;
    label: string;
    type: string;
};

type RawAttributeValueRow = {
    attribute_definition_id: string;
    value_text: string | null;
    value_number: number | null;
    value_boolean: boolean | null;
    value_json: any | null;
    definition: RawAttributeDefRow | null;
};

type RawVariantRow = {
    id: string;
    name: string;
    base_price: number | null;
    attributes: RawAttributeValueRow[] | RawAttributeValueRow | null;
    allergens: RawAllergenRow[] | RawAllergenRow | null;
};

type RawProductRow = {
    id: string;
    name: string;
    description: string | null;
    base_price: number | null;
    variants: RawVariantRow[] | RawVariantRow | null;
    attributes: RawAttributeValueRow[] | RawAttributeValueRow | null;
    allergens: RawAllergenRow[] | RawAllergenRow | null;
};

type RawCategoryProductRow = {
    id: string;
    sort_order: number;
    product: RawProductRow | RawProductRow[] | null;
};

type RawCategoryRow = {
    id: string;
    name: string;
    level: number;
    sort_order: number;
    parent_category_id: string | null;
    products: RawCategoryProductRow[] | RawCategoryProductRow | null;
};

type RawOptionValueRow = {
    id: string;
    name: string;
    absolute_price: number | null;
    price_modifier: number | null;
};

type RawOptionGroupRow = {
    id: string;
    name: string;
    group_kind: string;
    pricing_mode: string;
    is_required: boolean;
    max_selectable: number | null;
    values: RawOptionValueRow[] | RawOptionValueRow | null;
};

type RawStyleVersionRow = {
    config: any;
};

type RawStyleRow = {
    id: string;
    name: string;
    current_version: RawStyleVersionRow | RawStyleVersionRow[] | null;
};

type RawCatalogRow = {
    id: string;
    name: string;
    categories: RawCategoryRow[] | RawCategoryRow | null;
};

type RawScheduleLayoutRow = {
    catalog_id: string | null;
    style: RawStyleRow | RawStyleRow[] | null;
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
    return Array.isArray(value) ? (value[0] ?? null) : value;
}

function normalizeMany<T>(value: T[] | T | null | undefined): T[] {
    if (!value) return [];
    return Array.isArray(value) ? value : [value];
}

function normalizeCatalog(
    raw: RawCatalogRow | RawCatalogRow[] | null
): ResolvedCatalog | undefined {
    const catalog = normalizeOne(raw);
    if (!catalog) return undefined;

    const categories = normalizeMany(catalog.categories)
        .slice()
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
        .map(cat => {
            const products = normalizeMany(cat.products)
                .slice()
                .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
                .map(cp => {
                    const p = normalizeOne(cp.product);
                    if (!p) return null;

                    const mapAttributes = (rows: any) =>
                        normalizeMany(rows).map(a => {
                            const def = normalizeOne(a.definition);
                            return {
                                attribute_definition_id: a.attribute_definition_id,
                                value_text: a.value_text,
                                value_number: a.value_number,
                                value_boolean: a.value_boolean,
                                value_json: a.value_json,
                                definition: def
                                    ? {
                                          code: def.code,
                                          label: def.label,
                                          type: def.type
                                      }
                                    : null
                            };
                        });

                    const mapAllergens = (rows: any) =>
                        normalizeMany(rows)
                            .map(al => {
                                const allergen = normalizeOne(al.allergen);
                                return allergen
                                    ? {
                                          id: allergen.id,
                                          code: allergen.code,
                                          label_it: allergen.label_it,
                                          label_en: allergen.label_en
                                      }
                                    : null;
                            })
                            .filter(Boolean);

                    const pAttrs = mapAttributes(p.attributes);
                    const pAllergens = mapAllergens(p.allergens);
                    const pVariants = normalizeMany(p.variants).map(v => {
                        const vAttrs = mapAttributes(v.attributes);
                        const vAllergens = mapAllergens(v.allergens);
                        return {
                            id: v.id,
                            name: v.name,
                            ...(v.base_price !== null ? { price: v.base_price } : {}),
                            ...(vAttrs.length > 0 ? { attributes: vAttrs } : {}),
                            ...(vAllergens.length > 0 ? { allergens: vAllergens } : {})
                        };
                    });

                    const optionGroupsRaw = normalizeMany<RawOptionGroupRow>(
                        (p as any).option_groups
                    );
                    const resolvedOptionGroups: ResolvedOptionGroup[] = optionGroupsRaw.map(og => ({
                        id: og.id,
                        name: og.name,
                        group_kind: (og.group_kind as "PRIMARY_PRICE" | "ADDON") || "ADDON",
                        pricing_mode: (og.pricing_mode as "ABSOLUTE" | "DELTA") || "DELTA",
                        is_required: og.is_required ?? false,
                        max_selectable: og.max_selectable ?? null,
                        values: normalizeMany<RawOptionValueRow>(og.values).map(v => ({
                            id: v.id,
                            name: v.name,
                            absolute_price: v.absolute_price ?? null,
                            price_modifier: v.price_modifier ?? null
                        }))
                    }));

                    // Compute from_price: min absolute_price in PRIMARY_PRICE group
                    let from_price: number | undefined = undefined;
                    const primaryGroup = resolvedOptionGroups.find(
                        og => og.group_kind === "PRIMARY_PRICE" && og.pricing_mode === "ABSOLUTE"
                    );
                    if (primaryGroup && primaryGroup.values.length > 0) {
                        const validPrices = primaryGroup.values
                            .map(v => v.absolute_price)
                            .filter((p): p is number => p !== null);
                        if (validPrices.length > 0) {
                            from_price = Math.min(...validPrices);
                        }
                    }

                    const resolvedProduct: ResolvedProduct = {
                        id: p.id,
                        name: p.name,
                        is_visible: true, // overridden later
                        ...(p.description ? { description: p.description } : {}),
                        ...(p.base_price !== null ? { price: p.base_price } : {}),
                        ...(from_price !== undefined ? { from_price } : {}),
                        ...(pAttrs.length > 0 ? { attributes: pAttrs } : {}),
                        ...(pAllergens.length > 0 ? { allergens: pAllergens } : {}),
                        ...(pVariants.length > 0 ? { variants: pVariants } : {}),
                        ...(resolvedOptionGroups.length > 0
                            ? { optionGroups: resolvedOptionGroups }
                            : {})
                    };

                    return resolvedProduct;
                })
                .filter((p): p is ResolvedProduct => p !== null);

            const resolvedCategory: ResolvedCategory = {
                id: cat.id,
                name: cat.name,
                level: cat.level,
                sort_order: cat.sort_order,
                products
            };

            return resolvedCategory;
        });

    return {
        id: catalog.id,
        name: catalog.name,
        ...(categories.length > 0 ? { categories } : {})
    };
}

async function loadCatalogById(catalogId: string): Promise<ResolvedCatalog | undefined> {
    const { data, error } = await supabase
        .from("v2_catalogs")
        .select(
            `
            id,
            name,
            categories:v2_catalog_categories(
              id,
              name,
              level,
              sort_order,
              parent_category_id,
              products:v2_catalog_category_products(
                id,
                sort_order,
                product:v2_products(
                  id,
                  name,
                  description,
                  base_price,
                  option_groups:v2_product_option_groups(
                    id,
                    name,
                    group_kind,
                    pricing_mode,
                    is_required,
                    max_selectable,
                    values:v2_product_option_values(
                      id,
                      name,
                      absolute_price,
                      price_modifier
                    )
                  ),
                  variants:v2_products(
                    id,
                    name,
                    base_price,
                    attributes:v2_product_attribute_values(
                        attribute_definition_id,
                        value_text,
                        value_number,
                        value_boolean,
                        value_json,
                        definition:v2_product_attribute_definitions(
                            code,
                            label,
                            type
                        )
                    ),
                    allergens:v2_product_allergens(
                        allergen:v2_allergens(
                            id,
                            code,
                            label_it,
                            label_en
                        )
                    )
                  ),
                  attributes:v2_product_attribute_values(
                      attribute_definition_id,
                      value_text,
                      value_number,
                      value_boolean,
                      value_json,
                      definition:v2_product_attribute_definitions(
                          code,
                          label,
                          type
                      )
                  ),
                  allergens:v2_product_allergens(
                      allergen:v2_allergens(
                          id,
                          code,
                          label_it,
                          label_en
                      )
                  )
                )
              )
            )
        `
        )
        .eq("id", catalogId)
        .maybeSingle();

    if (error) throw error;

    const normalizedCatalog = normalizeCatalog((data as unknown as RawCatalogRow | null) ?? null);

    // DEBUG START
    console.log("[resolveActivityCatalogsV2][loadCatalogById] catalog counts", {
        catalogId,
        categoriesCount: normalizedCatalog?.categories?.length ?? 0
    });
    // DEBUG END

    return normalizedCatalog;
}

function isTimeRuleActiveNow(
    rule: Pick<RawLayoutRuleRow, "time_mode" | "days_of_week" | "time_from" | "time_to">,
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

async function findLayoutCatalogId(
    activityId: string,
    now: Date
): Promise<{ catalogId: string | null; scheduleId: string | null; styleData?: ResolvedStyle }> {
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
                    catalog_id,
                    style:v2_styles(
                        id,
                        name,
                        current_version:v2_style_versions!v2_styles_current_version_id_fkey(
                            config
                        )
                    )
                )
                `
            )
            .eq("rule_type", "layout")
            .eq("enabled", true)
            .eq("target_type", "activity")
            .eq("target_id", activityId)
            .order("priority", { ascending: true })
            .order("created_at", { ascending: true }),
        supabase.from("v2_activity_group_members").select("group_id").eq("activity_id", activityId)
    ]);

    if (activityRulesRes.error) throw activityRulesRes.error;
    if (groupMembersRes.error) throw groupMembersRes.error;

    const activityRows = (activityRulesRes.data ?? []) as RawLayoutRuleRow[];
    const groupIds = Array.from(
        new Set(
            ((groupMembersRes.data ?? []) as RawActivityGroupMemberRow[]).map(row => row.group_id)
        )
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
                    catalog_id,
                    style:v2_styles(
                        id,
                        name,
                        current_version:v2_style_versions!v2_styles_current_version_id_fkey(
                            config
                        )
                    )
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

    const layoutRow = normalizeOne(selectedRule?.layout);
    const catalogId = layoutRow?.catalog_id ?? null;

    const styleObj = normalizeOne(layoutRow?.style);
    const styleVersion = styleObj ? normalizeOne(styleObj.current_version) : null;
    const styleData: ResolvedStyle | undefined = styleObj
        ? {
              id: styleObj.id,
              name: styleObj.name,
              ...(styleVersion?.config ? { config: styleVersion.config } : {})
          }
        : undefined;

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

    return {
        catalogId,
        scheduleId: selectedRule?.id ?? null,
        styleData
    };
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
        supabase.from("v2_activity_group_members").select("group_id").eq("activity_id", activityId)
    ]);

    if (activityRulesRes.error) throw activityRulesRes.error;
    if (groupMembersRes.error) throw groupMembersRes.error;

    const activityRows = (activityRulesRes.data ?? []) as RawPriceRuleRow[];
    const groupIds = Array.from(
        new Set(
            ((groupMembersRes.data ?? []) as RawActivityGroupMemberRow[]).map(row => row.group_id)
        )
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

async function findActiveVisibilityRuleScheduleId(
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
            .eq("rule_type", "visibility")
            .eq("enabled", true)
            .eq("target_type", "activity")
            .eq("target_id", activityId)
            .order("priority", { ascending: true })
            .order("created_at", { ascending: true }),
        supabase.from("v2_activity_group_members").select("group_id").eq("activity_id", activityId)
    ]);

    if (activityRulesRes.error) throw activityRulesRes.error;
    if (groupMembersRes.error) throw groupMembersRes.error;

    const activityRows = (activityRulesRes.data ?? []) as RawVisibilityRuleRow[];
    const groupIds = Array.from(
        new Set(
            ((groupMembersRes.data ?? []) as RawActivityGroupMemberRow[]).map(row => row.group_id)
        )
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
    catalog: ResolvedCatalog | undefined,
    overridesByProductId: Record<string, VisibilityOverrideRow>
): ResolvedCatalog | undefined {
    if (!catalog) return undefined;

    return {
        ...catalog,
        ...(catalog.categories
            ? {
                  categories: catalog.categories
                      .map(category => ({
                          ...category,
                          products: category.products
                              .map(item => {
                                  const override = overridesByProductId[item.id];
                                  const effectiveVisible = override?.visible ?? item.is_visible;

                                  return {
                                      ...item,
                                      is_visible: effectiveVisible
                                  };
                              })
                              .filter(item => item.is_visible === true)
                      }))
                      .filter(category => category.products.length > 0)
              }
            : {})
    };
}

function applyPriceOverridesToCatalog(
    catalog: ResolvedCatalog | undefined,
    overridesByProductId: Record<string, PriceOverrideRow>
): ResolvedCatalog | undefined {
    if (!catalog) return undefined;

    return {
        ...catalog,
        ...(catalog.categories
            ? {
                  categories: catalog.categories.map(category => ({
                      ...category,
                      products: category.products.map(item => {
                          const override = overridesByProductId[item.id];
                          console.log(
                              "Product price check:",
                              item.id,
                              "base:",
                              item.price,
                              "override:",
                              override?.override_price
                          );
                          if (!override) return item;

                          return {
                              ...item,
                              price: override.override_price,
                              ...(override.show_original_price
                                  ? { original_price: item.price }
                                  : {})
                          };
                      })
                  }))
              }
            : {})
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
    const categories = schedule.catalog?.categories ?? [];

    for (const category of categories) {
        for (const item of category.products) {
            const override = overridesByProductId[item.id];
            const visible = override?.visible_override ?? item.is_visible;
            if (visible) return true;
        }
    }

    return false;
}

export async function resolveActivityCatalogsV2(
    activityId: string,
    now: Date = new Date()
): Promise<ResolvedCollections> {
    // ------------------------------------------------------------------------
    // CACHING STRATEGY (Placeholder for future implementation)
    // ------------------------------------------------------------------------
    // Ideal implementation:
    // Const cacheKey = `v2_activity_catalog:${activityId}`;
    // Const cachedValue = await redis.get(cacheKey);
    // if (cachedValue) return JSON.parse(cachedValue);
    //
    // The fully resolved payload (ResolvedCollections) should be cached here.
    // Invalidation strategy:
    // - TTL: 5 minutes automatic expiry
    // - Manual invalidation on any catalog/schedule save event
    // ------------------------------------------------------------------------

    const {
        catalogId: layoutCatalogId,
        scheduleId: layoutScheduleId,
        styleData
    } = await findLayoutCatalogId(activityId, now);

    // DEBUG START
    console.log("[resolveActivityCatalogsV2] layoutCatalogId", {
        activityId,
        layoutCatalogId,
        layoutScheduleId
    });
    // DEBUG END

    const featured: ResolvedCollections["featured"] = {
        hero: [],
        before_catalog: [],
        after_catalog: []
    };

    if (layoutScheduleId) {
        const { data: featuredData, error: featuredError } = await supabase
            .from("v2_schedule_featured_contents")
            .select(
                `
                slot,
                sort_order,
                featured_content:v2_featured_contents(
                    id,
                    internal_name,
                    title,
                    subtitle,
                    description,
                    media_id,
                    cta_text,
                    cta_url,
                    status,
                    layout_style,
                    pricing_mode,
                    bundle_price,
                    show_original_total,
                    created_at,
                    updated_at,
                    products:v2_featured_content_products(
                        sort_order,
                        note,
                        product:v2_products(
                            id,
                            name,
                            description,
                            base_price
                        )
                    )
                )
            `
            )
            .eq("schedule_id", layoutScheduleId);

        if (featuredError) {
            console.error(
                "[resolveActivityCatalogsV2] error fetching featured contents",
                featuredError
            );
        } else if (featuredData) {
            type RawFeaturedJoin = {
                slot: "hero" | "before_catalog" | "after_catalog";
                sort_order: number;
                featured_content: V2FeaturedContent | V2FeaturedContent[] | null;
            };

            const validFeaturedItems = (featuredData as unknown as RawFeaturedJoin[])
                .map(row => {
                    const fc = normalizeOne(row.featured_content);
                    return { slot: row.slot, sort_order: row.sort_order, featured_content: fc };
                })
                .filter(
                    (
                        row
                    ): row is {
                        slot: "hero" | "before_catalog" | "after_catalog";
                        sort_order: number;
                        featured_content: V2FeaturedContent;
                    } =>
                        row.featured_content !== null && row.featured_content.status === "published"
                )
                .sort((a, b) => {
                    const slotOrder = { hero: 1, before_catalog: 2, after_catalog: 3 };
                    const aSlot = slotOrder[a.slot] || 99;
                    const bSlot = slotOrder[b.slot] || 99;
                    if (aSlot !== bSlot) return aSlot - bSlot;
                    return a.sort_order - b.sort_order;
                });

            for (const item of validFeaturedItems) {
                if (item.slot === "hero") {
                    if (!featured.hero) featured.hero = [];
                    featured.hero.push(item.featured_content);
                } else if (item.slot === "before_catalog") {
                    if (!featured.before_catalog) featured.before_catalog = [];
                    featured.before_catalog.push(item.featured_content);
                } else if (item.slot === "after_catalog") {
                    if (!featured.after_catalog) featured.after_catalog = [];
                    featured.after_catalog.push(item.featured_content);
                }
            }
        }
    }

    let schedules: V2ActivityScheduleRow[] = [];

    if (!layoutCatalogId) {
        return {
            featured
        };
    }

    const layoutCatalog = await loadCatalogById(layoutCatalogId);

    const categoriesCount = layoutCatalog?.categories?.length ?? 0;
    const itemsCount =
        layoutCatalog?.categories?.reduce(
            (total, category) => total + category.products.length,
            0
        ) ?? 0;

    // DEBUG START
    console.log("[resolveActivityCatalogsV2] layoutCatalog loaded", {
        activityId,
        sectionsCount: categoriesCount,
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
            catalog: layoutCatalog,
            ...(styleData ? { styleData } : {})
        }
    ];

    const productIds = Array.from(
        new Set(
            schedules.flatMap(schedule =>
                (schedule.catalog?.categories ?? []).flatMap(category =>
                    category.products.map(item => item.id)
                )
            )
        )
    );

    const visibilityOverridesByProductId: Record<string, VisibilityOverrideRow> = {};
    const overridesByProductId: Record<string, OverrideRow> = {};
    const priceOverridesByProductId: Record<string, PriceOverrideRow> = {};

    const activeVisibilityRuleScheduleId = await findActiveVisibilityRuleScheduleId(
        activityId,
        now
    );
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
                (schedule.catalog?.categories ?? []).flatMap(category =>
                    category.products.map(item => item.id)
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
        ...(finalPrimary?.styleData ? { style: finalPrimary.styleData } : {}),
        ...(finalPrimary?.catalog ? { catalog: finalPrimary.catalog } : {}),
        ...(Object.keys(featured).length > 0 ? { featured } : {})
    };
}
