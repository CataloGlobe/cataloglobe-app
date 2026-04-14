// ⚠️ SYNC: questo file è duplicato. L'altra copia è in src/services/supabase/resolveActivityCatalogs.ts.
// Qualsiasi modifica va replicata in ENTRAMBI i file.
// Nota: questa versione accetta il client Supabase come parametro (service_role) invece di importare il singleton.

import {
    resolveRulesForActivity,
    type VisibilityMode
} from "./scheduleResolver.ts";
import { getNowInRome, type RomeDateTime } from "./schedulingNow.ts";

// ── Exported resolved types ──────────────────────────────────────────────────

export type ResolvedVariantDimValue = {
    value_id: string;
    value_label: string;
    value_sort_order: number;
    dimension_id: string;
    dimension_name: string;
    dimension_sort_order: number;
};

export type ResolvedAllergen = {
    id: number;
    code: string;
    label_it: string;
    label_en: string;
};

export type ResolvedIngredient = {
    id: string;
    name: string;
};

export type ResolvedVariant = {
    id: string;
    name: string;
    price?: number;
    original_price?: number;
    from_price?: number;
    optionGroups?: ResolvedOptionGroup[];
    image_url?: string;
    description?: string;
    // deno-lint-ignore no-explicit-any
    attributes?: any[];
    allergens?: ResolvedAllergen[];
    ingredients?: ResolvedIngredient[];
    dimension_values?: ResolvedVariantDimValue[];
};

export type ResolvedOptionValue = {
    id: string;
    name: string;
    absolute_price: number | null;
    price_modifier: number | null;
    original_price?: number;
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
    effective_price?: number;
    original_price?: number;
    from_price?: number;
    is_visible: boolean;
    is_disabled?: boolean;
    // deno-lint-ignore no-explicit-any
    attributes?: any[];
    allergens?: ResolvedAllergen[];
    ingredients?: ResolvedIngredient[];
    image_url?: string;
    variants?: ResolvedVariant[];
    optionGroups?: ResolvedOptionGroup[];
    product_type?: string;
    default_variant_id?: string;
    parentSelected: boolean;
    base_price?: number | null;
};

export type ResolvedCategory = {
    id: string;
    name: string;
    level: number;
    sort_order: number;
    parent_category_id: string | null;
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
    // deno-lint-ignore no-explicit-any
    config?: any;
};

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
            image_url: string | null;
            fromPrice: number | null;
            is_from_price: boolean;
            price_variants: Array<{ name: string | null; absolute_price: number | null }>;
        } | null;
    }>;
    created_at: string;
    updated_at: string;
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

// ── Internal types ───────────────────────────────────────────────────────────

type ScheduleSlot = "primary" | "overlay";

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

type RawIngredientRow = {
    ingredient: {
        id: string;
        name: string;
    } | null;
};

type RawAttributeDefRow = {
    code: string;
    label: string;
    type: string;
    show_in_public_channels: boolean;
};

type RawAttributeValueRow = {
    attribute_definition_id: string;
    value_text: string | null;
    value_number: number | null;
    value_boolean: boolean | null;
    // deno-lint-ignore no-explicit-any
    value_json: any | null;
    definition: RawAttributeDefRow | null;
};

type RawDimensionRow = {
    id: string;
    name: string;
    sort_order: number;
};

type RawDimValueRow = {
    id: string;
    label: string;
    sort_order: number;
    dimension: RawDimensionRow | null;
};

type RawAssignmentValueRow = {
    dim_value: RawDimValueRow | null;
};

type RawAssignmentRow = {
    values: RawAssignmentValueRow[] | RawAssignmentValueRow | null;
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

type RawVariantRow = {
    id: string;
    name: string;
    description: string | null;
    base_price: number | null;
    image_url: string | null;
    attributes: RawAttributeValueRow[] | RawAttributeValueRow | null;
    allergens: RawAllergenRow[] | RawAllergenRow | null;
    ingredients: RawIngredientRow[] | RawIngredientRow | null;
    assignment: RawAssignmentRow[] | RawAssignmentRow | null;
    option_groups: RawOptionGroupRow[] | RawOptionGroupRow | null;
};

type RawProductRow = {
    id: string;
    name: string;
    description: string | null;
    base_price: number | null;
    parent_product_id: string | null;
    product_type: string | null;
    variants: RawVariantRow[] | RawVariantRow | null;
    attributes: RawAttributeValueRow[] | RawAttributeValueRow | null;
    allergens: RawAllergenRow[] | RawAllergenRow | null;
    ingredients: RawIngredientRow[] | RawIngredientRow | null;
    image_url: string | null;
};

type RawCategoryProductRow = {
    id: string;
    sort_order: number;
    product_id: string;
    variant_product_id: string | null;
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

type RawCatalogRow = {
    id: string;
    name: string;
    categories: RawCategoryRow[] | RawCategoryRow | null;
};

type PriceOverrideRow = {
    product_id: string;
    override_price: number;
    show_original_price: boolean;
    option_value_id: string | null;
};

type VisibilityOverrideRow = {
    product_id: string;
    visible?: boolean;
    mode?: VisibilityMode | null;
};

type ActivityProductOverrideRow = {
    product_id: string;
    visible_override: boolean | null;
};

// deno-lint-ignore no-explicit-any
type SupabaseLike = { from: (table: string) => any };

// ── Helpers ──────────────────────────────────────────────────────────────────

function normalizeOne<T>(value: T | T[] | null | undefined): T | null {
    if (!value) return null;
    return Array.isArray(value) ? (value[0] ?? null) : value;
}

function normalizeMany<T>(value: T[] | T | null | undefined): T[] {
    if (!value) return [];
    return Array.isArray(value) ? value : [value];
}

function normalizeVisibilityMode(value: string | null | undefined): VisibilityMode | null {
    if (value === "hide" || value === "disable") return value;
    return null;
}

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

// ── Catalog normalizer ───────────────────────────────────────────────────────

function normalizeCatalog(
    raw: RawCatalogRow | RawCatalogRow[] | null
): ResolvedCatalog | undefined {
    const catalog = normalizeOne(raw);
    if (!catalog) return undefined;

    const categories = normalizeMany(catalog.categories)
        .slice()
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
        .map(cat => {
            const sortedCps = normalizeMany(cat.products)
                .slice()
                .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

            const groupOrder: string[] = [];
            const groupMap = new Map<
                string,
                {
                    parentSelected: boolean;
                    selectedVariantIds: Set<string>;
                    representativeCp: RawCategoryProductRow;
                }
            >();

            for (const cp of sortedCps) {
                const parentId = cp.product_id;
                if (!parentId) continue;

                if (!groupMap.has(parentId)) {
                    groupOrder.push(parentId);
                    groupMap.set(parentId, {
                        parentSelected: false,
                        selectedVariantIds: new Set(),
                        representativeCp: cp
                    });
                }
                const group = groupMap.get(parentId)!;
                if (cp.variant_product_id === null) {
                    group.parentSelected = true;
                } else {
                    group.selectedVariantIds.add(cp.variant_product_id);
                }
            }

            // deno-lint-ignore no-explicit-any
            const mapAttributes = (rows: any) =>
                normalizeMany(rows)
                    .map((a: RawAttributeValueRow) => {
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
                                      type: def.type,
                                      show_in_public_channels: def.show_in_public_channels
                                  }
                                : null
                        };
                    })
                    .filter(
                        // deno-lint-ignore no-explicit-any
                        (a: any) => a.definition?.show_in_public_channels !== false
                    );

            const mapAllergens = (rows: RawAllergenRow[] | RawAllergenRow | null): ResolvedAllergen[] =>
                normalizeMany(rows)
                    .map((al: RawAllergenRow) => {
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
                    .filter((al): al is ResolvedAllergen => al !== null);

            const mapIngredients = (rows: RawIngredientRow[] | RawIngredientRow | null): ResolvedIngredient[] =>
                normalizeMany(rows)
                    .map((row: RawIngredientRow) => {
                        const ingredient = normalizeOne(row.ingredient);
                        return ingredient
                            ? { id: ingredient.id, name: ingredient.name }
                            : null;
                    })
                    .filter((ing): ing is ResolvedIngredient => ing !== null);

            const products = groupOrder
                .map(parentId => {
                    const group = groupMap.get(parentId)!;
                    const p = normalizeOne(group.representativeCp.product);
                    if (!p) return null;
                    if (p.parent_product_id !== null) return null;

                    const pAttrs = mapAttributes(p.attributes);
                    const pAllergens = mapAllergens(p.allergens);
                    const pIngredients = mapIngredients(p.ingredients);

                    const allVariants = normalizeMany(p.variants).map(v => {
                        const vAttrs = mapAttributes(v.attributes);
                        const vAllergens = mapAllergens(v.allergens);
                        const vIngredients = mapIngredients(v.ingredients);

                        const assignment = normalizeOne(v.assignment);
                        const dimValues: ResolvedVariantDimValue[] = assignment
                            ? normalizeMany(assignment.values)
                                  .map(av => {
                                      const dv = normalizeOne(av.dim_value);
                                      if (!dv || !dv.dimension) return null;
                                      return {
                                          value_id: dv.id,
                                          value_label: dv.label,
                                          value_sort_order: dv.sort_order,
                                          dimension_id: dv.dimension.id,
                                          dimension_name: dv.dimension.name,
                                          dimension_sort_order: dv.dimension.sort_order
                                      } satisfies ResolvedVariantDimValue;
                                  })
                                  .filter((dv): dv is ResolvedVariantDimValue => dv !== null)
                            : [];

                        const vOptionGroupsRaw = normalizeMany<RawOptionGroupRow>(v.option_groups);
                        const vResolvedOptionGroups: ResolvedOptionGroup[] = vOptionGroupsRaw.map(og => ({
                            id: og.id,
                            name: og.name,
                            group_kind: (og.group_kind as "PRIMARY_PRICE" | "ADDON") || "ADDON",
                            pricing_mode: (og.pricing_mode as "ABSOLUTE" | "DELTA") || "DELTA",
                            is_required: og.is_required ?? false,
                            max_selectable: og.max_selectable ?? null,
                            values: normalizeMany<RawOptionValueRow>(og.values).map(val => ({
                                id: val.id,
                                name: val.name,
                                absolute_price: val.absolute_price ?? null,
                                price_modifier: val.price_modifier ?? null
                            }))
                        }));

                        let vFromPrice: number | undefined = undefined;
                        let vSinglePrice: number | undefined = undefined;
                        const vPrimaryGroup = vResolvedOptionGroups.find(
                            og => og.group_kind === "PRIMARY_PRICE" && og.pricing_mode === "ABSOLUTE"
                        );
                        if (vPrimaryGroup && vPrimaryGroup.values.length > 0) {
                            const validPrices = vPrimaryGroup.values
                                .map(val => val.absolute_price)
                                .filter((price): price is number => price !== null);
                            if (validPrices.length === 1) {
                                vSinglePrice = validPrices[0];
                            } else if (validPrices.length > 1) {
                                vFromPrice = Math.min(...validPrices);
                            }
                        }

                        return {
                            id: v.id,
                            name: v.name,
                            ...(v.base_price !== null ? { price: v.base_price } : {}),
                            ...(v.base_price === null && vSinglePrice !== undefined ? { price: vSinglePrice } : {}),
                            ...(v.base_price === null && vFromPrice !== undefined ? { from_price: vFromPrice } : {}),
                            ...(v.base_price === null && vResolvedOptionGroups.length > 0 ? { optionGroups: vResolvedOptionGroups } : {}),
                            ...(v.image_url ? { image_url: v.image_url } : {}),
                            ...(v.description ? { description: v.description } : {}),
                            ...(vAttrs.length > 0 ? { attributes: vAttrs } : {}),
                            ...(vAllergens.length > 0 ? { allergens: vAllergens } : {}),
                            ...(vIngredients.length > 0 ? { ingredients: vIngredients } : {}),
                            ...(dimValues.length > 0 ? { dimension_values: dimValues } : {})
                        };
                    });

                    const pVariants =
                        group.selectedVariantIds.size > 0
                            ? allVariants.filter(v => group.selectedVariantIds.has(v.id))
                            : allVariants;

                    const optionGroupsRaw = normalizeMany<RawOptionGroupRow>(
                        // deno-lint-ignore no-explicit-any
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

                    let from_price: number | undefined = undefined;
                    let displayPrice: number | undefined =
                        p.base_price !== null ? p.base_price : undefined;
                    const primaryGroup = resolvedOptionGroups.find(
                        og => og.group_kind === "PRIMARY_PRICE" && og.pricing_mode === "ABSOLUTE"
                    );
                    if (primaryGroup && primaryGroup.values.length > 0) {
                        const validPrices = primaryGroup.values
                            .map(v => v.absolute_price)
                            .filter((price): price is number => price !== null);
                        if (validPrices.length === 1) {
                            displayPrice = validPrices[0];
                        } else if (validPrices.length > 1) {
                            from_price = Math.min(...validPrices);
                        }
                    }

                    // Variant pricing inheritance
                    const parentOwnDisplayPrice = displayPrice;
                    const parentOwnFromPrice = from_price;
                    const parentPrimaryGroups = resolvedOptionGroups.filter(
                        og => og.group_kind === "PRIMARY_PRICE"
                    );
                    const pVariantsResolved = pVariants.map(v => {
                        if (v.price !== undefined || v.from_price !== undefined) return v;
                        if (parentOwnDisplayPrice !== undefined) return { ...v, price: parentOwnDisplayPrice };
                        if (parentOwnFromPrice !== undefined) {
                            return {
                                ...v,
                                from_price: parentOwnFromPrice,
                                ...(parentPrimaryGroups.length > 0 ? { optionGroups: parentPrimaryGroups } : {})
                            };
                        }
                        return v;
                    });

                    const isConfigurable = p.product_type === "configurable";
                    let defaultVariantId: string | undefined = undefined;

                    if (isConfigurable && pVariantsResolved.length > 0) {
                        const withPrice = pVariantsResolved.filter(v => v.price !== undefined);
                        const defaultVariant =
                            withPrice.length > 0
                                ? withPrice.reduce((min, v) =>
                                      (v.price as number) < (min.price as number) ? v : min
                                  )
                                : pVariantsResolved[0];
                        defaultVariantId = defaultVariant.id;

                        if (p.base_price === null) {
                            const hasOwnFormats = resolvedOptionGroups.some(
                                og => og.group_kind === "PRIMARY_PRICE"
                            );
                            if (!hasOwnFormats) {
                                displayPrice = undefined;
                                const variantPrices = pVariantsResolved
                                    .map(v => v.price ?? v.from_price)
                                    .filter((n): n is number => n !== undefined);
                                if (variantPrices.length > 0) {
                                    const allSame = variantPrices.every(p => p === variantPrices[0]);
                                    if (allSame) {
                                        displayPrice = variantPrices[0];
                                        from_price = undefined;
                                    } else {
                                        from_price = Math.min(...variantPrices);
                                    }
                                }
                            }
                        }
                    }

                    const resolvedProduct: ResolvedProduct = {
                        id: p.id,
                        name: p.name,
                        is_visible: true,
                        is_disabled: false,
                        parentSelected: group.parentSelected,
                        ...(p.description ? { description: p.description } : {}),
                        ...(displayPrice !== undefined ? { price: displayPrice } : {}),
                        ...(from_price !== undefined ? { from_price } : {}),
                        ...(pAttrs.length > 0 ? { attributes: pAttrs } : {}),
                        ...(pAllergens.length > 0 ? { allergens: pAllergens } : {}),
                        ...(pIngredients.length > 0 ? { ingredients: pIngredients } : {}),
                        ...(p.image_url ? { image_url: p.image_url } : {}),
                        ...(pVariantsResolved.length > 0 ? { variants: pVariantsResolved } : {}),
                        ...(resolvedOptionGroups.length > 0
                            ? { optionGroups: resolvedOptionGroups }
                            : {}),
                        ...(p.product_type ? { product_type: p.product_type } : {}),
                        ...(defaultVariantId ? { default_variant_id: defaultVariantId } : {}),
                        base_price: p.base_price ?? null
                    };

                    return resolvedProduct;
                })
                .filter((p): p is ResolvedProduct => p !== null);

            // ⚠️ SYNC — modifiche a questo blocco vanno replicate in src/services/supabase/resolveActivityCatalogs.ts
            const resolvedCategory: ResolvedCategory = {
                id: cat.id,
                name: cat.name,
                level: cat.level,
                sort_order: cat.sort_order,
                parent_category_id: cat.parent_category_id,
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

// ── Catalog loader ───────────────────────────────────────────────────────────

const CATALOG_SELECT = `
    id,
    name,
    categories:catalog_categories(
      id,
      name,
      level,
      sort_order,
      parent_category_id,
      products:catalog_category_products(
        id,
        sort_order,
        product_id,
        variant_product_id,
        product:products!catalog_category_products_product_id_fkey(
          id,
          name,
          description,
          base_price,
          parent_product_id,
          product_type,
          image_url,
          option_groups:product_option_groups(
            id,
            name,
            group_kind,
            pricing_mode,
            is_required,
            max_selectable,
            values:product_option_values(
              id,
              name,
              absolute_price,
              price_modifier
            )
          ),
          variants:products!parent_product_id(
            id,
            name,
            description,
            base_price,
            image_url,
            option_groups:product_option_groups(
              id,
              name,
              group_kind,
              pricing_mode,
              is_required,
              max_selectable,
              values:product_option_values(
                id,
                name,
                absolute_price,
                price_modifier
              )
            ),
            assignment:product_variant_assignments!variant_product_id(
              values:product_variant_assignment_values(
                dim_value:product_variant_dimension_values(
                  id,
                  label,
                  sort_order,
                  dimension:product_variant_dimensions(
                    id,
                    name,
                    sort_order
                  )
                )
              )
            ),
            attributes:product_attribute_values(
                attribute_definition_id,
                value_text,
                value_number,
                value_boolean,
                value_json,
                definition:product_attribute_definitions(
                    code,
                    label,
                    type,
                    show_in_public_channels
                )
            ),
            allergens:product_allergens(
                allergen:allergens(
                    id,
                    code,
                    label_it,
                    label_en
                )
            ),
            ingredients:product_ingredients(
                ingredient:ingredients(
                    id,
                    name
                )
            )
          ),
          attributes:product_attribute_values(
              attribute_definition_id,
              value_text,
              value_number,
              value_boolean,
              value_json,
              definition:product_attribute_definitions(
                  code,
                  label,
                  type,
                  show_in_public_channels
              )
          ),
          allergens:product_allergens(
              allergen:allergens(
                  id,
                  code,
                  label_it,
                  label_en
              )
          ),
          ingredients:product_ingredients(
              ingredient:ingredients(
                  id,
                  name
              )
          )
        )
      )
    )
`;

async function loadCatalogById(
    supabase: SupabaseLike,
    catalogId: string
): Promise<ResolvedCatalog | undefined> {
    const { data, error } = await supabase
        .from("catalogs")
        .select(CATALOG_SELECT)
        .eq("id", catalogId)
        .maybeSingle();

    if (error) throw error;
    return normalizeCatalog((data as unknown as RawCatalogRow | null) ?? null);
}

// ── Visibility overrides ─────────────────────────────────────────────────────

async function selectVisibilityOverridesWithModeFallback(
    supabase: SupabaseLike,
    scheduleId: string,
    productIds: string[]
): Promise<VisibilityOverrideRow[]> {
    if (productIds.length === 0) return [];

    const withModeRes = await supabase
        .from("schedule_visibility_overrides")
        .select("product_id, mode, visible")
        .eq("schedule_id", scheduleId)
        .in("product_id", productIds);

    if (!withModeRes.error) {
        return (withModeRes.data ?? []) as VisibilityOverrideRow[];
    }

    if (!isMissingColumnError(withModeRes.error, "mode")) {
        throw withModeRes.error;
    }

    const withoutModeRes = await supabase
        .from("schedule_visibility_overrides")
        .select("product_id, visible")
        .eq("schedule_id", scheduleId)
        .in("product_id", productIds);

    if (withoutModeRes.error) throw withoutModeRes.error;

    return ((withoutModeRes.data ?? []) as VisibilityOverrideRow[]).map(row => ({
        ...row,
        mode: null
    }));
}

// ── Apply visibility overrides ───────────────────────────────────────────────

function applyVisibilityOverridesToCatalog(
    catalog: ResolvedCatalog | undefined,
    overridesByProductId: Record<string, VisibilityOverrideRow>,
    fallbackVisibilityMode: VisibilityMode
): ResolvedCatalog | undefined {
    if (!catalog) return undefined;

    const resolveMode = (
        override: VisibilityOverrideRow | undefined
    ): VisibilityMode | "visible" | null => {
        if (!override) return null;
        if (override.visible === true) return "visible";
        const modeFromOverride = normalizeVisibilityMode(override.mode ?? null);
        if (modeFromOverride) return modeFromOverride;
        if (override.visible === false) return fallbackVisibilityMode;
        return null;
    };

    return {
        ...catalog,
        ...(catalog.categories
            ? {
                  categories: catalog.categories
                      .map(category => ({
                          ...category,
                          products: category.products
                              .map(item => {
                                  const filteredVariants = item.variants?.filter(v =>
                                      resolveMode(overridesByProductId[v.id]) !== "hide"
                                  );
                                  const parentMode = resolveMode(overridesByProductId[item.id]);

                                  if (parentMode === "visible") {
                                      return {
                                          ...item,
                                          ...(filteredVariants !== undefined ? { variants: filteredVariants } : {}),
                                          is_visible: true,
                                          is_disabled: false
                                      };
                                  }
                                  if (parentMode === "hide") {
                                      return {
                                          ...item,
                                          ...(filteredVariants !== undefined ? { variants: filteredVariants } : {}),
                                          parentSelected: false,
                                          is_visible: true,
                                          is_disabled: false
                                      };
                                  }
                                  if (parentMode === "disable") {
                                      return {
                                          ...item,
                                          ...(filteredVariants !== undefined ? { variants: filteredVariants } : {}),
                                          is_visible: true,
                                          is_disabled: true
                                      };
                                  }
                                  return {
                                      ...item,
                                      ...(filteredVariants !== undefined ? { variants: filteredVariants } : {})
                                  };
                              })
                              .filter(item =>
                                  item.is_visible &&
                                  (!item.parentSelected ? (item.variants ?? []).length > 0 : true)
                              )
                      }))
                      .filter(category => category.products.length > 0)
              }
            : {})
    };
}

// ── Apply price overrides ────────────────────────────────────────────────────

function applyOverridesToOptionGroups(
    productId: string,
    optionGroups: ResolvedOptionGroup[],
    overridesByProductId: Record<string, PriceOverrideRow>,
    overridesByValueId: Record<string, PriceOverrideRow>
): { updatedGroups: ResolvedOptionGroup[]; newPrice: number | undefined; newFromPrice: number | undefined; newOriginalFromPrice: number | undefined } {
    const productOverride = overridesByProductId[productId];

    const updatedGroups: ResolvedOptionGroup[] = optionGroups.map(g => {
        if (g.group_kind !== "PRIMARY_PRICE") return g;
        const updatedValues: ResolvedOptionValue[] = g.values.map(v => {
            const valueOverride = overridesByValueId[v.id];
            const activeOverride = valueOverride ?? productOverride;
            if (!activeOverride || v.absolute_price === null) return v;
            return {
                ...v,
                ...(activeOverride.show_original_price ? { original_price: v.absolute_price } : {}),
                absolute_price: activeOverride.override_price
            };
        });
        return { ...g, values: updatedValues };
    });

    const primaryGroup = updatedGroups.find(g => g.group_kind === "PRIMARY_PRICE");
    const validValues = (primaryGroup?.values ?? []).filter(
        (v): v is ResolvedOptionValue & { absolute_price: number } => v.absolute_price !== null
    );

    let newPrice: number | undefined = undefined;
    let newFromPrice: number | undefined = undefined;
    let newOriginalFromPrice: number | undefined = undefined;

    if (validValues.length === 1) {
        newPrice = validValues[0].absolute_price;
        newOriginalFromPrice = validValues[0].original_price;
    } else if (validValues.length > 1) {
        const minEntry = validValues.reduce((min, v) =>
            v.absolute_price < min.absolute_price ? v : min
        );
        newFromPrice = minEntry.absolute_price;
        newOriginalFromPrice = minEntry.original_price;
    }

    return { updatedGroups, newPrice, newFromPrice, newOriginalFromPrice };
}

function applyPriceOverridesToCatalog(
    catalog: ResolvedCatalog | undefined,
    overridesByProductId: Record<string, PriceOverrideRow>,
    overridesByValueId: Record<string, PriceOverrideRow>
): ResolvedCatalog | undefined {
    if (!catalog) return undefined;

    return {
        ...catalog,
        ...(catalog.categories
            ? {
                  categories: catalog.categories.map(category => ({
                      ...category,
                      products: category.products.map(item => {
                          // Products with variants
                          if (item.variants && item.variants.length > 0) {
                              const updatedVariants: ResolvedVariant[] = item.variants.map(v => {
                                  if (v.optionGroups?.some(g => g.group_kind === "PRIMARY_PRICE")) {
                                      const { updatedGroups, newPrice, newFromPrice, newOriginalFromPrice } = applyOverridesToOptionGroups(
                                          v.id, v.optionGroups, overridesByProductId, overridesByValueId
                                      );
                                      return {
                                          ...v,
                                          optionGroups: updatedGroups,
                                          price: newPrice,
                                          from_price: newFromPrice,
                                          ...(newOriginalFromPrice !== undefined
                                              ? { original_price: newOriginalFromPrice }
                                              : {})
                                      };
                                  }
                                  const variantOverride = overridesByProductId[v.id];
                                  if (variantOverride) {
                                      const originalValue = v.price ?? v.from_price;
                                      if (v.price !== undefined) {
                                          return {
                                              ...v,
                                              price: variantOverride.override_price,
                                              from_price: undefined,
                                              ...(variantOverride.show_original_price && originalValue !== undefined
                                                  ? { original_price: originalValue }
                                                  : {})
                                          };
                                      }
                                      if (v.from_price !== undefined) {
                                          return {
                                              ...v,
                                              from_price: variantOverride.override_price,
                                              price: undefined,
                                              ...(variantOverride.show_original_price && originalValue !== undefined
                                                  ? { original_price: originalValue }
                                                  : {})
                                          };
                                      }
                                  }
                                  return v;
                              });

                              if (item.base_price !== null) {
                                  const parentOverride = overridesByProductId[item.id];
                                  if (parentOverride) {
                                      return {
                                          ...item,
                                          variants: updatedVariants,
                                          price: parentOverride.override_price,
                                          from_price: item.from_price,
                                          ...(parentOverride.show_original_price
                                              ? { original_price: item.price }
                                              : { original_price: undefined })
                                      };
                                  }
                                  return { ...item, variants: updatedVariants };
                              }

                              if (item.optionGroups?.some(g => g.group_kind === "PRIMARY_PRICE")) {
                                  const { updatedGroups, newPrice, newFromPrice, newOriginalFromPrice } =
                                      applyOverridesToOptionGroups(
                                          item.id,
                                          item.optionGroups,
                                          overridesByProductId,
                                          overridesByValueId
                                      );
                                  return {
                                      ...item,
                                      variants: updatedVariants,
                                      optionGroups: updatedGroups,
                                      price: newPrice,
                                      from_price: newFromPrice,
                                      ...(newOriginalFromPrice !== undefined
                                          ? { original_price: newOriginalFromPrice }
                                          : { original_price: undefined })
                                  };
                              }

                              const allVariantPrices = updatedVariants
                                  .map(v => v.price ?? v.from_price)
                                  .filter((p): p is number => p !== undefined);
                              const minVariantPrice =
                                  allVariantPrices.length > 0 ? Math.min(...allVariantPrices) : undefined;

                              return {
                                  ...item,
                                  variants: updatedVariants,
                                  price: undefined,
                                  from_price: minVariantPrice,
                                  original_price: undefined
                              };
                          }

                          // Format product (PRIMARY_PRICE optionGroups, no variants)
                          if (item.optionGroups?.some(g => g.group_kind === "PRIMARY_PRICE")) {
                              const { updatedGroups, newPrice, newFromPrice, newOriginalFromPrice } = applyOverridesToOptionGroups(
                                  item.id, item.optionGroups, overridesByProductId, overridesByValueId
                              );
                              return {
                                  ...item,
                                  optionGroups: updatedGroups,
                                  price: newPrice,
                                  from_price: newFromPrice,
                                  ...(newOriginalFromPrice !== undefined
                                      ? { original_price: newOriginalFromPrice }
                                      : { original_price: undefined })
                              };
                          }

                          // Single-price product
                          const parentOverride = overridesByProductId[item.id];
                          if (!parentOverride) return item;
                          if (item.from_price !== undefined) {
                              return {
                                  ...item,
                                  from_price: parentOverride.override_price,
                                  price: undefined,
                                  ...(parentOverride.show_original_price
                                      ? { original_price: item.from_price }
                                      : {})
                              };
                          }
                          return {
                              ...item,
                              price: parentOverride.override_price,
                              from_price: undefined,
                              ...(parentOverride.show_original_price
                                  ? { original_price: item.price }
                                  : {})
                          };
                      })
                  }))
              }
            : {})
    };
}

// ── Apply activity visibility overrides ──────────────────────────────────────

function applyActivityVisibilityOverridesToCatalog(
    catalog: ResolvedCatalog | undefined,
    baseCatalog: ResolvedCatalog | undefined,
    overridesByProductId: Record<string, ActivityProductOverrideRow>
): ResolvedCatalog | undefined {
    if (!catalog) return undefined;

    const baseProductsByProductId: Record<string, ResolvedProduct> = {};
    for (const category of baseCatalog?.categories ?? []) {
        for (const product of category.products) {
            baseProductsByProductId[product.id] = product;
        }
    }

    return {
        ...catalog,
        ...(catalog.categories
            ? {
                  categories: catalog.categories
                      .map(category => {
                          const currentProductIds = new Set(category.products.map(p => p.id));
                          const productsToConsider: ResolvedProduct[] = [...category.products];

                          for (const [productId, override] of Object.entries(overridesByProductId)) {
                              if (
                                  override.visible_override === true &&
                                  !currentProductIds.has(productId) &&
                                  baseProductsByProductId[productId]
                              ) {
                                  const belongsToCategory = (baseCatalog?.categories ?? []).some(
                                      c =>
                                          c.id === category.id &&
                                          c.products.some(p => p.id === productId)
                                  );
                                  if (belongsToCategory) {
                                      productsToConsider.push({
                                          ...baseProductsByProductId[productId],
                                          is_disabled: false
                                      });
                                  }
                              }
                          }

                          const finalProducts = productsToConsider
                              .map(item => {
                                  const override = overridesByProductId[item.id];
                                  if (!override || override.visible_override === null) return item;
                                  if (override.visible_override === false) return null;
                                  return {
                                      ...item,
                                      is_visible: true,
                                      is_disabled: false
                                  };
                              })
                              .filter((p): p is ResolvedProduct => p !== null);

                          return { ...category, products: finalProducts };
                      })
                      .filter(category => category.products.length > 0)
              }
            : {})
    };
}

// ── Schedule helpers (legacy compat) ─────────────────────────────────────────

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

function isScheduleActive(schedule: V2ActivityScheduleRow, now?: RomeDateTime) {
    if (!schedule.is_active) return false;
    const effectiveNow = now ?? getNowInRome();
    const day = effectiveNow.dayOfWeek;
    const time = effectiveNow.hour * 60 + effectiveNow.minute;
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
    if (a.priority !== b.priority) return a.priority - b.priority;
    const aStart = toMinutes(a.start_time) ?? -1;
    const bStart = toMinutes(b.start_time) ?? -1;
    if (aStart !== bStart) return aStart - bStart;
    const createdDelta = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    if (createdDelta !== 0) return createdDelta;
    return a.id.localeCompare(b.id);
}

function pickWinner(schedules: V2ActivityScheduleRow[]): V2ActivityScheduleRow | null {
    if (schedules.length === 0) return null;
    if (schedules.length === 1) return schedules[0];
    return schedules.slice().sort(compareScheduleWinner)[0];
}

function pickFallbackPrimary(
    schedules: V2ActivityScheduleRow[],
    now?: RomeDateTime
): V2ActivityScheduleRow | null {
    const effectiveNow = now ?? getNowInRome();
    const day = effectiveNow.dayOfWeek;
    const time = effectiveNow.hour * 60 + effectiveNow.minute;
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
    overridesByProductId: Record<string, ActivityProductOverrideRow>
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

// ── Main resolver ────────────────────────────────────────────────────────────

export async function resolveActivityCatalogs(
    supabase: SupabaseLike,
    activityId: string,
    now?: RomeDateTime
): Promise<ResolvedCollections> {
    const effectiveNow = now ?? getNowInRome();

    const { data: activityExists, error: activityCheckError } = await supabase
        .from("activities")
        .select("id, tenant_id")
        .eq("id", activityId)
        .maybeSingle();

    if (activityCheckError) throw activityCheckError;
    if (!activityExists) {
        console.warn(`[resolveActivityCatalogs] Activity not found: ${activityId}`);
        return {
            featured: { hero: [], before_catalog: [], after_catalog: [] }
        };
    }

    const ruleResolution = await resolveRulesForActivity({
        supabase,
        activityId,
        now: effectiveNow,
        includeLayoutStyle: true
    });
    const layoutCatalogId = ruleResolution.layout.catalogId;
    const layoutScheduleId = ruleResolution.layout.scheduleId;
    const styleData = ruleResolution.layout.styleData as ResolvedStyle | undefined;

    function computeFromPrice(
        optionGroups: Array<{
            group_kind: string;
            values: Array<{ absolute_price: number | null }>;
        }> | null | undefined
    ): { fromPrice: number | null; is_from_price: boolean } {
        if (!optionGroups) return { fromPrice: null, is_from_price: false };
        const primaryGroup = optionGroups.find(g => g.group_kind === "PRIMARY_PRICE");
        if (!primaryGroup || !primaryGroup.values || primaryGroup.values.length === 0) {
            return { fromPrice: null, is_from_price: false };
        }
        const prices = primaryGroup.values
            .map(v => v.absolute_price)
            .filter((p): p is number => p != null);
        if (prices.length === 0) return { fromPrice: null, is_from_price: false };
        return { fromPrice: Math.min(...prices), is_from_price: true };
    }

    const featured: ResolvedCollections["featured"] = {
        hero: [],
        before_catalog: [],
        after_catalog: []
    };

    const featuredScheduleId = ruleResolution.featuredRule?.scheduleId ?? null;

    if (featuredScheduleId) {
        // SYNC: identico in src/services/supabase/resolveActivityCatalogs.ts
        const { data: featuredData, error: featuredError } = await supabase
            .rpc("get_schedule_featured_contents", { p_schedule_id: featuredScheduleId });

        if (featuredError) {
            console.error(
                "[resolveActivityCatalogs] error fetching featured contents",
                featuredError
            );
        } else if (featuredData) {
            type RawFeaturedJoin = {
                slot: "hero" | "before_catalog" | "after_catalog";
                sort_order: number;
                featured_content: V2FeaturedContent | V2FeaturedContent[] | null;
            };

            type RawProductItem = {
                sort_order: number | null;
                note: string | null;
                product: {
                    id: string;
                    name: string;
                    description: string | null;
                    base_price: number | null;
                    image_url: string | null;
                    option_groups: Array<{
                        group_kind: string;
                        values: Array<{ name: string | null; absolute_price: number | null }>;
                    }> | null;
                } | null;
            };

            const validFeaturedItems = (featuredData as unknown as RawFeaturedJoin[])
                .map(row => {
                    const fc = normalizeOne(row.featured_content);
                    if (fc && fc.products) {
                        const rawProducts = fc.products as unknown as RawProductItem[];
                        fc.products = rawProducts.map(p => {
                            if (!p.product) return { ...p, product: null };
                            const { fromPrice, is_from_price } = computeFromPrice(
                                p.product.option_groups
                            );
                            const primaryGroup = (p.product.option_groups ?? []).find(
                                g => g.group_kind === "PRIMARY_PRICE"
                            );
                            const price_variants = primaryGroup ? primaryGroup.values : [];
                            return {
                                ...p,
                                product: {
                                    id: p.product.id,
                                    name: p.product.name,
                                    description: p.product.description,
                                    base_price: p.product.base_price,
                                    image_url: p.product.image_url,
                                    fromPrice,
                                    is_from_price,
                                    price_variants
                                }
                            };
                        });
                    }
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
        return { featured };
    }

    const layoutCatalog = await loadCatalogById(supabase, layoutCatalogId);
    const baseCatalog: ResolvedCatalog | undefined = layoutCatalog
        ? JSON.parse(JSON.stringify(layoutCatalog))
        : undefined;

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
                    category.products.flatMap(item => [
                        item.id,
                        ...(item.variants ?? []).map(v => v.id)
                    ])
                )
            )
        )
    );

    const visibilityOverridesByProductId: Record<string, VisibilityOverrideRow> = {};
    const priceOverridesByProductId: Record<string, PriceOverrideRow> = {};
    const priceOverridesByValueId: Record<string, PriceOverrideRow> = {};

    const activeVisibilityRuleScheduleId = ruleResolution.visibilityRule?.scheduleId ?? null;
    const fallbackVisibilityMode = ruleResolution.visibilityRule?.mode ?? "hide";
    if (activeVisibilityRuleScheduleId && productIds.length > 0) {
        const visibilityOverrideRows = await selectVisibilityOverridesWithModeFallback(
            supabase,
            activeVisibilityRuleScheduleId,
            productIds
        );
        for (const row of visibilityOverrideRows) {
            visibilityOverridesByProductId[row.product_id] = row;
        }
    }

    schedules = schedules.map(schedule => ({
        ...schedule,
        catalog: applyVisibilityOverridesToCatalog(
            schedule.catalog,
            visibilityOverridesByProductId,
            fallbackVisibilityMode
        )
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

    const allBaseProductIds = Array.from(
        new Set(
            (baseCatalog?.categories ?? []).flatMap(category => category.products.map(p => p.id))
        )
    );

    const activityProductOverridesByProductId: Record<string, ActivityProductOverrideRow> = {};

    if (allBaseProductIds.length > 0) {
        const { data: activityOverrideData, error: activityOverrideError } = await supabase
            .from("activity_product_overrides")
            .select("product_id, visible_override")
            .eq("activity_id", activityId)
            .in("product_id", allBaseProductIds);

        if (activityOverrideError) throw activityOverrideError;

        for (const row of (activityOverrideData ?? []) as ActivityProductOverrideRow[]) {
            activityProductOverridesByProductId[row.product_id] = row;
        }
    }

    const activePriceRuleScheduleId = ruleResolution.priceRuleId;

    if (activePriceRuleScheduleId && visibleProductIds.length > 0) {
        const variantIds = Array.from(
            new Set(
                schedules.flatMap(schedule =>
                    (schedule.catalog?.categories ?? []).flatMap(category =>
                        category.products.flatMap(item =>
                            (item.variants ?? []).map(v => v.id)
                        )
                    )
                )
            )
        );
        const allPriceTargetIds = Array.from(new Set([...visibleProductIds, ...variantIds]));

        const { data: priceOverrideData, error: priceOverrideError } = await supabase
            .from("schedule_price_overrides")
            .select("product_id, override_price, show_original_price, option_value_id")
            .eq("schedule_id", activePriceRuleScheduleId)
            .in("product_id", allPriceTargetIds);

        if (priceOverrideError) throw priceOverrideError;

        for (const row of (priceOverrideData ?? []) as PriceOverrideRow[]) {
            if (row.option_value_id === null) {
                priceOverridesByProductId[row.product_id] = row;
            } else {
                priceOverridesByValueId[row.option_value_id] = row;
            }
        }
    }

    schedules = schedules.map(schedule => ({
        ...schedule,
        catalog: applyPriceOverridesToCatalog(schedule.catalog, priceOverridesByProductId, priceOverridesByValueId)
    }));

    // Layer 4: Activity visibility override (last word on visibility)
    schedules = schedules.map(schedule => ({
        ...schedule,
        catalog: applyActivityVisibilityOverridesToCatalog(
            schedule.catalog,
            baseCatalog,
            activityProductOverridesByProductId
        )
    }));

    const schedulesWithItems = schedules.filter(schedule =>
        hasRenderableItems(schedule, activityProductOverridesByProductId)
    );

    const activeNow = schedulesWithItems.filter(schedule => isScheduleActive(schedule, effectiveNow));
    const activePrimary = pickWinner(activeNow.filter(schedule => schedule.slot === "primary"));
    const fallbackPrimary = activePrimary ? null : pickFallbackPrimary(schedulesWithItems, effectiveNow);
    const finalPrimary = activePrimary ?? fallbackPrimary;

    return {
        ...(finalPrimary?.styleData ? { style: finalPrimary.styleData } : {}),
        ...(finalPrimary?.catalog ? { catalog: finalPrimary.catalog } : {}),
        ...(Object.keys(featured).length > 0 ? { featured } : {})
    };
}
