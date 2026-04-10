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

type RawVariantRow = {
    id: string;
    name: string | null;
    description: string | null;
    base_price: number | null;
    product_type: string | null;
    option_groups: RawOptionGroupRow[] | RawOptionGroupRow | null;
};

type RawProductRow = {
    id: string;
    name: string | null;
    description: string | null;
    base_price: number | null;
    product_type: string | null;
    parent_product_id: string | null;
    option_groups: RawOptionGroupRow[] | RawOptionGroupRow | null;
    variants: RawVariantRow[] | RawVariantRow | null;
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
    // Sanitize at entry so all internal width measurements operate on safe text.
    // sanitizeText is defined later in the module; it is hoisted as a function declaration.
    text = sanitizeText(text);
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

function sanitizeText(text: string): string {
    return text
        .replace(/[\u00A0\u202F\u2007\u2060]/g, " ")   // no-break spaces → normal space
        .replace(/[\u2018\u2019]/g, "'")                  // smart single quotes
        .replace(/[\u201C\u201D]/g, '"')                  // smart double quotes
        .replace(/[\u2013\u2014]/g, "-")                  // en/em dash → hyphen
        .replace(/\u2026/g, "...")                        // ellipsis → three dots
        .replace(/[\u00AE\u2122]/g, "")                   // ® ™ → remove
        .replace(/[^\x00-\xFF\u20AC]/g, "");              // strip non-WinAnsi, but keep € (U+20AC)
}

// safeDrawText and safeWidth sanitize all text before handing it to pdf-lib.
// Every page.drawText / font.widthOfTextAtSize call in the rendering block must
// go through these two helpers to avoid WinAnsi encoding errors at runtime.
function safeDrawText(pg, text: string, options) {
    pg.drawText(sanitizeText(text), options);
}

function safeWidth(font, text: string, size: number): number {
    return font.widthOfTextAtSize(sanitizeText(text), size);
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
                        ),
                        variants:products!parent_product_id(
                            id,
                            name,
                            description,
                            base_price,
                            product_type,
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
            )
        `
            )
            .eq("id", layoutCatalogId)
            .maybeSingle();

        if (catalogError || !catalogData) {
            return json(404, { error: "collection_not_found" });
        }

        const rawCatalog = catalogData as RawCatalogRow;
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
        type VariantInfo = {
            id: string;
            name: string;
            description: string | null;
            base_price: number | null;
            option_groups: RawOptionGroupRow[];
        };
        type ProductInfo = {
            name: string;
            description: string | null;
            base_price: number | null;
            parent_product_id: string | null;
            option_groups: RawOptionGroupRow[];
            variants: VariantInfo[];
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
                            const rawVariants = normalizeMany(rawPr.variants) as RawVariantRow[];
                            const variantInfos: VariantInfo[] = rawVariants
                                .filter(v => v.id && v.name)
                                .map(v => ({
                                    id: v.id,
                                    name: v.name!,
                                    description: v.description ?? null,
                                    base_price: v.base_price ?? null,
                                    option_groups: normalizeMany(v.option_groups)
                                }));
                            productInfoMap[rawPr.id] = {
                                name: rawPr.name,
                                description: rawPr.description ?? null,
                                base_price: rawPr.base_price ?? null,
                                parent_product_id: rawPr.parent_product_id ?? null,
                                option_groups: normalizeMany(rawPr.option_groups),
                                variants: variantInfos
                            };
                            // Also index each variant so resolvePrice/resolveAddons work for them
                            for (const vi of variantInfos) {
                                productInfoMap[vi.id] = {
                                    name: vi.name,
                                    description: vi.description,
                                    base_price: vi.base_price,
                                    parent_product_id: rawPr.id,
                                    option_groups: vi.option_groups,
                                    variants: []
                                };
                            }
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

                // ── Step 1: flat list of visible items (deduplicated by product_id) ──
                const flatItems = [];
                const seenProductIds = new Set();
                for (const item of section.items) {
                    if (!item.product_id) continue;
                    if (seenProductIds.has(item.product_id)) continue;
                    seenProductIds.add(item.product_id);
                    const visible =
                        overridesByProductId[item.product_id]?.visible_override ??
                        item.effective_visible ??
                        item.visible;
                    if (!visible) continue;

                    const info = productInfoMap[item.product_id];
                    const { price, formats } = resolvePrice(item.product_id, item.effective_price);
                    flatItems.push({
                        productId: item.product_id,
                        name: info?.name ?? "Sconosciuto",
                        price,
                        original_price: item.original_price,
                        description: info?.description ?? null,
                        formats,
                        addons: resolveAddons(item.product_id)
                    });
                }

                // ── Step 2: build final ordered items (variants loaded nested) ──
                const items = [];
                for (const fi of flatItems) {
                    const info = productInfoMap[fi.productId];
                    const rawVariants = info?.variants ?? [];

                    const childVariants = rawVariants
                        .map(v => {
                            let { price: vPrice, formats: vFormats } = resolvePrice(v.id, v.base_price);
                            if (vPrice == null && (vFormats?.length ?? 0) === 0) {
                                vPrice = fi.price;
                                vFormats = fi.formats;
                            }
                            // Skip if name AND price are identical to parent (no added info)
                            const sameName = v.name === fi.name;
                            const samePrice =
                                vPrice === fi.price &&
                                (vFormats?.length ?? 0) === 0 &&
                                (fi.formats?.length ?? 0) === 0;
                            if (sameName && samePrice) return null;
                            return {
                                name: v.name,
                                price: vPrice,
                                formats: vFormats,
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

        if (sections.length === 0) {
            return json(404, { error: "no_visible_items" });
        }

        const collectionName = rawCatalog.name ?? "Catalogo";

        const pdfDoc = await PDFDocument.create();
        const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
        const fontBold    = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

        // ── Design system ─────────────────────────────────────────────────────
        const PAGE_W = 595;
        const PAGE_H = 842;
        const MARGIN  = 40;
        const CONTENT_W    = PAGE_W - 2 * MARGIN;
        const FOOTER_RESERVED = 24;
        const CONTENT_BOTTOM  = MARGIN + FOOTER_RESERVED;

        const C_PRIMARY   = rgb(0.10, 0.10, 0.10);
        const C_SECONDARY = rgb(0.45, 0.45, 0.45);
        const C_TERTIARY  = rgb(0.60, 0.60, 0.60);
        const C_LINE_STR  = rgb(0.10, 0.10, 0.10);
        const C_LINE_LT   = rgb(0.85, 0.85, 0.85);

        const SZ_SEDE    = 9;
        const SZ_CATALOG = 20;
        const SZ_CAT     = 12;
        const SZ_ITEM    = 13;
        const SZ_PRICE   = 12;
        const SZ_DESC    = 10;
        const SZ_ADDON   = 10;
        const SZ_VARLBL  = 9;
        const SZ_VARNM   = 12;
        const SZ_VARDET  = 11;
        const SZ_FOOTER  = 9;

        const LH_CATALOG = SZ_CATALOG * 1.35;
        const LH_ITEM    = SZ_ITEM    * 1.35;
        const LH_DESC    = SZ_DESC    * 1.5;
        const LH_ADDON   = SZ_ADDON   * 1.5;
        const LH_VARLBL  = SZ_VARLBL  * 1.4;
        const LH_VARNM   = SZ_VARNM   * 1.35;
        const LH_VARDET  = SZ_VARDET  * 1.5;

        // ── Page management ───────────────────────────────────────────────────
        let page = pdfDoc.addPage([PAGE_W, PAGE_H]);
        let y = PAGE_H - MARGIN;

        function newPage() {
            page = pdfDoc.addPage([PAGE_W, PAGE_H]);
            y = PAGE_H - MARGIN;
        }

        function checkSpace(needed) {
            if (y - needed < CONTENT_BOTTOM) newPage();
        }

        // ── Text helpers ──────────────────────────────────────────────────────
        // Draw text with extra letter-spacing (character-by-character).
        // Sanitizes text at entry to avoid WinAnsi encoding errors.
        function drawSpaced(pg, text, x, baseline, size, font, color, spacing) {
            const safe = sanitizeText(text);
            let cx = x;
            for (const ch of safe) {
                safeDrawText(pg, ch, { x: cx, y: baseline, size, font, color });
                cx += font.widthOfTextAtSize(ch, size) + spacing;
            }
        }

        function spacedWidth(font, text, size, spacing) {
            const safe = sanitizeText(text);
            let w = 0;
            for (const ch of safe) w += font.widthOfTextAtSize(ch, size) + spacing;
            return Math.max(0, w - spacing);
        }

        // ── Formats helpers ───────────────────────────────────────────────────
        // Builds an array of right-aligned format lines.
        // Each element is a string ready to draw: "Name € X.XX | Name2 € Y.YY".
        // Lines are split when the accumulated width exceeds maxW.
        function buildFormatsLines(formats, font, size, maxW) {
            const SEP  = " | ";
            const sepW = safeWidth(font, SEP, size);
            const lines = [];
            let current = [];
            let currentW = 0;

            for (const f of formats) {
                const label  = sanitizeText(
                    f.name
                        ? `${f.name} \u20AC ${(f.price ?? 0).toFixed(2)}`
                        : `\u20AC ${(f.price ?? 0).toFixed(2)}`
                );
                const labelW = safeWidth(font, label, size);
                const gap    = current.length > 0 ? sepW : 0;

                if (current.length > 0 && currentW + gap + labelW > maxW) {
                    lines.push(current.join(SEP));
                    current  = [label];
                    currentW = labelW;
                } else {
                    currentW += gap + labelW;
                    current.push(label);
                }
            }
            if (current.length > 0) lines.push(current.join(SEP));
            return lines;
        }

        // Truncates text to the last whole word that fits within maxW, appending "...".
        function truncateName(text, font, size, maxW) {
            if (safeWidth(font, text, size) <= maxW) return text;
            const ellipsis = "...";
            const ellW     = safeWidth(font, ellipsis, size);
            const words    = text.split(/\s+/);
            let result     = "";
            for (const word of words) {
                const candidate = result ? `${result} ${word}` : word;
                if (safeWidth(font, `${candidate}${ellipsis}`, size) <= maxW) {
                    result = candidate;
                } else {
                    break;
                }
            }
            return result ? `${result}${ellipsis}` : ellipsis;
        }

        // ── Product height estimator (for no-break pagination) ────────────────
        function estimateProductHeight(item) {
            const hasFormats = Array.isArray(item.formats) && item.formats.length > 0;
            let h = LH_ITEM;
            if (hasFormats)       h += LH_ITEM; // worst case: formats on second line
            if (item.description) h += 3 + Math.min(2, wrapText(item.description.slice(0, 150), CONTENT_W, fontRegular, SZ_DESC).length) * LH_DESC;
            if (item.addons?.length > 0) h += 3 + item.addons.length * LH_ADDON;
            if (item.variants?.length > 0) {
                h += 4;
                for (const v of item.variants) {
                    h += LH_VARLBL + LH_VARNM;
                    if (v.description) h += LH_VARDET;
                }
            }
            return h;
        }

        // ── HEADER (first page only) ──────────────────────────────────────────
        const sedeText = businessRow.name.toUpperCase();
        const sedeW    = spacedWidth(fontRegular, sedeText, SZ_SEDE, 0.8);
        drawSpaced(page, sedeText, (PAGE_W - sedeW) / 2, y, SZ_SEDE, fontRegular, C_SECONDARY, 0.8);
        y -= SZ_SEDE * 1.4 + 6;

        const catalogW = safeWidth(fontBold, collectionName, SZ_CATALOG);
        safeDrawText(page, collectionName, { x: (PAGE_W - catalogW) / 2, y, size: SZ_CATALOG, font: fontBold, color: C_PRIMARY });
        y -= LH_CATALOG + 12;

        page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_W - MARGIN, y }, thickness: 2, color: C_LINE_STR });
        y -= 24;

        // ── SECTIONS ──────────────────────────────────────────────────────────
        for (let si = 0; si < sections.length; si++) {
            const section = sections[si];

            // Ensure space for category header + at least first product
            // Header height: category text line + underline gap + 12pt below
            const CAT_HEADER_H = SZ_CAT * 1.5 + 12;
            const firstProductH = section.items.length > 0 ? estimateProductHeight(section.items[0]) : 0;
            if (y - (CAT_HEADER_H + firstProductH) < CONTENT_BOTTOM) newPage();

            // Category name: uppercase, spaced, bold, secondary
            const catText = section.label.toUpperCase();
            drawSpaced(page, catText, MARGIN, y, SZ_CAT, fontBold, C_SECONDARY, 1.5);
            y -= SZ_CAT * 1.5;

            // Light underline, 4pt below text
            page.drawLine({
                start: { x: MARGIN, y: y + SZ_CAT * 0.3 },
                end:   { x: PAGE_W - MARGIN, y: y + SZ_CAT * 0.3 },
                thickness: 0.5,
                color: C_LINE_LT
            });
            y -= 12;

            // ── ITEMS ──────────────────────────────────────────────────────────
            for (let ii = 0; ii < section.items.length; ii++) {
                const item = section.items[ii];

                // No-break: move to new page if product block won't fit
                const estimated = estimateProductHeight(item);
                if (y - estimated < CONTENT_BOTTOM) newPage();

                const hasFormats = Array.isArray(item.formats) && item.formats.length > 0;

                // ── Name + Price/Formats ──────────────────────────────────────
                // Name is capped at 55% of CONTENT_W so price/formats always
                // have room on the right.
                const NAME_MAX_W  = CONTENT_W * 0.55;
                const PRICE_MAX_W = CONTENT_W * 0.45;
                const RIGHT_EDGE  = MARGIN + CONTENT_W;

                // Truncate name to a single line within NAME_MAX_W
                const nameSingle = truncateName(item.name, fontBold, SZ_ITEM, NAME_MAX_W);

                if (hasFormats) {
                    // Build format lines at SZ_PRICE / bold — same style as single price
                    const fmtLines  = buildFormatsLines(item.formats, fontBold, SZ_PRICE, PRICE_MAX_W);
                    const fmtLine0W = safeWidth(fontBold, fmtLines[0], SZ_PRICE);
                    const sameLine  = fmtLines.length === 1; // single line → draw on name row

                    // Name row
                    checkSpace(LH_ITEM);
                    safeDrawText(page, nameSingle, { x: MARGIN, y, size: SZ_ITEM, font: fontBold, color: C_PRIMARY });
                    if (sameLine) {
                        safeDrawText(page, fmtLines[0], { x: RIGHT_EDGE - fmtLine0W, y, size: SZ_PRICE, font: fontBold, color: C_PRIMARY });
                    }
                    y -= LH_ITEM;

                    // Overflow format lines (including line 0 when multi-line)
                    const startIdx = sameLine ? 1 : 0;
                    for (let fi = startIdx; fi < fmtLines.length; fi++) {
                        checkSpace(LH_ITEM);
                        const lw = safeWidth(fontBold, fmtLines[fi], SZ_PRICE);
                        safeDrawText(page, fmtLines[fi], { x: RIGHT_EDGE - lw, y, size: SZ_PRICE, font: fontBold, color: C_PRIMARY });
                        y -= LH_ITEM;
                    }
                } else {
                    // Single price or no price
                    let priceText     = null;
                    let origPriceText = null;
                    let priceW        = 0;
                    let origW         = 0;

                    if (item.price != null) {
                        priceText = `\u20AC ${item.price.toFixed(2)}`;
                        priceW    = safeWidth(fontBold, priceText, SZ_PRICE);
                        if (item.original_price != null) {
                            origPriceText = `\u20AC ${item.original_price.toFixed(2)}`;
                            origW         = safeWidth(fontRegular, origPriceText, SZ_PRICE - 2);
                        }
                    }

                    checkSpace(LH_ITEM);
                    safeDrawText(page, nameSingle, { x: MARGIN, y, size: SZ_ITEM, font: fontBold, color: C_PRIMARY });

                    if (priceText) {
                        if (origPriceText) {
                            const ox = RIGHT_EDGE - priceW - 6 - origW;
                            safeDrawText(page, origPriceText, { x: ox, y: y + 1, size: SZ_PRICE - 2, font: fontRegular, color: C_SECONDARY });
                            const strikeY = y + 1 + (SZ_PRICE - 2) * 0.35;
                            page.drawLine({ start: { x: ox - 1, y: strikeY }, end: { x: ox + origW + 1, y: strikeY }, thickness: 0.8, color: C_SECONDARY });
                        }
                        safeDrawText(page, priceText, { x: RIGHT_EDGE - priceW, y, size: SZ_PRICE, font: fontBold, color: C_PRIMARY });
                    }

                    y -= LH_ITEM;
                }

                // ── Description (max 2 lines) ─────────────────────────────────
                if (item.description) {
                    const raw   = item.description.length > 150
                        ? item.description.slice(0, 150).replace(/\s+\S*$/, "") + "..."
                        : item.description;
                    const lines = wrapText(raw, CONTENT_W, fontRegular, SZ_DESC).slice(0, 2);
                    y -= 3;
                    for (const dl of lines) {
                        checkSpace(LH_DESC);
                        safeDrawText(page, dl, { x: MARGIN, y, size: SZ_DESC, font: fontRegular, color: C_SECONDARY });
                        y -= LH_DESC;
                    }
                }

                // ── Addons ────────────────────────────────────────────────────
                if (item.addons?.length > 0) {
                    y -= 3;
                    for (const addon of item.addons) {
                        const str   = `${addon.label}: ${addon.values.join(", ")}`;
                        const lines = wrapText(str, CONTENT_W, fontRegular, SZ_ADDON);
                        for (const al of lines) {
                            checkSpace(LH_ADDON);
                            safeDrawText(page, al, { x: MARGIN, y, size: SZ_ADDON, font: fontRegular, color: C_TERTIARY });
                            y -= LH_ADDON;
                        }
                    }
                }

                // ── Variants ──────────────────────────────────────────────────
                if (item.variants?.length > 0) {
                    const VAR_X      = MARGIN;
                    const VAR_CONT_W = CONTENT_W;

                    y -= 4;

                    for (let vi = 0; vi < item.variants.length; vi++) {
                        const variant = item.variants[vi];
                        if (vi > 0) y -= 8;

                        // "VARIANTE" label — 8pt, letter-spacing 1pt, tertiary
                        checkSpace(LH_VARLBL + 6);
                        drawSpaced(page, "VARIANTE", VAR_X, y, 8, fontRegular, C_TERTIARY, 1);
                        y -= 8 * 1.4 + 6;

                        // variant name + price/formats (same logic as parent, 1pt smaller)
                        const vHasFormats  = Array.isArray(variant.formats) && variant.formats.length > 0;
                        const VAR_NAME_MAX = VAR_CONT_W * 0.55;
                        const VAR_PRICE_MAX = VAR_CONT_W * 0.45;
                        const VAR_RIGHT    = MARGIN + VAR_CONT_W;
                        const vNameSingle  = truncateName(variant.name, fontBold, SZ_VARNM, VAR_NAME_MAX);

                        if (vHasFormats) {
                            const vFmtLines  = buildFormatsLines(variant.formats, fontBold, SZ_VARNM, VAR_PRICE_MAX);
                            const vFmtLine0W = safeWidth(fontBold, vFmtLines[0], SZ_VARNM);
                            const vSameLine  = vFmtLines.length === 1;

                            checkSpace(LH_VARNM);
                            safeDrawText(page, vNameSingle, { x: VAR_X, y, size: SZ_VARNM, font: fontBold, color: C_PRIMARY });
                            if (vSameLine) {
                                safeDrawText(page, vFmtLines[0], { x: VAR_RIGHT - vFmtLine0W, y, size: SZ_VARNM, font: fontBold, color: C_PRIMARY });
                            }
                            y -= LH_VARNM;

                            const vStartIdx = vSameLine ? 1 : 0;
                            for (let fi = vStartIdx; fi < vFmtLines.length; fi++) {
                                checkSpace(LH_VARNM);
                                const lw = safeWidth(fontBold, vFmtLines[fi], SZ_VARNM);
                                safeDrawText(page, vFmtLines[fi], { x: VAR_RIGHT - lw, y, size: SZ_VARNM, font: fontBold, color: C_PRIMARY });
                                y -= LH_VARNM;
                            }
                        } else {
                            let vPriceText = null;
                            let vPriceW    = 0;
                            if (variant.price != null) {
                                vPriceText = `\u20AC ${variant.price.toFixed(2)}`;
                                vPriceW    = safeWidth(fontBold, vPriceText, SZ_VARNM);
                            }
                            checkSpace(LH_VARNM);
                            safeDrawText(page, vNameSingle, { x: VAR_X, y, size: SZ_VARNM, font: fontBold, color: C_PRIMARY });
                            if (vPriceText) {
                                safeDrawText(page, vPriceText, { x: VAR_RIGHT - vPriceW, y, size: SZ_VARNM, font: fontBold, color: C_PRIMARY });
                            }
                            y -= LH_VARNM;
                        }

                        // variant description (only if differs from parent)
                        if (variant.description) {
                            const raw   = variant.description.length > 100
                                ? variant.description.slice(0, 100).replace(/\s+\S*$/, "") + "..."
                                : variant.description;
                            const lines = wrapText(raw, VAR_CONT_W, fontRegular, SZ_VARDET).slice(0, 2);
                            y -= 2;
                            for (const dl of lines) {
                                checkSpace(LH_VARDET);
                                safeDrawText(page, dl, { x: VAR_X, y, size: SZ_VARDET, font: fontRegular, color: C_SECONDARY });
                                y -= LH_VARDET;
                            }
                        }
                    }
                }

                // Gap between products
                y -= 14;
            }

            // Gap between categories
            if (si < sections.length - 1) y -= 20;
        }

        // ── BRANDING (last page only) ─────────────────────────────────────────
        const totalPages = pdfDoc.getPageCount();
        const lastPg     = pdfDoc.getPage(totalPages - 1);
        const brandLineY = MARGIN + 16;
        const brandTextY = MARGIN + 4;
        lastPg.drawLine({ start: { x: MARGIN, y: brandLineY }, end: { x: PAGE_W - MARGIN, y: brandLineY }, thickness: 0.5, color: C_LINE_LT });
        const brandText  = "Generato con CataloGlobe";
        const brandTextW = safeWidth(fontRegular, brandText, 8);
        safeDrawText(lastPg, brandText, { x: (PAGE_W - brandTextW) / 2, y: brandTextY, size: 8, font: fontRegular, color: C_TERTIARY });

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
