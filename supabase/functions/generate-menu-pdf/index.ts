// @ts-nocheck
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1?target=deno";
import { resolveRulesForActivity } from "../_shared/scheduleResolver.ts";
import { getNowInRome, type RomeDateTime } from "../_shared/schedulingNow.ts";

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
    catalog: V2Catalog | null;
};

type RawOptionValueRow = {
    id: string;
    name: string | null;
    absolute_price: number | null;
    price_modifier: number | null;
};

type RawOptionGroupRow = {
    id: string;
    name: string | null;
    group_kind: "PRIMARY_PRICE" | "ADDON";
    pricing_mode: "ABSOLUTE" | "DELTA";
    is_required: boolean;
    values: RawOptionValueRow[] | RawOptionValueRow | null;
};

type RawProductRow = {
    id: string;
    name: string | null;
    description: string | null;
    base_price: number | null;
    product_type: string | null;
    parent_product_id: string | null;
    option_groups: RawOptionGroupRow[] | RawOptionGroupRow | null;
};

type RawCatalogCategoryProductRow = {
    id: string;
    sort_order: number | null;
    product_id: string | null;
    product: RawProductRow | RawProductRow[] | null;
};

type RawCatalogCategoryRow = {
    id: string;
    name: string | null;
    sort_order: number | null;
    products: RawCatalogCategoryProductRow[] | RawCatalogCategoryProductRow | null;
};

type RawCatalogRow = {
    id: string;
    name: string | null;
    categories: RawCatalogCategoryRow[] | RawCatalogCategoryRow | null;
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

type ActivityRow = {
    id: string;
    name: string;
    tenant_id: string;
    tenants: {
        owner_user_id: string;
    };
};

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS"
};

function json(status: number, body: Record<string, unknown>) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
}

function normalizeOne<T>(value: T | T[] | null | undefined): T | null {
    if (!value) return null;
    return Array.isArray(value) ? (value[0] ?? null) : value;
}

function normalizeMany<T>(value: T[] | T | null | undefined): T[] {
    if (!value) return [];
    return Array.isArray(value) ? value : [value];
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
    now: RomeDateTime
): V2ActivityScheduleRow | null {
    const day = now.dayOfWeek;
    const time = now.hour * 60 + now.minute;

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
                if (!override) return item;

                return {
                    ...item,
                    effective_price: override.override_price,
                    ...(override.show_original_price
                        ? { original_price: item.effective_price }
                        : {})
                };
            })
        }))
    };
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

function normalizeCatalog(raw: RawCatalogRow | RawCatalogRow[] | null): V2Catalog | null {
    const catalog = normalizeOne(raw);
    if (!catalog) return null;

    const sections = normalizeMany(catalog.categories)
        .slice()
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
        .map(category => {
            const items = normalizeMany(category.products)
                .slice()
                .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
                .map(item => {
                    const product = normalizeOne(item.product);
                    return {
                        id: item.id,
                        visible: true, // visibility managed via schedule_visibility_overrides
                        product_id: product?.id ?? item.product_id ?? null,
                        effective_price: product?.base_price ?? null
                    };
                });

            return {
                id: category.id,
                items
            };
        });

    return {
        id: catalog.id,
        sections
    };
}

function wrapText(
    text: string,
    maxWidth: number,
    font: { widthOfTextAtSize: (t: string, size: number) => number },
    size: number
) {
    const words = text.split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let current = "";

    const pushLine = (line: string) => {
        if (line) lines.push(line);
    };

    for (const word of words) {
        const test = current ? `${current} ${word}` : word;
        if (font.widthOfTextAtSize(test, size) <= maxWidth) {
            current = test;
            continue;
        }

        pushLine(current);

        if (font.widthOfTextAtSize(word, size) <= maxWidth) {
            current = word;
            continue;
        }

        let chunk = "";
        for (const ch of word) {
            const next = chunk + ch;
            if (font.widthOfTextAtSize(next, size) <= maxWidth) {
                chunk = next;
            } else {
                pushLine(chunk);
                chunk = ch;
            }
        }
        current = chunk;
    }

    pushLine(current);

    return lines.length ? lines : [""];
}

// -------------------------------------------------------------------------------------------------
// Request Handler
// -------------------------------------------------------------------------------------------------

serve(async req => {
    // CORS preflight
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    if (req.method !== "POST") {
        return json(405, { error: "method_not_allowed" });
    }

    try {
        const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
        const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");

        if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
            return json(500, { error: "server_misconfigured" });
        }

        const authHeader = req.headers.get("Authorization");
        if (!authHeader) {
            return json(401, { error: "unauthorized" });
        }

        let body: { businessId?: string; business_id?: string; catalogId?: string } | null = null;
        try {
            body = await req.json();
        } catch {
            return json(400, { error: "invalid_json" });
        }

        // businessId maps directly to V2 Activity ID
        const activityId = body?.businessId ?? body?.business_id;
        if (!activityId) {
            return json(400, { error: "missing_business_id" });
        }
        const overrideCatalogId: string | null = body?.catalogId ?? null;

        // 1) Create Supabase client using user JWT
        const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
            global: { headers: { Authorization: authHeader } }
        });

        const { data: authData, error: authError } = await supabase.auth.getUser();
        if (authError || !authData?.user?.id) {
            return json(401, { error: "unauthorized" });
        }

        // 2) Fetch activity and verify ownership
        const { data: activity, error: activityError } = await supabase
            .from("activities")
            .select(`
                id,
                name,
                tenant_id,
                tenants!inner (
                    owner_user_id
                )
            `)
            .eq("id", activityId)
            .single();

        if (activityError || !activity) {
            return json(404, { error: "business_not_found" });
        }

        const businessRow = activity as unknown as ActivityRow;

        if (businessRow.tenants.owner_user_id !== authData.user.id) {
            return json(403, { error: "forbidden" });
        }

        const now = getNowInRome();

        // 3) Resolve active scheduling rules (skipped when a specific catalogId is provided)
        type RuleResolutionShape = {
            layout: { scheduleId: string | null; catalogId: string | null };
            priceRuleId: string | null;
            visibilityRule: { scheduleId: string; mode?: string } | null;
        };
        let ruleResolution: RuleResolutionShape;
        let layoutCatalogId: string;

        if (overrideCatalogId) {
            layoutCatalogId = overrideCatalogId;
            ruleResolution = {
                layout: { scheduleId: null, catalogId: overrideCatalogId },
                priceRuleId: null,
                visibilityRule: null
            };
        } else {
            const resolved = await resolveRulesForActivity({
                supabase,
                activityId,
                now,
                includeLayoutStyle: false
            });
            const catalogId = resolved.layout.catalogId;
            if (!catalogId) {
                return json(404, { error: "no_active_collection" });
            }
            layoutCatalogId = catalogId;
            ruleResolution = resolved;
        }

        // 4) Load Catalog
        const { data: catalogData, error: catalogError } = await supabase
            .from("catalogs")
            .select(
                `
            id,
            name,
            categories:catalog_categories(
                id,
                name,
                sort_order,
                products:catalog_category_products(
                    id,
                    sort_order,
                    product_id,
                    product:products!catalog_category_products_product_id_fkey(
                        id,
                        name,
                        description,
                        base_price,
                        product_type,
                        parent_product_id,
                        option_groups:product_option_groups(
                            id,
                            name,
                            group_kind,
                            pricing_mode,
                            is_required,
                            values:product_option_values(
                                id,
                                name,
                                absolute_price,
                                price_modifier
                            )
                        )
                    )
                )
            )
        `
            )
            .eq("id", layoutCatalogId)
            .maybeSingle();

        if (catalogError || !catalogData) {
            return json(404, { error: "collection_not_found" });
        }

        const rawCatalog = catalogData as RawCatalogRow;
        console.error("PDF_RAW_CATALOG", JSON.stringify({
          categoriesCount: rawCatalog.categories?.length,
          categories: rawCatalog.categories?.map(c => ({
            name: c.name,
            productsCount: c.products?.length,
            products: c.products?.map(p => ({
              id: p.id,
              product_id: p.product_id,
              variant_product_id: p.variant_product_id,
              product: {
                id: p.product?.id,
                name: p.product?.name,
                parent_product_id: p.product?.parent_product_id,
                product_type: p.product?.product_type
              }
            }))
          }))
        }));
        const normalizedCatalog = normalizeCatalog(rawCatalog);
        if (!normalizedCatalog) {
            return json(404, { error: "collection_corrupted" });
        }

        // Initialize schedule
        let schedules: V2ActivityScheduleRow[] = [
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
                catalog: normalizedCatalog
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

        // ---------------------------------------------------------
        // Resolve Overrides (Visibility & Price)
        // ---------------------------------------------------------

        const visibilityOverridesByProductId: Record<string, VisibilityOverrideRow> = {};
        const overridesByProductId: Record<string, OverrideRow> = {};
        const priceOverridesByProductId: Record<string, PriceOverrideRow> = {};

        // Retrieve active visibility rule
        const activeVisibilityRuleScheduleId = ruleResolution.visibilityRule?.scheduleId ?? null;

        if (activeVisibilityRuleScheduleId && productIds.length > 0) {
            const { data: visibilityOverrideData } = await supabase
                .from("schedule_visibility_overrides")
                .select("product_id, visible")
                .eq("schedule_id", activeVisibilityRuleScheduleId)
                .in("product_id", productIds);

            for (const row of (visibilityOverrideData ?? []) as VisibilityOverrideRow[]) {
                visibilityOverridesByProductId[row.product_id] = row;
            }
        }

        schedules = schedules.map(schedule => ({
            ...schedule,
            catalog: applyVisibilityOverridesToCatalog(
                schedule.catalog,
                visibilityOverridesByProductId
            )
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
            const { data: overrideData } = await supabase
                .from("activity_product_overrides")
                .select("product_id, visible_override")
                .eq("activity_id", activityId)
                .in("product_id", visibleProductIds);

            for (const row of (overrideData ?? []) as OverrideRow[]) {
                overridesByProductId[row.product_id] = row;
            }
        }

        // Retrieve active price rule
        const activePriceRuleScheduleId = ruleResolution.priceRuleId;

        if (activePriceRuleScheduleId && visibleProductIds.length > 0) {
            const { data: priceOverrideData } = await supabase
                .from("schedule_price_overrides")
                .select("product_id, override_price, show_original_price")
                .eq("schedule_id", activePriceRuleScheduleId)
                .in("product_id", visibleProductIds);

            for (const row of (priceOverrideData ?? []) as PriceOverrideRow[]) {
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

        const activePrimary = pickWinner(
            schedulesWithItems.filter(schedule => schedule.slot === "primary")
        );
        const fallbackPrimary = activePrimary ? null : pickFallbackPrimary(schedulesWithItems, now);
        const finalPrimary = activePrimary ?? fallbackPrimary;

        if (!finalPrimary || !finalPrimary.catalog) {
            return json(404, { error: "no_visible_items" });
        }

        // -------------------------------------------------------------
        // Compile mapped sections for the PDF Template
        // -------------------------------------------------------------

        // Combine original rawCatalog categories names & products info with the resolved visible catalog tree.
        type ProductInfo = {
            name: string;
            description: string | null;
            base_price: number | null;
            parent_product_id: string | null;
            option_groups: RawOptionGroupRow[];
        };
        const productInfoMap: Record<string, ProductInfo> = {};
        if (rawCatalog.categories && Array.isArray(rawCatalog.categories)) {
            rawCatalog.categories.forEach(rawCat => {
                if (rawCat.products && Array.isArray(rawCat.products)) {
                    rawCat.products.forEach(rawIt => {
                        const rawPr = Array.isArray(rawIt.product)
                            ? rawIt.product[0]
                            : rawIt.product;
                        if (rawPr && rawPr.id && rawPr.name) {
                            productInfoMap[rawPr.id] = {
                                name: rawPr.name,
                                description: rawPr.description ?? null,
                                base_price: rawPr.base_price ?? null,
                                parent_product_id: rawPr.parent_product_id ?? null,
                                option_groups: normalizeMany(rawPr.option_groups)
                            };
                        }
                    });
                }
            });
        }

        // ── Helpers shared across sections ─────────────────────────────────
        function resolvePrice(productId, effectivePrice) {
            const info = productInfoMap[productId];
            const optGroups = info?.option_groups ?? [];
            let price = effectivePrice;
            let formats;
            if (price == null) {
                const pg = optGroups.find(
                    g => g.group_kind === "PRIMARY_PRICE" && g.pricing_mode === "ABSOLUTE"
                );
                if (pg) {
                    const valid = normalizeMany(pg.values).filter(
                        v => typeof v.absolute_price === "number"
                    );
                    if (valid.length === 1) {
                        price = valid[0].absolute_price;
                    } else if (valid.length > 1) {
                        formats = valid.map(v => ({ name: v.name ?? "", price: v.absolute_price }));
                    }
                }
            }
            return { price, formats };
        }

        function resolveAddons(productId) {
            const info = productInfoMap[productId];
            const optGroups = info?.option_groups ?? [];
            const addonGroups = optGroups.filter(g => g.group_kind === "ADDON");
            if (addonGroups.length === 0) return undefined;
            const result = addonGroups
                .map(g => {
                    const vals = normalizeMany(g.values)
                        .map(v => {
                            const vName = v.name ?? "";
                            if (g.is_required) return vName;
                            if (
                                g.pricing_mode === "ABSOLUTE" &&
                                typeof v.absolute_price === "number"
                            ) {
                                return v.absolute_price === 0
                                    ? vName
                                    : `${vName} € ${v.absolute_price.toFixed(2)}`;
                            }
                            if (
                                g.pricing_mode === "DELTA" &&
                                typeof v.price_modifier === "number"
                            ) {
                                if (v.price_modifier === 0) return vName;
                                const sign = v.price_modifier > 0 ? "+" : "";
                                return `${vName} ${sign}€ ${v.price_modifier.toFixed(2)}`;
                            }
                            return vName;
                        })
                        .filter(Boolean);
                    return {
                        label: g.is_required ? (g.name ?? "Opzione") : "Extra",
                        values: vals
                    };
                })
                .filter(g => g.values.length > 0);
            return result.length > 0 ? result : undefined;
        }

        const sections = finalPrimary.catalog.sections
            .map(section => {
                const rawSection = Array.isArray(rawCatalog.categories)
                    ? rawCatalog.categories.find(s => s.id === section.id)
                    : null;
                const label = rawSection?.name ?? "Categoria";

                // ── Step 1: flat list of visible items ─────────────────────────
                const flatItems = [];
                for (const item of section.items) {
                    if (!item.product_id) continue;
                    const visible =
                        overridesByProductId[item.product_id]?.visible_override ??
                        item.effective_visible ??
                        item.visible;
                    if (!visible) continue;

                    const info = productInfoMap[item.product_id];
                    const { price, formats } = resolvePrice(item.product_id, item.effective_price);
                    flatItems.push({
                        productId: item.product_id,
                        parentProductId: info?.parent_product_id ?? null,
                        name: info?.name ?? "Sconosciuto",
                        price,
                        original_price: item.original_price,
                        description: info?.description ?? null,
                        formats,
                        addons: resolveAddons(item.product_id)
                    });
                }

                // ── Step 2: IDs of parent products present in this section ─────
                const parentIdsInSection = new Set(
                    flatItems.filter(i => !i.parentProductId).map(i => i.productId)
                );

                // ── Step 3: map variant lists keyed by parent ID ───────────────
                const variantsByParentId = new Map();
                for (const fi of flatItems) {
                    if (fi.parentProductId && parentIdsInSection.has(fi.parentProductId)) {
                        if (!variantsByParentId.has(fi.parentProductId)) {
                            variantsByParentId.set(fi.parentProductId, []);
                        }
                        variantsByParentId.get(fi.parentProductId).push(fi);
                    }
                }

                // ── Step 4: build final ordered items ─────────────────────────
                const items = [];
                for (const fi of flatItems) {
                    // Variant whose parent is in this section → rendered under parent, skip here
                    if (fi.parentProductId && parentIdsInSection.has(fi.parentProductId)) continue;

                    const childVariants = (variantsByParentId.get(fi.productId) ?? [])
                        .map(v => {
                            // Skip if name AND price are identical to parent (no added info)
                            const sameName = v.name === fi.name;
                            const samePrice =
                                v.price === fi.price &&
                                (v.formats?.length ?? 0) === 0 &&
                                (fi.formats?.length ?? 0) === 0;
                            if (sameName && samePrice) return null;
                            return {
                                name: v.name,
                                price: v.price,
                                formats: v.formats,
                                // Only show description when it differs from the parent
                                description:
                                    v.description && v.description !== fi.description
                                        ? v.description
                                        : null
                            };
                        })
                        .filter(Boolean);

                    items.push({
                        ...fi,
                        ...(childVariants.length > 0 ? { variants: childVariants } : {})
                    });
                }

                return { id: section.id, label, items };
            })
            .filter(s => s.items.length > 0);

        console.error("PDF_FINAL_SECTIONS", JSON.stringify(
          sections.map(s => ({
            title: s.title,
            itemsCount: s.items?.length,
            items: s.items?.map(i => ({
              name: i.name,
              hasVariants: i.variants?.length > 0,
              variantNames: i.variants?.map(v => v.name)
            }))
          }))
        ));

        if (sections.length === 0) {
            return json(404, { error: "no_visible_items" });
        }

        const collectionName = rawCatalog.name ?? "Catalogo";

        const pdfDoc = await PDFDocument.create();
        const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
        const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
        const fontStrike = await pdfDoc.embedFont(StandardFonts.Helvetica);

        const PAGE_WIDTH = 595.28;
        const PAGE_HEIGHT = 841.89;
        const MARGIN_X = 50;
        const MARGIN_TOP = 60;
        const MARGIN_BOTTOM = 60;

        const TITLE_SIZE = 20;
        const COLLECTION_SIZE = 16;
        const SECTION_SIZE = 14;
        const ITEM_SIZE = 12;
        const FORMAT_SIZE = ITEM_SIZE - 1;   // 11 — formati/varianti
        const DESC_SIZE = ITEM_SIZE - 2;     // 10 — descrizione e addon

        const TITLE_LINE = TITLE_SIZE * 1.4;
        const COLLECTION_LINE = COLLECTION_SIZE * 1.4;
        const SECTION_LINE = SECTION_SIZE * 1.4;
        const ITEM_LINE = ITEM_SIZE * 1.35;
        const FORMAT_LINE_H = FORMAT_SIZE * 1.4;
        const DESC_LINE_H = DESC_SIZE * 1.4;
        const INDENT = 14;

        let page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
        let y = PAGE_HEIGHT - MARGIN_TOP;

        const ensureSpace = (height: number) => {
            // Basic pagination: add a new page when space is not enough
            if (y - height < MARGIN_BOTTOM) {
                page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
                y = PAGE_HEIGHT - MARGIN_TOP;
            }
        };

        // Header: business name and active collection title
        ensureSpace(TITLE_LINE);
        page.drawText(businessRow.name, {
            x: MARGIN_X,
            y,
            size: TITLE_SIZE,
            font: fontBold,
            color: rgb(0, 0, 0)
        });
        y -= TITLE_LINE;

        ensureSpace(COLLECTION_LINE);
        page.drawText(collectionName, {
            x: MARGIN_X,
            y,
            size: COLLECTION_SIZE,
            font: fontRegular,
            color: rgb(0, 0, 0)
        });
        y -= COLLECTION_LINE;

        // Sections and items
        for (const section of sections) {
            ensureSpace(SECTION_LINE);
            page.drawText(section.label, {
                x: MARGIN_X,
                y,
                size: SECTION_SIZE,
                font: fontBold,
                color: rgb(0, 0, 0)
            });
            y -= SECTION_LINE;

            for (const item of section.items) {
                const hasFormats = Array.isArray(item.formats) && item.formats.length > 0;

                // ── Format string ──────────────────────────────────────────────
                let formatStr: string | null = null;
                if (hasFormats) {
                    formatStr = item.formats!
                        .map(f => f.name ? `${f.name} € ${f.price.toFixed(2)}` : `€ ${f.price.toFixed(2)}`)
                        .join("  |  ");
                }

                // ── Simple price (right-aligned, only when no formats) ─────────
                let priceText: string | null = null;
                let oldPriceText: string | null = null;
                let totalPriceWidth = 0;
                let oldPriceWidth = 0;

                if (!hasFormats) {
                    if (item.price != null) {
                        priceText = `€ ${item.price.toFixed(2)}`;
                        totalPriceWidth = fontRegular.widthOfTextAtSize(priceText, ITEM_SIZE);
                        if (item.original_price != null) {
                            oldPriceText = `€ ${item.original_price.toFixed(2)}`;
                            oldPriceWidth = fontStrike.widthOfTextAtSize(oldPriceText, ITEM_SIZE - 2);
                            totalPriceWidth += oldPriceWidth + 5;
                        }
                    }
                }

                const priceStartX = priceText
                    ? PAGE_WIDTH - MARGIN_X - totalPriceWidth
                    : PAGE_WIDTH - MARGIN_X;
                const maxNameWidth = priceText
                    ? priceStartX - MARGIN_X - 10
                    : PAGE_WIDTH - 2 * MARGIN_X;

                // ── Check if format fits on same line as name ──────────────────
                let formatSameLine = false;
                if (hasFormats && formatStr) {
                    const nameW = fontRegular.widthOfTextAtSize(item.name, ITEM_SIZE);
                    const fmtW = fontRegular.widthOfTextAtSize(formatStr, FORMAT_SIZE);
                    if (nameW + 12 + fmtW <= PAGE_WIDTH - 2 * MARGIN_X) {
                        formatSameLine = true;
                    }
                }

                const nameLines = wrapText(item.name, maxNameWidth, fontRegular, ITEM_SIZE);

                // ── Draw name lines ────────────────────────────────────────────
                for (let i = 0; i < nameLines.length; i++) {
                    ensureSpace(ITEM_LINE);
                    page.drawText(nameLines[i], {
                        x: MARGIN_X,
                        y,
                        size: ITEM_SIZE,
                        font: fontRegular,
                        color: rgb(0, 0, 0)
                    });

                    if (i === 0) {
                        if (priceText) {
                            // Simple price: right-aligned with optional strikethrough
                            let currentPriceX = priceStartX;
                            if (oldPriceText) {
                                page.drawText(oldPriceText, {
                                    x: currentPriceX,
                                    y: y + 1,
                                    size: ITEM_SIZE - 2,
                                    font: fontStrike,
                                    color: rgb(0.5, 0.5, 0.5)
                                });
                                const textHeight = (ITEM_SIZE - 2) * 0.4;
                                page.drawLine({
                                    start: { x: currentPriceX - 1, y: y + 1 + textHeight },
                                    end: { x: currentPriceX + oldPriceWidth + 1, y: y + 1 + textHeight },
                                    thickness: 1,
                                    color: rgb(0.5, 0.5, 0.5)
                                });
                                currentPriceX += oldPriceWidth + 5;
                            }
                            page.drawText(priceText, {
                                x: currentPriceX,
                                y,
                                size: ITEM_SIZE,
                                font: fontRegular,
                                color: rgb(0, 0, 0)
                            });
                        } else if (formatSameLine && formatStr) {
                            // Formats on same line, right after name
                            const nameW = fontRegular.widthOfTextAtSize(nameLines[0], ITEM_SIZE);
                            page.drawText(formatStr, {
                                x: MARGIN_X + nameW + 12,
                                y,
                                size: FORMAT_SIZE,
                                font: fontRegular,
                                color: rgb(0.2, 0.2, 0.2)
                            });
                        }
                    }

                    y -= ITEM_LINE;
                }

                // ── Formats on next line (if didn't fit on same line) ──────────
                if (hasFormats && formatStr && !formatSameLine) {
                    const fmtLines = wrapText(
                        formatStr,
                        PAGE_WIDTH - 2 * MARGIN_X - INDENT,
                        fontRegular,
                        FORMAT_SIZE
                    );
                    for (const fl of fmtLines) {
                        ensureSpace(FORMAT_LINE_H);
                        page.drawText(fl, {
                            x: MARGIN_X + INDENT,
                            y,
                            size: FORMAT_SIZE,
                            font: fontRegular,
                            color: rgb(0.2, 0.2, 0.2)
                        });
                        y -= FORMAT_LINE_H;
                    }
                }

                // ── Description ────────────────────────────────────────────────
                if (item.description) {
                    const descLines = wrapText(
                        item.description,
                        PAGE_WIDTH - 2 * MARGIN_X - INDENT,
                        fontRegular,
                        DESC_SIZE
                    );
                    for (const dl of descLines) {
                        ensureSpace(DESC_LINE_H);
                        page.drawText(dl, {
                            x: MARGIN_X + INDENT,
                            y,
                            size: DESC_SIZE,
                            font: fontRegular,
                            color: rgb(0.5, 0.5, 0.5)
                        });
                        y -= DESC_LINE_H;
                    }
                }

                // ── Addon groups ───────────────────────────────────────────────
                if (item.addons) {
                    for (const addon of item.addons) {
                        const addonLine = `${addon.label}: ${addon.values.join(", ")}`;
                        const adlLines = wrapText(
                            addonLine,
                            PAGE_WIDTH - 2 * MARGIN_X - INDENT,
                            fontRegular,
                            DESC_SIZE
                        );
                        for (const al of adlLines) {
                            ensureSpace(DESC_LINE_H);
                            page.drawText(al, {
                                x: MARGIN_X + INDENT,
                                y,
                                size: DESC_SIZE,
                                font: fontRegular,
                                color: rgb(0.5, 0.5, 0.5)
                            });
                            y -= DESC_LINE_H;
                        }
                    }
                }

                // ── Variants ──────────────────────────────────────────────────
                if (item.variants && item.variants.length > 0) {
                    const VARIANT_INDENT = INDENT + 10;
                    const VARIANT_SIZE = DESC_SIZE;
                    const VARIANT_LINE_H = VARIANT_SIZE * 1.35;

                    ensureSpace(DESC_LINE_H);
                    page.drawText("Varianti:", {
                        x: MARGIN_X + INDENT,
                        y,
                        size: DESC_SIZE,
                        font: fontRegular,
                        color: rgb(0.5, 0.5, 0.5)
                    });
                    y -= DESC_LINE_H;

                    for (const variant of item.variants) {
                        const hasVFormats = Array.isArray(variant.formats) && variant.formats.length > 0;

                        let vFormatStr = null;
                        if (hasVFormats) {
                            vFormatStr = variant.formats
                                .map(f => f.name ? `${f.name} € ${f.price.toFixed(2)}` : `€ ${f.price.toFixed(2)}`)
                                .join("  |  ");
                        }

                        let vPriceText = null;
                        let vTotalPriceWidth = 0;
                        if (!hasVFormats && variant.price != null) {
                            vPriceText = `€ ${variant.price.toFixed(2)}`;
                            vTotalPriceWidth = fontRegular.widthOfTextAtSize(vPriceText, VARIANT_SIZE);
                        }

                        const vPriceStartX = vPriceText
                            ? PAGE_WIDTH - MARGIN_X - vTotalPriceWidth
                            : PAGE_WIDTH - MARGIN_X;
                        const vMaxNameWidth = vPriceText
                            ? vPriceStartX - MARGIN_X - VARIANT_INDENT - 10
                            : PAGE_WIDTH - MARGIN_X - VARIANT_INDENT;

                        let vFormatSameLine = false;
                        if (hasVFormats && vFormatStr) {
                            const vNameW = fontRegular.widthOfTextAtSize(variant.name, VARIANT_SIZE);
                            const vFmtW = fontRegular.widthOfTextAtSize(vFormatStr, VARIANT_SIZE - 1);
                            if (vNameW + 12 + vFmtW <= PAGE_WIDTH - MARGIN_X - VARIANT_INDENT) {
                                vFormatSameLine = true;
                            }
                        }

                        const vNameLines = wrapText(variant.name, vMaxNameWidth, fontRegular, VARIANT_SIZE);
                        for (let i = 0; i < vNameLines.length; i++) {
                            ensureSpace(VARIANT_LINE_H);
                            page.drawText(vNameLines[i], {
                                x: MARGIN_X + VARIANT_INDENT,
                                y,
                                size: VARIANT_SIZE,
                                font: fontRegular,
                                color: rgb(0.2, 0.2, 0.2)
                            });
                            if (i === 0) {
                                if (vPriceText) {
                                    page.drawText(vPriceText, {
                                        x: vPriceStartX,
                                        y,
                                        size: VARIANT_SIZE,
                                        font: fontRegular,
                                        color: rgb(0.2, 0.2, 0.2)
                                    });
                                } else if (vFormatSameLine && vFormatStr) {
                                    const vNameW = fontRegular.widthOfTextAtSize(vNameLines[0], VARIANT_SIZE);
                                    page.drawText(vFormatStr, {
                                        x: MARGIN_X + VARIANT_INDENT + vNameW + 12,
                                        y,
                                        size: VARIANT_SIZE - 1,
                                        font: fontRegular,
                                        color: rgb(0.3, 0.3, 0.3)
                                    });
                                }
                            }
                            y -= VARIANT_LINE_H;
                        }

                        if (hasVFormats && vFormatStr && !vFormatSameLine) {
                            const vFmtLines = wrapText(
                                vFormatStr,
                                PAGE_WIDTH - MARGIN_X - VARIANT_INDENT - INDENT,
                                fontRegular,
                                VARIANT_SIZE - 1
                            );
                            for (const fl of vFmtLines) {
                                ensureSpace(FORMAT_LINE_H);
                                page.drawText(fl, {
                                    x: MARGIN_X + VARIANT_INDENT + INDENT,
                                    y,
                                    size: VARIANT_SIZE - 1,
                                    font: fontRegular,
                                    color: rgb(0.3, 0.3, 0.3)
                                });
                                y -= FORMAT_LINE_H;
                            }
                        }

                        if (variant.description) {
                            const vDescLines = wrapText(
                                variant.description,
                                PAGE_WIDTH - MARGIN_X - VARIANT_INDENT - INDENT,
                                fontRegular,
                                VARIANT_SIZE - 1
                            );
                            for (const dl of vDescLines) {
                                ensureSpace(DESC_LINE_H);
                                page.drawText(dl, {
                                    x: MARGIN_X + VARIANT_INDENT + INDENT,
                                    y,
                                    size: VARIANT_SIZE - 1,
                                    font: fontRegular,
                                    color: rgb(0.6, 0.6, 0.6)
                                });
                                y -= DESC_LINE_H;
                            }
                        }
                    }
                }

                // Small gap between items
                y -= 3;
            }

            // Extra spacing between sections
            y -= 6;
        }

        const pdfBytes = await pdfDoc.save();

        const safeName = businessRow.name.replace(/[^a-zA-Z0-9-_]+/g, "_");
        const safeCatalog = (rawCatalog.name ?? "").replace(/[^a-zA-Z0-9-_]+/g, "_");
        const filename = safeName
            ? safeCatalog
                ? `menu-${safeName}-${safeCatalog}.pdf`
                : `menu-${safeName}.pdf`
            : "menu.pdf";

        // 6) Return the PDF as a binary response
        return new Response(pdfBytes, {
            headers: {
                ...corsHeaders,
                "Content-Type": "application/pdf",
                "Content-Disposition": `attachment; filename="${filename}"`
            }
        });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        const stack = err instanceof Error ? err.stack : undefined;
        return json(500, { error: "internal_server_error", message, stack });
    }
});
