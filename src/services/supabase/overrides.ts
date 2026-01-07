import { supabase } from "./client";
import type { OverrideRowForUI } from "@/types/database";

/**
 * Legge tutti gli override di un business per una lista di item.
 * (Usato per compilare la modale in modo veloce)
 */
export async function getBusinessOverridesForItems(
    businessId: string,
    itemIds: string[]
): Promise<Record<string, OverrideRowForUI>> {
    if (!itemIds.length) return {};

    const { data, error } = await supabase
        .from("business_item_overrides")
        .select("item_id, price_override, visible_override")
        .eq("business_id", businessId)
        .in("item_id", itemIds);

    if (error) throw error;

    const map: Record<string, OverrideRowForUI> = {};
    for (const row of data ?? []) {
        map[row.item_id] = {
            item_id: row.item_id,
            price_override: row.price_override ?? null,
            visible_override: row.visible_override ?? null
        };
    }
    return map;
}

/**
 * Upsert singolo override (per item).
 * Se price_override o visible_override sono null -> fallback al base.
 */
export async function upsertBusinessItemOverride(params: {
    businessId: string;
    itemId: string;
    priceOverride: number | null;
    visibleOverride: boolean | null;
}): Promise<void> {
    const { businessId, itemId, priceOverride, visibleOverride } = params;

    const { error } = await supabase.from("business_item_overrides").upsert(
        {
            business_id: businessId,
            item_id: itemId,
            price_override: priceOverride,
            visible_override: visibleOverride,
            updated_at: new Date().toISOString()
        },
        {
            onConflict: "business_id,item_id"
        }
    );

    if (error) throw error;
}
