// @ts-nocheck
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1?target=deno";

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

type RawProductRow = {
    id: string;
    base_price: number | null;
    name: string | null;
};

type RawCatalogItemRow = {
    id: string;
    order_index: number | null;
    visible: boolean | null;
    product: RawProductRow | RawProductRow[] | null;
};

type RawCatalogSectionRow = {
    id: string;
    label: string | null;
    order_index: number | null;
    items: RawCatalogItemRow[] | RawCatalogItemRow | null;
};

type RawCatalogRow = {
    id: string;
    name: string | null;
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

type ActivityRow = {
    id: string;
    name: string;
    tenant_id: string;
    v2_tenants: {
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

    return from <= nowMinutes && nowMinutes < to;
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

function getNowInTimeZone(timeZone: string) {
    const formatter = new Intl.DateTimeFormat("en-GB", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false
    });

    const parts = formatter.formatToParts(new Date());
    const map: Record<string, string> = {};
    for (const part of parts) {
        if (part.type !== "literal") map[part.type] = part.value;
    }

    const year = Number(map.year);
    const month = Number(map.month);
    const day = Number(map.day);
    const hour = Number(map.hour);
    const minute = Number(map.minute);
    const second = Number(map.second);

    return new Date(year, month - 1, day, hour, minute, second);
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

        let body: { businessId?: string; business_id?: string } | null = null;
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
            .from("v2_activities")
            .select(`
                id,
                name,
                tenant_id,
                v2_tenants!inner (
                    owner_user_id
                )
            `)
            .eq("id", activityId)
            .single();

        if (activityError || !activity) {
            return json(404, { error: "business_not_found" });
        }

        const businessRow = activity as unknown as ActivityRow;

        if (businessRow.v2_tenants.owner_user_id !== authData.user.id) {
            return json(403, { error: "forbidden" });
        }

        const now = getNowInTimeZone("Europe/Rome");

        // 3) Resolve Active Layout Catalog
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
                layout:v2_schedule_layout(catalog_id)
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

        if (activityRulesRes.error) {
            return json(500, { error: "schedule_fetch_failed" });
        }

        const activityRows = (activityRulesRes.data ?? []) as RawLayoutRuleRow[];
        const groupIds = Array.from(
            new Set(
                ((groupMembersRes?.data ?? []) as RawActivityGroupMemberRow[]).map(
                    row => row.group_id
                )
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
                layout:v2_schedule_layout(catalog_id)
            `
                )
                .eq("rule_type", "layout")
                .eq("enabled", true)
                .eq("target_type", "activity_group")
                .in("target_id", groupIds)
                .order("priority", { ascending: true })
                .order("created_at", { ascending: true });

            if (!error) {
                activityGroupRows = (data ?? []) as RawLayoutRuleRow[];
            }
        }

        const sortedRules = [...activityRows, ...activityGroupRows].sort((a, b) => {
            if (a.priority !== b.priority) return a.priority - b.priority;
            return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        });

        const validRules = sortedRules.filter(row => isTimeRuleActiveNow(row, now));
        const selectedRule = validRules.find(
            row => (normalizeOne(row.layout)?.catalog_id ?? null) !== null
        );
        const layoutCatalogId = normalizeOne(selectedRule?.layout)?.catalog_id ?? null;

        if (!layoutCatalogId) {
            return json(404, { error: "no_active_collection" });
        }

        // 4) Load Catalog
        const { data: catalogData, error: catalogError } = await supabase
            .from("v2_catalogs")
            .select(
                `
            id,
            name,
            sections:v2_catalog_sections(
                id,
                label,
                order_index,
                items:v2_catalog_items(
                    id,
                    order_index,
                    visible,
                    product:v2_products(id, base_price, name)
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
        const [visibilityRulesRes] = await Promise.all([
            supabase
                .from("v2_schedules")
                .select("id, priority, created_at, time_mode, days_of_week, time_from, time_to")
                .eq("rule_type", "visibility")
                .eq("enabled", true)
                .eq("target_type", "activity")
                .eq("target_id", activityId)
                .order("priority", { ascending: true })
                .order("created_at", { ascending: true })
        ]);

        // Evaluate Visibility Winner
        const activeVisibilityGroupRows = await supabase
            .from("v2_schedules")
            .select("id, priority, created_at, time_mode, days_of_week, time_from, time_to")
            .eq("rule_type", "visibility")
            .eq("enabled", true)
            .eq("target_type", "activity_group")
            .in(
                "target_id",
                groupIds.length > 0 ? groupIds : ["00000000-0000-0000-0000-000000000000"]
            )
            .order("priority", { ascending: true })
            .order("created_at", { ascending: true });

        const visRows = [
            ...(visibilityRulesRes.data ?? []),
            ...(activeVisibilityGroupRows.data ?? [])
        ] as RawVisibilityRuleRow[];
        visRows.sort((a, b) => {
            if (a.priority !== b.priority) return a.priority - b.priority;
            return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        });
        const validVisRows = visRows.filter(row => isTimeRuleActiveNow(row, now));
        const activeVisibilityRuleScheduleId = validVisRows[0]?.id ?? null;

        if (activeVisibilityRuleScheduleId && productIds.length > 0) {
            const { data: visibilityOverrideData } = await supabase
                .from("v2_schedule_visibility_overrides")
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
                .from("v2_activity_product_overrides")
                .select("product_id, visible_override")
                .eq("activity_id", activityId)
                .in("product_id", visibleProductIds);

            for (const row of (overrideData ?? []) as OverrideRow[]) {
                overridesByProductId[row.product_id] = row;
            }
        }

        // Retrieve active price rule
        const [priceRulesRes] = await Promise.all([
            supabase
                .from("v2_schedules")
                .select("id, priority, created_at, time_mode, days_of_week, time_from, time_to")
                .eq("rule_type", "price")
                .eq("enabled", true)
                .eq("target_type", "activity")
                .eq("target_id", activityId)
                .order("priority", { ascending: true })
                .order("created_at", { ascending: true })
        ]);

        const activePriceGroupRows = await supabase
            .from("v2_schedules")
            .select("id, priority, created_at, time_mode, days_of_week, time_from, time_to")
            .eq("rule_type", "price")
            .eq("enabled", true)
            .eq("target_type", "activity_group")
            .in(
                "target_id",
                groupIds.length > 0 ? groupIds : ["00000000-0000-0000-0000-000000000000"]
            )
            .order("priority", { ascending: true })
            .order("created_at", { ascending: true });

        const priceRows = [
            ...(priceRulesRes.data ?? []),
            ...(activePriceGroupRows.data ?? [])
        ] as RawPriceRuleRow[];
        priceRows.sort((a, b) => {
            if (a.priority !== b.priority) return a.priority - b.priority;
            return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        });
        const validPriceRows = priceRows.filter(row => isTimeRuleActiveNow(row, now));
        const activePriceRuleScheduleId = validPriceRows[0]?.id ?? null;

        if (activePriceRuleScheduleId && visibleProductIds.length > 0) {
            const { data: priceOverrideData } = await supabase
                .from("v2_schedule_price_overrides")
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

        // Combine original rawCatalog sections labels & products info with the resolved visible catalog tree.
        const productInfoMap: Record<string, { name: string }> = {};
        if (rawCatalog.sections && Array.isArray(rawCatalog.sections)) {
            rawCatalog.sections.forEach(rawSec => {
                if (rawSec.items && Array.isArray(rawSec.items)) {
                    rawSec.items.forEach(rawIt => {
                        const rawPr = Array.isArray(rawIt.product)
                            ? rawIt.product[0]
                            : rawIt.product;
                        if (rawPr && rawPr.id && rawPr.name) {
                            productInfoMap[rawPr.id] = { name: rawPr.name };
                        }
                    });
                }
            });
        }

        const sections = finalPrimary.catalog.sections
            .map(section => {
                const rawSection = Array.isArray(rawCatalog.sections)
                    ? rawCatalog.sections.find(s => s.id === section.id)
                    : null;
                const label = rawSection?.label ?? "Sezione";

                const items = section.items
                    .map(item => {
                        const productName = item.product_id
                            ? (productInfoMap[item.product_id]?.name ?? "Sconosciuto")
                            : "Sconosciuto";
                        const visible =
                            overridesByProductId[item.product_id!]?.visible_override ??
                            item.effective_visible ??
                            item.visible;
                        if (!visible) return null;

                        return {
                            name: productName,
                            price: item.effective_price,
                            original_price: item.original_price
                        };
                    })
                    .filter(
                        (
                            i
                        ): i is {
                            name: string;
                            price: number | null;
                            original_price?: number | null;
                        } => i !== null
                    );

                return {
                    id: section.id,
                    label,
                    items
                };
            })
            .filter(s => s.items.length > 0);

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

        const TITLE_LINE = TITLE_SIZE * 1.4;
        const COLLECTION_LINE = COLLECTION_SIZE * 1.4;
        const SECTION_LINE = SECTION_SIZE * 1.4;
        const ITEM_LINE = ITEM_SIZE * 1.35;

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
                const priceText = item.price != null ? `€ ${item.price.toFixed(2)}` : "-";
                const oldPriceText =
                    item.original_price != null ? `€ ${item.original_price.toFixed(2)}` : null;

                // Layout price text to find width
                let totalPriceWidth = fontRegular.widthOfTextAtSize(priceText, ITEM_SIZE);
                let oldPriceWidth = 0;
                if (oldPriceText) {
                    oldPriceWidth = fontStrike.widthOfTextAtSize(oldPriceText, ITEM_SIZE - 2);
                    totalPriceWidth += oldPriceWidth + 5; // adding small gap
                }

                const priceX = PAGE_WIDTH - MARGIN_X - totalPriceWidth;
                const maxNameWidth = priceX - MARGIN_X - 10;

                const lines = wrapText(item.name, maxNameWidth, fontRegular, ITEM_SIZE);

                for (let i = 0; i < lines.length; i++) {
                    ensureSpace(ITEM_LINE);
                    page.drawText(lines[i], {
                        x: MARGIN_X,
                        y,
                        size: ITEM_SIZE,
                        font: fontRegular,
                        color: rgb(0, 0, 0)
                    });

                    // Draw price only on the first line
                    if (i === 0) {
                        let currentPriceX = priceX;
                        if (oldPriceText) {
                            // Draw strikethrough original price
                            page.drawText(oldPriceText, {
                                x: currentPriceX,
                                y: y + 1, // small baseline shift
                                size: ITEM_SIZE - 2,
                                font: fontStrike,
                                color: rgb(0.5, 0.5, 0.5)
                            });
                            // draw strikethrough line
                            const textHeight = (ITEM_SIZE - 2) * 0.4;
                            page.drawLine({
                                start: { x: currentPriceX - 1, y: y + 1 + textHeight },
                                end: {
                                    x: currentPriceX + oldPriceWidth + 1,
                                    y: y + 1 + textHeight
                                },
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
                    }

                    y -= ITEM_LINE;
                }
            }

            // Extra spacing between sections
            y -= 6;
        }

        const pdfBytes = await pdfDoc.save();

        const safeName = businessRow.name.replace(/[^a-zA-Z0-9-_]+/g, "_");
        const filename = safeName ? `menu-${safeName}.pdf` : "menu.pdf";

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
