// @ts-nocheck
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1?target=deno";

type ScheduleSlot = "primary" | "overlay";

type BusinessScheduleRow = {
    id: string;
    business_id: string;
    collection_id: string;
    slot: ScheduleSlot;
    days_of_week: number[];
    start_time: string; // HH:MM:SS
    end_time: string; // HH:MM:SS
    is_active: boolean;
    created_at: string;
};

type BusinessRow = {
    id: string;
    name: string;
    user_id: string;
};

type CollectionRow = {
    id: string;
    name: string;
};

type CollectionSectionRow = {
    id: string;
    label: string;
    order_index: number;
};

type ItemRow = {
    id: string;
    name: string;
    base_price: number | null;
};

type CollectionItemRow = {
    id: string;
    section_id: string;
    order_index: number;
    visible: boolean | null;
    item: ItemRow | ItemRow[] | null;
};

type BusinessItemOverrideRow = {
    item_id: string;
    price_override: number | null;
    visible_override: boolean | null;
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

function toMinutes(hhmm: string) {
    const [h, m] = hhmm.slice(0, 5).split(":").map(Number);
    return h * 60 + m;
}

function prevDay(d: number) {
    return (d + 6) % 7;
}

function isScheduleActive(schedule: BusinessScheduleRow, now: Date) {
    if (!schedule.is_active) return false;

    const day = now.getDay(); // 0..6
    const time = toMinutes(now.toTimeString().slice(0, 5));

    const start = toMinutes(schedule.start_time);
    const end = toMinutes(schedule.end_time);

    // all-day
    if (start === end) {
        return schedule.days_of_week.includes(day);
    }

    // normal same-day interval
    if (start < end) {
        if (!schedule.days_of_week.includes(day)) return false;
        return start <= time && time < end;
    }

    // overnight (spans midnight)
    const isStartDayActive = schedule.days_of_week.includes(day) && time >= start;
    const isNextDayActive = schedule.days_of_week.includes(prevDay(day)) && time < end;

    return isStartDayActive || isNextDayActive;
}

function pickWinner(schedules: BusinessScheduleRow[]): BusinessScheduleRow | null {
    if (schedules.length === 0) return null;
    if (schedules.length === 1) return schedules[0];

    return schedules.slice().sort((a, b) => {
        // 1) latest start_time
        if (a.start_time !== b.start_time) {
            return a.start_time > b.start_time ? -1 : 1;
        }
        // 2) most recent
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    })[0];
}

function pickFallbackPrimary(
    schedules: BusinessScheduleRow[],
    now: Date
): BusinessScheduleRow | null {
    const day = now.getDay();
    const time = toMinutes(now.toTimeString().slice(0, 5));

    const primary = schedules.filter(s => s.is_active && s.slot === "primary");
    if (primary.length === 0) return null;

    const affectsDay = (s: BusinessScheduleRow, d: number) => {
        const start = toMinutes(s.start_time);
        const end = toMinutes(s.end_time);

        if (start === end) return s.days_of_week.includes(d);
        if (start < end) return s.days_of_week.includes(d);

        return s.days_of_week.includes(d) || s.days_of_week.includes(prevDay(d));
    };

    const todayCandidates = primary.filter(s => affectsDay(s, day));

    // 1) prefer "just ended" today
    const pastEndedToday = todayCandidates.filter(s => {
        const start = toMinutes(s.start_time);
        const end = toMinutes(s.end_time);

        if (start === end) return false; // all-day
        if (start < end) return end <= time;
        return false;
    });

    if (pastEndedToday.length > 0) {
        return pastEndedToday.slice().sort((a, b) => {
            const aEnd = toMinutes(a.end_time);
            const bEnd = toMinutes(b.end_time);

            if (aEnd !== bEnd) return bEnd - aEnd;
            return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        })[0];
    }

    // 2) next starting today
    const nextStartingToday = todayCandidates
        .filter(s => {
            const start = toMinutes(s.start_time);
            const end = toMinutes(s.end_time);

            if (start === end) return false;
            if (start < end) return start >= time;
            return start >= time;
        })
        .sort((a, b) => toMinutes(a.start_time) - toMinutes(b.start_time));

    if (nextStartingToday.length > 0) return nextStartingToday[0];

    // 3) next available in week
    const ranked = primary
        .map(s => {
            const start = toMinutes(s.start_time);
            const days = s.days_of_week;

            let bestDeltaDays = 7;
            for (let delta = 0; delta < 7; delta++) {
                const d = (day + delta) % 7;
                const ok =
                    days.includes(d) ||
                    (toMinutes(s.start_time) > toMinutes(s.end_time) && days.includes(prevDay(d)));

                if (ok) {
                    bestDeltaDays = delta;
                    break;
                }
            }

            return { s, bestDeltaDays, start };
        })
        .sort((a, b) => {
            if (a.bestDeltaDays !== b.bestDeltaDays) return a.bestDeltaDays - b.bestDeltaDays;
            return a.start - b.start;
        });

    return ranked[0]?.s ?? null;
}

function resolveActivePrimaryCollectionId(
    schedules: BusinessScheduleRow[],
    now: Date = new Date()
): string | null {
    if (!schedules.length) return null;

    // 1) active now
    const activeNow = schedules.filter(s => isScheduleActive(s, now));
    const activePrimary = pickWinner(activeNow.filter(s => s.slot === "primary"));

    // 2) fallback primary if none active
    const fallbackPrimary = activePrimary ? null : pickFallbackPrimary(schedules, now);
    const finalPrimary = activePrimary ?? fallbackPrimary;

    return finalPrimary?.collection_id ?? null;
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

        // break very long word
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

serve(async req => {
    // CORS preflight
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    if (req.method !== "POST") {
        return json(405, { error: "method_not_allowed" });
    }

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

    const businessId = body?.businessId ?? body?.business_id;
    if (!businessId) {
        return json(400, { error: "missing_business_id" });
    }

    // 1) Create Supabase client using user JWT (no service role)
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: authHeader } }
    });

    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData?.user?.id) {
        return json(401, { error: "unauthorized" });
    }

    // 2) Fetch business and verify ownership
    const { data: business, error: businessError } = await supabase
        .from("businesses")
        .select("id, name, user_id")
        .eq("id", businessId)
        .single();

    if (businessError || !business) {
        return json(404, { error: "business_not_found" });
    }

    const businessRow = business as BusinessRow;

    if (businessRow.user_id !== authData.user.id) {
        return json(403, { error: "forbidden" });
    }

    // 3) Resolve active collection via scheduling rules
    const { data: schedulesData, error: schedulesError } = await supabase
        .from("business_collection_schedules")
        .select(
            "id, business_id, collection_id, slot, days_of_week, start_time, end_time, is_active, created_at"
        )
        .eq("business_id", businessId)
        .eq("is_active", true);

    if (schedulesError) {
        return json(500, { error: "schedule_fetch_failed" });
    }

    const schedules = (schedulesData ?? []) as BusinessScheduleRow[];
    const nowRome = getNowInTimeZone("Europe/Rome");
    const activeCollectionId = resolveActivePrimaryCollectionId(schedules, nowRome);

    if (!activeCollectionId) {
        return json(404, { error: "no_active_collection" });
    }

    // 4) Fetch collection, sections, items, and overrides
    const { data: collection, error: collectionError } = await supabase
        .from("collections")
        .select("id, name")
        .eq("id", activeCollectionId)
        .single();

    if (collectionError || !collection) {
        return json(404, { error: "collection_not_found" });
    }

    const collectionRow = collection as CollectionRow;

    const [{ data: sectionsData, error: sectionsError }, { data: itemsData, error: itemsError }] =
        await Promise.all([
            supabase
                .from("collection_sections")
                .select("id, label, order_index")
                .eq("collection_id", activeCollectionId)
                .order("order_index", { ascending: true }),
            supabase
                .from("collection_items")
                .select("id, section_id, order_index, visible, item:items ( id, name, base_price )")
                .eq("collection_id", activeCollectionId)
                .order("order_index", { ascending: true })
        ]);

    if (sectionsError || itemsError) {
        return json(500, { error: "collection_data_fetch_failed" });
    }

    const sectionsRows = (sectionsData ?? []) as CollectionSectionRow[];
    const itemsRows = (itemsData ?? []) as CollectionItemRow[];

    const normalizedItems = itemsRows
        .map(row => {
            const rawItem = Array.isArray(row.item) ? row.item[0] ?? null : row.item;
            if (!rawItem) return null;

            return {
                id: row.id,
                section_id: row.section_id,
                order_index: row.order_index,
                visible: (row.visible ?? true) as boolean,
                item: {
                    id: rawItem.id,
                    name: rawItem.name,
                    base_price: rawItem.base_price
                }
            };
        })
        .filter(
            (
                row
            ): row is {
                id: string;
                section_id: string;
                order_index: number;
                visible: boolean;
                item: { id: string; name: string; base_price: number | null };
            } => row !== null
        );

    const itemIds = normalizedItems.map(it => it.item.id);

    const overrides: Record<
        string,
        { item_id: string; price_override: number | null; visible_override: boolean | null }
    > = {};

    if (itemIds.length > 0) {
        const { data: overrideData, error: overrideError } = await supabase
            .from("business_item_overrides")
            .select("item_id, price_override, visible_override")
            .eq("business_id", businessId)
            .in("item_id", itemIds);

        if (overrideError) {
            return json(500, { error: "overrides_fetch_failed" });
        }

        const overrideRows = (overrideData ?? []) as BusinessItemOverrideRow[];
        for (const row of overrideRows) {
            overrides[row.item_id] = {
                item_id: row.item_id,
                price_override: row.price_override ?? null,
                visible_override: row.visible_override ?? null
            };
        }
    }

    const itemsBySection = new Map<string, { name: string; price: number | null }[]>();

    for (const it of normalizedItems) {
        const override = overrides[it.item.id];
        const visible = override?.visible_override ?? it.visible ?? true;

        if (!visible) continue;

        const price = override?.price_override ?? it.item.base_price ?? null;
        const arr = itemsBySection.get(it.section_id) ?? [];
        arr.push({ name: it.item.name, price });
        itemsBySection.set(it.section_id, arr);
    }

    const sections = sectionsRows
        .map(section => {
            const sectionItems = itemsBySection.get(section.id) ?? [];
            return {
                id: section.id,
                label: section.label,
                items: sectionItems
            };
        })
        .filter(s => s.items.length > 0);

    if (sections.length === 0) {
        return json(404, { error: "no_visible_items" });
    }

    // 5) Generate a clean A4 portrait PDF
    const pdfDoc = await PDFDocument.create();
    const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

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
    page.drawText(collectionRow.name, {
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
            const priceWidth = fontRegular.widthOfTextAtSize(priceText, ITEM_SIZE);
            const priceX = PAGE_WIDTH - MARGIN_X - priceWidth;
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
                    page.drawText(priceText, {
                        x: priceX,
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
});
