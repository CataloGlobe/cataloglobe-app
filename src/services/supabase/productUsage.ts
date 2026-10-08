import { supabase } from "@/services/supabase/client";
import { listAppearanceSources } from "@/services/supabase/layoutScheduling";
import { resolveProductUsage, type ProductUsageData, type UsageRule } from "@/utils/productUsage";

export type { ProductUsageData, ProductUsageItem } from "@/utils/productUsage";

export type ProductCategoryAssignment = {
    catalog: { id: string; name: string };
    category: { id: string; name: string };
};

type OverrideScheduleRow = { schedule_id: string };

type PriceVisibilityScheduleRow = {
    id: string;
    name: string | null;
    rule_type: "price" | "visibility";
    apply_to_all: boolean;
    targets: Array<{ target_type: string; target_id: string }> | null;
};

/**
 * Dove si usa un prodotto (tab «Utilizzo»), T19: i menù dell'azienda che lo
 * contengono, le regole che lo toccano (menù con quei cataloghi, prezzi e
 * visibilità che lo nominano) e le sedi che raggiungono, dai target veri
 * (`schedule_targets`, gruppi, «tutte le sedi»). Tutto filtrato per
 * `tenant_id`, oltre alla RLS. La regola di composizione sta in
 * `resolveProductUsage`.
 */
export async function getProductUsage(productId: string, tenantId: string): Promise<ProductUsageData> {
    const [catalogItemsRes, priceRes, visibilityRes, sources] = await Promise.all([
        supabase.from("catalog_category_products").select("catalog_id").eq("product_id", productId),
        supabase.from("schedule_price_overrides").select("schedule_id").eq("product_id", productId),
        supabase.from("schedule_visibility_overrides").select("schedule_id").eq("product_id", productId),
        listAppearanceSources(tenantId)
    ]);
    if (catalogItemsRes.error) throw new Error(catalogItemsRes.error.message);
    if (priceRes.error) throw new Error(priceRes.error.message);
    if (visibilityRes.error) throw new Error(visibilityRes.error.message);

    const catalogIds = [
        ...new Set(((catalogItemsRes.data ?? []) as Array<{ catalog_id: string }>).map(r => r.catalog_id).filter(Boolean))
    ];
    const overrideScheduleIds = [
        ...new Set(
            [...((priceRes.data ?? []) as OverrideScheduleRow[]), ...((visibilityRes.data ?? []) as OverrideScheduleRow[])]
                .map(r => r.schedule_id)
                .filter(Boolean)
        )
    ];

    const [catalogsRes, overrideSchedulesRes] = await Promise.all([
        catalogIds.length > 0
            ? supabase.from("catalogs").select("id, name").eq("tenant_id", tenantId).in("id", catalogIds).order("name")
            : Promise.resolve({ data: [], error: null }),
        overrideScheduleIds.length > 0
            ? supabase
                  .from("schedules")
                  .select("id, name, rule_type, apply_to_all, targets:schedule_targets(target_type, target_id)")
                  .eq("tenant_id", tenantId)
                  .in("rule_type", ["price", "visibility"])
                  .in("id", overrideScheduleIds)
            : Promise.resolve({ data: [], error: null })
    ]);
    if (catalogsRes.error) throw new Error(catalogsRes.error.message);
    if (overrideSchedulesRes.error) throw new Error(overrideSchedulesRes.error.message);

    const layoutRules: UsageRule[] = sources.rules
        .filter(rule => rule.rule_type === "layout")
        .map(rule => ({
            id: rule.id,
            name: rule.name,
            rule_type: rule.rule_type,
            catalogId: rule.layout?.catalog_id ?? null,
            applyToAll: rule.applyToAll,
            activityIds: rule.activityIds,
            groupIds: rule.groupIds
        }));
    const overrideRules: UsageRule[] = ((overrideSchedulesRes.data ?? []) as PriceVisibilityScheduleRow[]).map(row => {
        const targets = row.apply_to_all ? [] : (row.targets ?? []);
        return {
            id: row.id,
            name: row.name,
            rule_type: row.rule_type,
            catalogId: null,
            applyToAll: row.apply_to_all,
            activityIds: targets.filter(t => t.target_type === "activity").map(t => t.target_id),
            groupIds: targets.filter(t => t.target_type === "activity_group").map(t => t.target_id)
        };
    });

    return resolveProductUsage({
        catalogs: (catalogsRes.data ?? []) as Array<{ id: string; name: string }>,
        rules: [...layoutRules, ...overrideRules],
        activities: sources.activities.map(a => ({ id: a.id, name: a.name })),
        activityIdsByGroupId: sources.activityIdsByGroupId
    });
}

/**
 * Per un prodotto, restituisce tutte le assegnazioni (catalogo, categoria)
 * filtrate per tenant. Ordinamento: catalogo asc, categoria asc.
 *
 * Usata da UsageTab per arricchire le righe della card "Cataloghi" con
 * il breadcrumb "Catalogo › Categoria" — un prodotto può apparire in
 * più categorie dello stesso catalogo, in tal caso ritorna 1 row per
 * coppia (catalog, category).
 *
 * Pattern multi-step (coerente con getProductUsage):
 *  1. catalog_category_products → coppie (catalog_id, category_id)
 *  2. catalogs filtrati per tenant_id
 *  3. catalog_categories per i category_id raccolti
 *
 * Le righe la cui FK catalog non risolve nel tenant vengono droppate
 * (defense-in-depth: RLS già blocca, ma il filter applicativo evita di
 * mostrare orfani).
 */
export async function getProductCategoryAssignments(
    productId: string,
    tenantId: string
): Promise<ProductCategoryAssignment[]> {
    const { data: rows, error: rowsErr } = await supabase
        .from("catalog_category_products")
        .select("catalog_id, category_id")
        .eq("product_id", productId);
    if (rowsErr) throw new Error(rowsErr.message);
    if (!rows || rows.length === 0) return [];

    const catalogIds = [...new Set(rows.map(r => r.catalog_id as string).filter(Boolean))];
    const categoryIds = [...new Set(rows.map(r => r.category_id as string).filter(Boolean))];

    const [{ data: catalogsData, error: cErr }, { data: categoriesData, error: catErr }] =
        await Promise.all([
            supabase
                .from("catalogs")
                .select("id, name")
                .in("id", catalogIds)
                .eq("tenant_id", tenantId),
            supabase
                .from("catalog_categories")
                .select("id, name")
                .in("id", categoryIds)
        ]);
    if (cErr) throw new Error(cErr.message);
    if (catErr) throw new Error(catErr.message);

    const catalogMap = new Map<string, string>(
        (catalogsData ?? []).map(c => [c.id as string, c.name as string])
    );
    const categoryMap = new Map<string, string>(
        (categoriesData ?? []).map(c => [c.id as string, c.name as string])
    );

    const assignments: ProductCategoryAssignment[] = [];
    for (const row of rows) {
        const catalogId = row.catalog_id as string;
        const categoryId = row.category_id as string;
        const catalogName = catalogMap.get(catalogId);
        const categoryName = categoryMap.get(categoryId);
        if (!catalogName || !categoryName) continue;
        assignments.push({
            catalog: { id: catalogId, name: catalogName },
            category: { id: categoryId, name: categoryName }
        });
    }

    assignments.sort((a, b) => {
        const c = a.catalog.name.localeCompare(b.catalog.name);
        if (c !== 0) return c;
        return a.category.name.localeCompare(b.category.name);
    });

    return assignments;
}
