import { supabase } from "@/services/supabase/client";
import {
    resolveActivityCatalogs,
    findLayoutCatalogId,
    loadCatalogById
} from "./resolveActivityCatalogs";

// ==========================================
// TYPES
// ==========================================

export type ActiveCatalogMeta = {
    activityId: string;
    catalogId: string | null;
    catalogName: string | null;
    hasActiveCatalog: boolean;
};

export type RenderableProduct = {
    product_id: string;
    name: string;
    category_name?: string | null;
    /** Resolved single price. Null when the product uses format pricing. */
    final_price: number | null;
    /** Minimum format price. Set when the product has PRIMARY_PRICE option groups. */
    from_price: number | null;
    is_visible: boolean; // post-scheduling + post-activity-override
};

export type RenderableCatalog = {
    catalogId: string | null;
    catalogName: string | null;
    products: RenderableProduct[];
};

// ==========================================
// SERVICE
// ==========================================

/**
 * Batch fetch of active catalog metadata for multiple activities.
 *
 * Uses Promise.all to resolve all activities in parallel, then
 * fetches catalog names in a single query. Returns only metadata
 * (catalogId, catalogName, hasActiveCatalog) — never the full catalog.
 */
export async function getActiveCatalogForActivities(
    activityIds: string[]
): Promise<Record<string, ActiveCatalogMeta>> {
    if (activityIds.length === 0) return {};

    const now = new Date();

    // ── Step 1: Resolve all activities in parallel ─────────────────────────
    const resolvedList = await Promise.all(
        activityIds.map(async activityId => {
            try {
                const resolved = await resolveActivityCatalogs(activityId, now);
                // The resolver returns the catalog data if there is an active catalog.
                // We only need the catalogId — extract it from the returned structure.
                const catalogId = (resolved as { catalog?: { id?: string } }).catalog?.id ?? null;
                return { activityId, catalogId };
            } catch {
                return { activityId, catalogId: null };
            }
        })
    );

    // ── Step 2: Collect distinct non-null catalogIds ───────────────────────
    const catalogIds = Array.from(
        new Set(resolvedList.map(r => r.catalogId).filter((id): id is string => id !== null))
    );

    // ── Step 3: Fetch catalog names in a single query ──────────────────────
    const catalogNameById: Record<string, string> = {};

    if (catalogIds.length > 0) {
        const { data, error } = await supabase
            .from("catalogs")
            .select("id, name")
            .in("id", catalogIds);

        if (!error && data) {
            for (const row of data as Array<{ id: string; name: string }>) {
                catalogNameById[row.id] = row.name;
            }
        }
    }

    // ── Step 4: Build result map ────────────────────────────────────────────
    const result: Record<string, ActiveCatalogMeta> = {};

    for (const { activityId, catalogId } of resolvedList) {
        result[activityId] = {
            activityId,
            catalogId,
            catalogName: catalogId ? (catalogNameById[catalogId] ?? null) : null,
            hasActiveCatalog: catalogId !== null
        };
    }

    return result;
}

/**
 * Returns a simplified, flattened list of products as rendered by the V2 resolver.
 * This reflects the final deterministic state (Schedule + Activity Overrides).
 */
export async function getRenderableCatalogForActivity(
    activityId: string
): Promise<RenderableCatalog> {
    const now = new Date();
    const { catalogId } = await findLayoutCatalogId(activityId, now);

    if (!catalogId) {
        return { catalogId: null, catalogName: null, products: [] };
    }

    const [catalog, overrides] = await Promise.all([
        loadCatalogById(catalogId),
        getActivityProductOverrides(activityId)
    ]);

    if (!catalog) {
        return { catalogId: null, catalogName: null, products: [] };
    }

    const products: RenderableProduct[] = [];
    for (const category of catalog.categories || []) {
        for (const p of category.products || []) {
            const override = overrides[p.id];
            products.push({
                product_id: p.id,
                name: p.name,
                category_name: category.name,
                final_price: p.price ?? null,
                from_price: p.from_price ?? null,
                is_visible: override?.visible_override ?? true
            });
        }
    }

    return {
        catalogId: catalog.id,
        catalogName: catalog.name ?? "Catalogo senza nome",
        products
    };
}

/**
 * Updates or deletes a visibility override for a specific product in an activity.
 *
 * Implements "Smart Toggle" (Step 3 - Case 3):
 * If the user toggles a state that effectively returns to the default schedule state,
 * the override is removed (DELETE). Otherwise, it's UPSERTed.
 */
export async function updateActivityProductVisibility(
    activityId: string,
    productId: string,
    targetVisible: boolean
): Promise<void> {
    // 1. Get existing record to check current state
    const { data: existing } = await supabase
        .from("activity_product_overrides")
        .select("id, visible_override, price_override")
        .eq("activity_id", activityId)
        .eq("product_id", productId)
        .maybeSingle();

    const currentOverride = existing?.visible_override;

    let nextVisibleOverride: boolean | null = targetVisible;

    // Case 3 logic: if we are toggling AWAY from an explicit override,
    // we return to null (schedule default).
    if (currentOverride !== null && currentOverride !== undefined) {
        // We are currently forced. Toggling means we want the "other" state.
        // If the other state is the one we would have without this override,
        // we just delete the override.
        nextVisibleOverride = null;
    }

    if (nextVisibleOverride === null && (!existing || existing.price_override === null)) {
        if (existing) {
            await supabase.from("activity_product_overrides").delete().eq("id", existing.id);
        }
        return;
    }

    const upsertData: any = {
        activity_id: activityId,
        product_id: productId,
        visible_override: nextVisibleOverride,
        updated_at: new Date().toISOString()
    };

    if (existing) {
        const { error } = await supabase
            .from("activity_product_overrides")
            .update(upsertData)
            .eq("id", existing.id);
        if (error) throw error;
    } else {
        const { error } = await supabase
            .from("activity_product_overrides")
            .insert([{ ...upsertData, id: crypto.randomUUID() }]);
        if (error) throw error;
    }
}

/**
 * Fetches all product overrides for a specific activity.
 */
export async function getActivityProductOverrides(
    activityId: string
): Promise<Record<string, { visible_override: boolean | null; price_override: number | null }>> {
    const { data, error } = await supabase
        .from("activity_product_overrides")
        .select("product_id, visible_override, price_override")
        .eq("activity_id", activityId);

    if (error) throw error;

    const map: Record<string, { visible_override: boolean | null; price_override: number | null }> =
        {};
    for (const row of data || []) {
        map[row.product_id] = {
            visible_override: row.visible_override,
            price_override: row.price_override
        };
    }
    return map;
}
