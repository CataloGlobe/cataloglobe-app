// @ts-nocheck
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ---------------------------------------------------------------------------
// Shared tenant purge logic.
//
// Used by:
//   - purge-tenants/index.ts  (scheduled, batch)
//   - purge-tenant-now/index.ts  (on-demand, single tenant)
//
// Deletion order must satisfy all FK RESTRICT constraints.
// ---------------------------------------------------------------------------

export interface Activity {
    id: string;
    slug: string;
}

export interface PurgeSummary {
    deleted: Record<string, number>;
    storageFilesRemoved: number;
}

/** Delete all rows for a tenant from a given table and return the count. */
export async function deleteFromTable(
    admin: ReturnType<typeof createClient>,
    table: string,
    tenantId: string
): Promise<number> {
    const { data, error } = await admin
        .from(table)
        .delete()
        .eq("tenant_id", tenantId)
        .select();

    if (error) throw new Error(`Failed to delete from ${table}: ${error.message}`);
    return data?.length ?? 0;
}

/**
 * Remove all storage files for a single activity folder.
 * Path convention: `{safeSlug}__{activityId}/`
 */
export async function purgeActivityFolder(
    admin: ReturnType<typeof createClient>,
    bucket: string,
    activity: Activity
): Promise<number> {
    const storage = admin.storage.from(bucket);

    const safeSlug = activity.slug
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 60) || "activity";
    const folder = `${safeSlug}__${activity.id}`;

    const { data: files, error: listErr } = await storage.list(folder, { limit: 1000 });
    if (listErr) {
        console.warn(`tenant-purge: storage list warn for ${bucket}/${folder}: ${listErr.message}`);
        return 0;
    }
    if (!files || files.length === 0) return 0;

    const paths = files.filter(f => f.id !== null).map(f => `${folder}/${f.name}`);
    if (paths.length === 0) return 0;

    const { error: removeErr } = await storage.remove(paths);
    if (removeErr) throw new Error(`Storage remove error in ${bucket}/${folder}: ${removeErr.message}`);

    return paths.length;
}

/**
 * Permanently delete all data for a single tenant.
 *
 * Throws on the first error — caller is responsible for wrapping in try/catch
 * if it needs to continue after a partial failure (as purge-tenants does for
 * batch processing).
 *
 * Deletion order (RESTRICT FK parents must be cleared after their children):
 *    1.  Storage assets per activity  ({slug}__{activityId}/ in business-covers)
 *    --- junction / product-child tables ---
 *    2.  v2_featured_content_products
 *    3.  v2_schedule_featured_contents
 *    4.  v2_catalog_category_products
 *    5.  v2_product_group_items
 *    6.  v2_product_option_values
 *    7.  v2_product_ingredients
 *    8.  v2_product_attribute_values
 *    9.  v2_product_allergens
 *    --- secondary entities ---
 *   10.  v2_catalog_categories
 *   11.  v2_catalogs
 *   12.  v2_product_option_groups
 *   13.  v2_product_groups
 *   14.  v2_ingredients
 *   15.  v2_product_attribute_definitions
 *   16.  v2_featured_contents
 *    --- styles (circular FK — must break before deleting versions) ---
 *   17.  UPDATE v2_styles SET current_version_id = NULL
 *   18.  v2_style_versions
 *   19.  v2_styles
 *    --- schedules ---
 *   20.  v2_schedule_targets   (no tenant_id — filtered by schedule_id)
 *   21.  v2_schedule_layout
 *   22.  v2_schedules
 *    --- activity structures ---
 *   23.  v2_activity_group_members
 *   24.  v2_activity_groups
 *   25.  v2_activities
 *    --- products ---
 *   26.  v2_products
 *    --- memberships ---
 *   27.  v2_tenant_memberships
 *    --- tenant ---
 *   28.  v2_tenants  (hard delete)
 */
export async function purgeTenantData(
    admin: ReturnType<typeof createClient>,
    tenantId: string
): Promise<PurgeSummary> {
    const deleted: Record<string, number> = {};
    let storageFilesRemoved = 0;

    // 1. Fetch activities for storage cleanup (must happen before DB delete)
    const { data: activities, error: actErr } = await admin
        .from("v2_activities")
        .select("id, slug")
        .eq("tenant_id", tenantId);

    if (actErr) throw new Error(`Failed to fetch activities: ${actErr.message}`);

    // 2. Storage cleanup — one folder per activity in business-covers
    for (const activity of activities ?? []) {
        storageFilesRemoved += await purgeActivityFolder(admin, "business-covers", activity as Activity);
    }

    // 3. Junction / product-child tables (deepest dependents first)
    deleted["v2_featured_content_products"]     = await deleteFromTable(admin, "v2_featured_content_products",     tenantId);
    deleted["v2_schedule_featured_contents"]    = await deleteFromTable(admin, "v2_schedule_featured_contents",    tenantId);
    deleted["v2_catalog_category_products"]     = await deleteFromTable(admin, "v2_catalog_category_products",     tenantId);
    deleted["v2_product_group_items"]           = await deleteFromTable(admin, "v2_product_group_items",           tenantId);
    deleted["v2_product_option_values"]         = await deleteFromTable(admin, "v2_product_option_values",         tenantId);
    deleted["v2_product_ingredients"]           = await deleteFromTable(admin, "v2_product_ingredients",           tenantId);
    deleted["v2_product_attribute_values"]      = await deleteFromTable(admin, "v2_product_attribute_values",      tenantId);
    deleted["v2_product_allergens"]             = await deleteFromTable(admin, "v2_product_allergens",             tenantId);

    // 4. Secondary entities (children cleared above)
    deleted["v2_catalog_categories"]            = await deleteFromTable(admin, "v2_catalog_categories",            tenantId);
    deleted["v2_catalogs"]                      = await deleteFromTable(admin, "v2_catalogs",                      tenantId);
    deleted["v2_product_option_groups"]         = await deleteFromTable(admin, "v2_product_option_groups",         tenantId);
    deleted["v2_product_groups"]                = await deleteFromTable(admin, "v2_product_groups",                tenantId);
    deleted["v2_ingredients"]                   = await deleteFromTable(admin, "v2_ingredients",                   tenantId);
    // tenant_id is nullable here (platform attrs use NULL) — only removes tenant-owned definitions
    deleted["v2_product_attribute_definitions"] = await deleteFromTable(admin, "v2_product_attribute_definitions", tenantId);
    deleted["v2_featured_contents"]             = await deleteFromTable(admin, "v2_featured_contents",             tenantId);

    // 5. Styles — break circular FK (v2_styles.current_version_id → v2_style_versions.id)
    //    before deleting versions
    const { error: nullifyErr } = await admin
        .from("v2_styles")
        .update({ current_version_id: null })
        .eq("tenant_id", tenantId);

    if (nullifyErr) throw new Error(`Failed to nullify current_version_id: ${nullifyErr.message}`);

    deleted["v2_style_versions"] = await deleteFromTable(admin, "v2_style_versions", tenantId);
    deleted["v2_styles"]         = await deleteFromTable(admin, "v2_styles",         tenantId);

    // 6. Schedules — v2_schedule_targets has no tenant_id column; filter by schedule_id
    const { data: schedRows, error: schedErr } = await admin
        .from("v2_schedules")
        .select("id")
        .eq("tenant_id", tenantId);

    if (schedErr) throw new Error(`Failed to fetch schedules: ${schedErr.message}`);

    const scheduleIds = (schedRows ?? []).map(r => r.id);
    if (scheduleIds.length > 0) {
        const { data: stData, error: stErr } = await admin
            .from("v2_schedule_targets")
            .delete()
            .in("schedule_id", scheduleIds)
            .select();

        if (stErr) throw new Error(`Failed to delete from v2_schedule_targets: ${stErr.message}`);
        deleted["v2_schedule_targets"] = stData?.length ?? 0;
    } else {
        deleted["v2_schedule_targets"] = 0;
    }

    deleted["v2_schedule_layout"] = await deleteFromTable(admin, "v2_schedule_layout", tenantId);
    deleted["v2_schedules"]       = await deleteFromTable(admin, "v2_schedules",       tenantId);

    // 7. Activity structures
    deleted["v2_activity_group_members"] = await deleteFromTable(admin, "v2_activity_group_members", tenantId);
    deleted["v2_activity_groups"]        = await deleteFromTable(admin, "v2_activity_groups",        tenantId);
    deleted["v2_activities"]             = await deleteFromTable(admin, "v2_activities",             tenantId);

    // 8. Products (RESTRICT on tenant_id — all children cleared above)
    deleted["v2_products"] = await deleteFromTable(admin, "v2_products", tenantId);

    // 9. Memberships
    deleted["v2_tenant_memberships"] = await deleteFromTable(admin, "v2_tenant_memberships", tenantId);

    // 10. Hard-delete tenant row (cascades any remaining children)
    const { error: tenantErr } = await admin.from("v2_tenants").delete().eq("id", tenantId);
    if (tenantErr) throw new Error(`Failed to delete tenant row: ${tenantErr.message}`);

    deleted["v2_tenants"] = 1;

    return { deleted, storageFilesRemoved };
}
