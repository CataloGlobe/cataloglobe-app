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
