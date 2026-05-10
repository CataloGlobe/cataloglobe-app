import { supabase } from "@/services/supabase/client";

export type ProductUsageItem = {
    id: string;
    name: string;
};

export type ProductUsageData = {
    catalogs: ProductUsageItem[];
    schedules: ProductUsageItem[];
    activities: ProductUsageItem[];
};

export type ProductCategoryAssignment = {
    catalog: { id: string; name: string };
    category: { id: string; name: string };
};

type CatalogCategoryProductRow = {
    catalog_id: string;
};

type CatalogRow = {
    id: string;
    name: string;
};

type ScheduleLayoutRow = {
    schedule_id: string;
};

type ScheduleRow = {
    id: string;
    name: string;
    target_type: string;
    target_id: string | null;
};

type ActivityRow = {
    id: string;
    name: string;
};

export async function getProductUsage(
    productId: string,
    _tenantId: string
): Promise<ProductUsageData> {
    // Step 1: catalog IDs that contain this product
    const { data: catalogItems, error: ciError } = await supabase
        .from("catalog_category_products")
        .select("catalog_id")
        .eq("product_id", productId);
    if (ciError) throw new Error(ciError.message);

    const catalogIds = (catalogItems ?? [] as CatalogCategoryProductRow[])
        .map((r: CatalogCategoryProductRow) => r.catalog_id)
        .filter(Boolean);

    if (catalogIds.length === 0) {
        return { catalogs: [], schedules: [], activities: [] };
    }

    // Step 2: catalog names
    const { data: catalogsData, error: cError } = await supabase
        .from("catalogs")
        .select("id, name")
        .in("id", catalogIds);
    if (cError) throw new Error(cError.message);
    const catalogs = (catalogsData ?? []) as CatalogRow[];

    // Step 3: schedules via schedule_layout
    const { data: layoutData, error: layoutError } = await supabase
        .from("schedule_layout")
        .select("schedule_id")
        .in("catalog_id", catalogIds);
    if (layoutError) throw new Error(layoutError.message);

    const scheduleIds = [
        ...new Set(
            (layoutData ?? [] as ScheduleLayoutRow[])
                .map((r: ScheduleLayoutRow) => r.schedule_id)
                .filter(Boolean)
        )
    ];

    if (scheduleIds.length === 0) {
        return { catalogs, schedules: [], activities: [] };
    }

    const { data: schedulesData, error: sError } = await supabase
        .from("schedules")
        .select("id, name, target_type, target_id")
        .in("id", scheduleIds);
    if (sError) throw new Error(sError.message);

    const scheduleRows = (schedulesData ?? []) as ScheduleRow[];
    const schedules: ProductUsageItem[] = scheduleRows.map(s => ({ id: s.id, name: s.name }));

    // Step 4: activities from schedule targets
    const activityIds = [
        ...new Set(
            scheduleRows
                .filter(s => s.target_type === "activity" && s.target_id !== null)
                .map(s => s.target_id as string)
        )
    ];

    if (activityIds.length === 0) {
        return { catalogs, schedules, activities: [] };
    }

    const { data: activitiesData, error: aError } = await supabase
        .from("activities")
        .select("id, name")
        .in("id", activityIds)
        .order("name", { ascending: true });
    if (aError) throw new Error(aError.message);

    const activities = (activitiesData ?? []) as ActivityRow[];

    return { catalogs, schedules, activities };
}

/**
 * Per un prodotto, restituisce tutte le assegnazioni (catalogo, categoria)
 * filtrate per tenant. Ordinamento: catalogo asc, categoria asc.
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
