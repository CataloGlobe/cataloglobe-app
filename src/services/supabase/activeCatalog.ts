import { supabase } from "@/services/supabase/client";
import {
    resolveActivityCatalogs,
    findLayoutCatalogId,
    normalizeCatalog,
    type RawCatalogRow
} from "./resolveActivityCatalogs";
import { getNowInRome } from "@/services/supabase/schedulingNow";
import type { VisibilityMode } from "@/services/supabase/scheduleResolver";

// ==========================================
// TYPES
// ==========================================

export type ActiveCatalogMeta = {
    activityId: string;
    catalogId: string | null;
    catalogName: string | null;
    hasActiveCatalog: boolean;
};

/**
 * Tri-state visibility for the realtime "Gestisci disponibilità" control.
 * - `visible`     → nessun override (segue la programmazione)
 * - `hidden`      → rimosso dalla pagina pubblica (visible_override=false, mode='hide')
 * - `unavailable` → mostrato come "Non disponibile" (visible_override=false, mode='disable')
 */
export type ProductVisibilityState = "visible" | "hidden" | "unavailable";

export type RenderableProduct = {
    product_id: string;
    name: string;
    category_name?: string | null;
    /** Resolved single price. Null when the product uses format pricing. */
    final_price: number | null;
    /** Minimum format price. Set when the product has PRIMARY_PRICE option groups. */
    from_price: number | null;
    /** Tri-state realtime override. `hidden` = rimosso; `unavailable` = mostrato disabilitato. */
    visibility_state: ProductVisibilityState;
    /** true quando lo stato non è `hidden` (retrocompat filtro/count). */
    is_visible: boolean; // post-scheduling + post-activity-override
};

export type RenderableCatalog = {
    catalogId: string | null;
    catalogName: string | null;
    activeSchedule: { id: string; name: string } | null;
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

    const now = getNowInRome();

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
 * Variante "leggera" di `loadCatalogById` per il drawer/tab Gestisci disponibilità:
 * stessa struttura (categorie → prodotti → varianti → option_groups), ma SENZA
 * attributes/allergens/characteristics/ingredients/notes/image_url/assignment —
 * campi non renderizzati dalla tabella di visibilità. Riusa `normalizeCatalog`
 * (stessa logica di calcolo prezzo/from_price di `loadCatalogById`, nessuna
 * duplicazione) per evitare divergenze tra le due query.
 */
async function loadCatalogForVisibilityDrawer(
    catalogId: string,
    tenantId: string
) {
    const { data, error } = await supabase
        .from("catalogs")
        .select(
            `
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
                  base_price,
                  parent_product_id,
                  product_type,
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
                    base_price,
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
                    )
                  )
                )
              )
            )
        `
        )
        .eq("tenant_id", tenantId)
        .eq("id", catalogId)
        .maybeSingle();

    if (error) throw error;

    return normalizeCatalog((data as unknown as RawCatalogRow | null) ?? null);
}

/**
 * Returns a simplified, flattened list of products as rendered by the V2 resolver.
 * This reflects the final deterministic state (Schedule + Activity Overrides).
 */
export async function getRenderableCatalogForActivity(
    activityId: string,
    tenantId: string
): Promise<RenderableCatalog> {
    const now = getNowInRome();
    const { catalogId, scheduleId } = await findLayoutCatalogId(activityId, now, tenantId);

    if (!catalogId) {
        return { catalogId: null, catalogName: null, activeSchedule: null, products: [] };
    }

    const [catalog, overrides] = await Promise.all([
        loadCatalogForVisibilityDrawer(catalogId, tenantId),
        getActivityProductOverrides(activityId)
    ]);

    if (!catalog) {
        return { catalogId: null, catalogName: null, activeSchedule: null, products: [] };
    }

    let activeSchedule: { id: string; name: string } | null = null;
    if (scheduleId) {
        const { data: scheduleRow } = await supabase
            .from("schedules")
            .select("id, name")
            .eq("id", scheduleId)
            .maybeSingle();
        if (scheduleRow) {
            const row = scheduleRow as { id: string; name: string };
            activeSchedule = { id: row.id, name: row.name };
        }
    }

    const products: RenderableProduct[] = [];
    for (const category of catalog.categories || []) {
        for (const p of category.products || []) {
            const override = overrides[p.id];
            const state = deriveVisibilityState(override?.visible_override, override?.mode);
            products.push({
                product_id: p.id,
                name: p.name,
                category_name: category.name,
                final_price: p.price ?? null,
                from_price: p.from_price ?? null,
                visibility_state: state,
                is_visible: state !== "hidden"
            });
        }
    }

    return {
        catalogId: catalog.id,
        catalogName: catalog.name ?? "Catalogo senza nome",
        activeSchedule,
        products
    };
}

/**
 * Sets the realtime visibility override for a product in an activity (tri-state).
 *
 * - `"visible"`     → rimuove l'override di visibilità (torna alla programmazione).
 *                     La riga viene cancellata solo se non esiste un price_override,
 *                     altrimenti si azzerano visible_override + mode preservando il prezzo.
 * - `"hidden"`      → visible_override=false, mode='hide' (rimosso dalla pagina pubblica).
 * - `"unavailable"` → visible_override=false, mode='disable' (mostrato come "Non disponibile").
 *
 * NB: il realtime (Modello A) vince sempre sulla programmazione (Modello B) — invariato.
 */
export async function updateActivityProductVisibility(
    activityId: string,
    productId: string,
    state: ProductVisibilityState
): Promise<void> {
    const { data: existing } = await supabase
        .from("activity_product_overrides")
        .select("id, visible_override, price_override, mode")
        .eq("activity_id", activityId)
        .eq("product_id", productId)
        .maybeSingle();

    // "visible" = nessun override di visibilità.
    if (state === "visible") {
        if (!existing) return;
        if (existing.price_override === null) {
            // Nessun altro override da preservare → elimina la riga.
            await supabase.from("activity_product_overrides").delete().eq("id", existing.id);
            return;
        }
        // Preserva price_override, azzera solo la visibilità.
        const { error } = await supabase
            .from("activity_product_overrides")
            .update({
                visible_override: null,
                mode: null,
                updated_at: new Date().toISOString()
            })
            .eq("id", existing.id);
        if (error) throw error;
        return;
    }

    // "hidden" | "unavailable" → visible_override=false + mode dedicato.
    const mode: VisibilityMode = state === "unavailable" ? "disable" : "hide";
    const payload = {
        activity_id: activityId,
        product_id: productId,
        visible_override: false,
        mode,
        updated_at: new Date().toISOString()
    };

    if (existing) {
        const { error } = await supabase
            .from("activity_product_overrides")
            .update(payload)
            .eq("id", existing.id);
        if (error) throw error;
    } else {
        const { error } = await supabase
            .from("activity_product_overrides")
            .insert([{ ...payload, id: crypto.randomUUID() }]);
        if (error) throw error;
    }
}

/**
 * Variante batch di `updateActivityProductVisibility`: applica lo stesso stato
 * tri-state a più prodotti con un numero costante di query (mai una per prodotto).
 *
 * - `"visible"` → 2 statement filtrati lato SQL, nessun SELECT intermedio:
 *   DELETE delle righe senza price_override + UPDATE (azzera visible_override/mode)
 *   di quelle con price_override, che resta intatto — stessa semantica
 *   preserve-price del path single-product.
 * - `"hidden"` | `"unavailable"` → SELECT delle righe esistenti + UPDATE batch
 *   + INSERT batch dei mancanti (max 3 query). Niente upsert onConflict:
 *   `id` non ha default DB, quindi il DO UPDATE riscriverebbe la PK delle
 *   righe esistenti.
 */
export async function bulkUpdateActivityProductVisibility(
    activityId: string,
    productIds: string[],
    state: ProductVisibilityState
): Promise<void> {
    if (productIds.length === 0) return;

    const nowIso = new Date().toISOString();

    if (state === "visible") {
        const { error: deleteError } = await supabase
            .from("activity_product_overrides")
            .delete()
            .eq("activity_id", activityId)
            .in("product_id", productIds)
            .is("price_override", null);
        if (deleteError) throw deleteError;

        const { error: updateError } = await supabase
            .from("activity_product_overrides")
            .update({ visible_override: null, mode: null, updated_at: nowIso })
            .eq("activity_id", activityId)
            .in("product_id", productIds)
            .not("price_override", "is", null);
        if (updateError) throw updateError;
        return;
    }

    const mode: VisibilityMode = state === "unavailable" ? "disable" : "hide";

    const { data: existingRows, error: selectError } = await supabase
        .from("activity_product_overrides")
        .select("product_id")
        .eq("activity_id", activityId)
        .in("product_id", productIds);
    if (selectError) throw selectError;

    const existingIds = new Set(
        ((existingRows ?? []) as Array<{ product_id: string }>).map(r => r.product_id)
    );
    const toUpdate = productIds.filter(id => existingIds.has(id));
    const toInsert = productIds.filter(id => !existingIds.has(id));

    if (toUpdate.length > 0) {
        const { error } = await supabase
            .from("activity_product_overrides")
            .update({ visible_override: false, mode, updated_at: nowIso })
            .eq("activity_id", activityId)
            .in("product_id", toUpdate);
        if (error) throw error;
    }

    if (toInsert.length > 0) {
        const { error } = await supabase
            .from("activity_product_overrides")
            .insert(
                toInsert.map(productId => ({
                    id: crypto.randomUUID(),
                    activity_id: activityId,
                    product_id: productId,
                    visible_override: false,
                    mode,
                    updated_at: nowIso
                }))
            );
        if (error) throw error;
    }
}

/**
 * Fetches all product overrides for a specific activity.
 */
export type ActivityProductOverride = {
    visible_override: boolean | null;
    price_override: number | null;
    mode: VisibilityMode | null;
};

export async function getActivityProductOverrides(
    activityId: string
): Promise<Record<string, ActivityProductOverride>> {
    const { data, error } = await supabase
        .from("activity_product_overrides")
        .select("product_id, visible_override, price_override, mode")
        .eq("activity_id", activityId);

    if (error) throw error;

    const map: Record<string, ActivityProductOverride> = {};
    for (const row of data || []) {
        map[row.product_id] = {
            visible_override: row.visible_override,
            price_override: row.price_override,
            mode: (row.mode as VisibilityMode | null) ?? null
        };
    }
    return map;
}

/**
 * Deriva lo stato tri-state dalla coppia (visible_override, mode).
 * Fallback allineato al resolver: `visible_override=false` + mode assente/`hide` = hidden.
 */
export function deriveVisibilityState(
    visibleOverride: boolean | null | undefined,
    mode: VisibilityMode | null | undefined
): ProductVisibilityState {
    if (visibleOverride === false) {
        return mode === "disable" ? "unavailable" : "hidden";
    }
    return "visible";
}
