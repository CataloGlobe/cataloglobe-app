#!/usr/bin/env node

import { isDeepStrictEqual } from "node:util";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

type ResolvedCollections = {
    primary: string | null;
    overlay: string | null;
};

type EffectiveItem = {
    id: string;
    effective_price: number | null;
    effective_visible: boolean;
};

type CatalogSnapshot = {
    catalogId: string | null;
    sectionsCount: number;
    itemsCount: number;
    items: EffectiveItem[];
};

type ComparableOutput = {
    primary: CatalogSnapshot;
    overlay: CatalogSnapshot;
};

type LegacyCatalogItem = {
    id: string;
    order_index: number | null;
    visible: boolean | null;
    item:
        | { id: string; base_price: number | null }
        | { id: string; base_price: number | null }[]
        | null;
};

type LegacySection = {
    id: string;
    order_index: number | null;
    items: LegacyCatalogItem[] | LegacyCatalogItem | null;
};

type V2CatalogItem = {
    id: string;
    order_index: number | null;
    visible: boolean | null;
    product:
        | { id: string; base_price: number | null }
        | { id: string; base_price: number | null }[]
        | null;
};

type V2Section = {
    id: string;
    order_index: number | null;
    items: V2CatalogItem[] | V2CatalogItem | null;
};

function normalizeOne<T>(value: T | T[] | null | undefined): T | null {
    if (!value) return null;
    return Array.isArray(value) ? (value[0] ?? null) : value;
}

function normalizeMany<T>(value: T[] | T | null | undefined): T[] {
    if (!value) return [];
    return Array.isArray(value) ? value : [value];
}

function parseEnvFile(filePath: string) {
    const content = readFileSync(filePath, "utf8");
    for (const rawLine of content.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith("#")) continue;

        const eqIndex = line.indexOf("=");
        if (eqIndex <= 0) continue;

        const key = line.slice(0, eqIndex).trim();
        let value = line.slice(eqIndex + 1).trim();

        if (
            (value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))
        ) {
            value = value.slice(1, -1);
        }

        if (process.env[key] == null) {
            process.env[key] = value;
        }
    }
}

function loadProjectEnv() {
    const envLocalPath = resolve(process.cwd(), ".env.local");
    const envPath = resolve(process.cwd(), ".env");

    if (existsSync(envPath)) parseEnvFile(envPath);
    if (existsSync(envLocalPath)) parseEnvFile(envLocalPath);
}

function ensureSupabaseEnv() {
    if (!process.env.VITE_SUPABASE_URL || !process.env.VITE_SUPABASE_ANON_KEY) {
        throw new Error(
            "Missing Supabase env vars. Expected VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in env/.env.local"
        );
    }
}

async function fetchLegacyCatalogSnapshot(
    supabase: {
        from: (table: string) => {
            select: (columns: string) => {
                eq: (column: string, value: string) => Promise<{ data: unknown; error: Error | null }>;
            };
        };
    },
    businessId: string,
    catalogId: string | null
): Promise<CatalogSnapshot> {
    if (!catalogId) {
        return {
            catalogId: null,
            sectionsCount: 0,
            itemsCount: 0,
            items: []
        };
    }

    const { data: sectionsData, error: sectionsError } = await supabase
        .from("collection_sections")
        .select(
            `
            id,
            order_index,
            items:collection_items(
                id,
                order_index,
                visible,
                item:items(
                    id,
                    base_price
                )
            )
            `
        )
        .eq("collection_id", catalogId);

    if (sectionsError) throw sectionsError;

    const sections = normalizeMany(sectionsData as LegacySection[] | LegacySection | null).sort((a, b) => {
        const orderDelta = (a.order_index ?? 0) - (b.order_index ?? 0);
        if (orderDelta !== 0) return orderDelta;
        return a.id.localeCompare(b.id);
    });

    const itemRows = sections.flatMap(section =>
        normalizeMany(section.items)
            .slice()
            .sort((a, b) => {
                const orderDelta = (a.order_index ?? 0) - (b.order_index ?? 0);
                if (orderDelta !== 0) return orderDelta;
                return a.id.localeCompare(b.id);
            })
    );

    const itemIds = Array.from(
        new Set(
            itemRows
                .map(row => normalizeOne(row.item)?.id ?? null)
                .filter((id): id is string => Boolean(id))
        )
    );

    const overridesByItemId: Record<string, { price_override: number | null; visible_override: boolean | null }> =
        {};

    if (itemIds.length > 0) {
        const { data: overrideData, error: overrideError } = await supabase
            .from("business_item_overrides")
            .select("item_id, price_override, visible_override")
            .eq("business_id", businessId)
            .in("item_id", itemIds);

        if (overrideError) throw overrideError;

        for (const row of
            (overrideData as Array<{
                item_id: string;
                price_override: number | null;
                visible_override: boolean | null;
            }>) ?? []) {
            overridesByItemId[row.item_id] = {
                price_override: row.price_override ?? null,
                visible_override: row.visible_override ?? null
            };
        }
    }

    const normalizedItems: EffectiveItem[] = itemRows.map(row => {
        const item = normalizeOne(row.item);
        const basePrice = item?.base_price ?? null;
        const itemId = item?.id;
        const override = itemId ? overridesByItemId[itemId] : undefined;

        return {
            id: row.id,
            effective_price: override?.price_override ?? basePrice,
            effective_visible: override?.visible_override ?? row.visible ?? true
        };
    });

    return {
        catalogId,
        sectionsCount: sections.length,
        itemsCount: normalizedItems.length,
        items: normalizedItems
    };
}

async function fetchV2CatalogSnapshot(
    supabase: {
        from: (table: string) => {
            select: (columns: string) => {
                eq: (column: string, value: string) => Promise<{ data: unknown; error: Error | null }>;
            };
        };
    },
    activityId: string,
    catalogId: string | null
): Promise<CatalogSnapshot> {
    if (!catalogId) {
        return {
            catalogId: null,
            sectionsCount: 0,
            itemsCount: 0,
            items: []
        };
    }

    const { data: sectionsData, error: sectionsError } = await supabase
        .from("v2_catalog_sections")
        .select(
            `
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
            `
        )
        .eq("catalog_id", catalogId);

    if (sectionsError) throw sectionsError;

    const sections = normalizeMany(sectionsData as V2Section[] | V2Section | null).sort((a, b) => {
        const orderDelta = (a.order_index ?? 0) - (b.order_index ?? 0);
        if (orderDelta !== 0) return orderDelta;
        return a.id.localeCompare(b.id);
    });

    const itemRows = sections.flatMap(section =>
        normalizeMany(section.items)
            .slice()
            .sort((a, b) => {
                const orderDelta = (a.order_index ?? 0) - (b.order_index ?? 0);
                if (orderDelta !== 0) return orderDelta;
                return a.id.localeCompare(b.id);
            })
    );

    const productIds = Array.from(
        new Set(
            itemRows
                .map(row => normalizeOne(row.product)?.id ?? null)
                .filter((id): id is string => Boolean(id))
        )
    );

    const overridesByProductId: Record<
        string,
        { price_override: number | null; visible_override: boolean | null }
    > = {};

    if (productIds.length > 0) {
        const { data: overrideData, error: overrideError } = await supabase
            .from("v2_activity_product_overrides")
            .select("product_id, price_override, visible_override")
            .eq("activity_id", activityId)
            .in("product_id", productIds);

        if (overrideError) throw overrideError;

        for (const row of
            (overrideData as Array<{
                product_id: string;
                price_override: number | null;
                visible_override: boolean | null;
            }>) ?? []) {
            overridesByProductId[row.product_id] = {
                price_override: row.price_override ?? null,
                visible_override: row.visible_override ?? null
            };
        }
    }

    const normalizedItems: EffectiveItem[] = itemRows.map(row => {
        const product = normalizeOne(row.product);
        const basePrice = product?.base_price ?? null;
        const productId = product?.id;
        const override = productId ? overridesByProductId[productId] : undefined;

        return {
            id: row.id,
            effective_price: override?.price_override ?? basePrice,
            effective_visible: override?.visible_override ?? row.visible ?? true
        };
    });

    return {
        catalogId,
        sectionsCount: sections.length,
        itemsCount: normalizedItems.length,
        items: normalizedItems
    };
}

function printSlotDiff(slot: "primary" | "overlay", legacy: CatalogSnapshot, v2: CatalogSnapshot) {
    const legacyPreview = legacy.items.slice(0, 5);
    const v2Preview = v2.items.slice(0, 5);

    console.log(`\\n[${slot}]`);
    console.log(
        `legacy catalogId=${legacy.catalogId} sections=${legacy.sectionsCount} items=${legacy.itemsCount}`
    );
    console.log(`v2     catalogId=${v2.catalogId} sections=${v2.sectionsCount} items=${v2.itemsCount}`);
    console.log(`legacy first5: ${JSON.stringify(legacyPreview)}`);
    console.log(`v2     first5: ${JSON.stringify(v2Preview)}`);
}

async function run() {
    const activityId = process.argv[2];
    if (!activityId) {
        console.error("Usage: npm run parity:check -- <activityId>");
        process.exit(2);
    }

    loadProjectEnv();
    ensureSupabaseEnv();

    const [{ resolveBusinessCollectionsLegacy }, { resolveActivityCatalogsV2 }, { supabase }] =
        await Promise.all([
            import("../src/services/supabase/resolveBusinessCollections.ts"),
            import("../src/services/supabase/v2/resolveActivityCatalogsV2.ts"),
            import("../src/services/supabase/client.ts")
        ]);

    const now = new Date();

    const [legacyResolved, v2Resolved] = await Promise.all([
        resolveBusinessCollectionsLegacy(activityId, now),
        resolveActivityCatalogsV2(activityId, now)
    ]);

    const [legacyPrimary, legacyOverlay, v2Primary, v2Overlay] = await Promise.all([
        fetchLegacyCatalogSnapshot(supabase, activityId, legacyResolved.primary),
        fetchLegacyCatalogSnapshot(supabase, activityId, legacyResolved.overlay),
        fetchV2CatalogSnapshot(supabase, activityId, v2Resolved.primary),
        fetchV2CatalogSnapshot(supabase, activityId, v2Resolved.overlay)
    ]);

    const normalizedLegacy: ComparableOutput = {
        primary: legacyPrimary,
        overlay: legacyOverlay
    };

    const normalizedV2: ComparableOutput = {
        primary: v2Primary,
        overlay: v2Overlay
    };

    const deepEqual = isDeepStrictEqual(normalizedLegacy, normalizedV2);

    console.log(`activityId=${activityId}`);
    console.log(`deepEqual=${deepEqual}`);

    if (!deepEqual) {
        printSlotDiff("primary", normalizedLegacy.primary, normalizedV2.primary);
        printSlotDiff("overlay", normalizedLegacy.overlay, normalizedV2.overlay);
        process.exit(1);
    }

    process.exit(0);
}

run().catch(error => {
    console.error("parity-check failed");
    console.error(error);
    process.exit(1);
});
