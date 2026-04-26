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
 * Recursively remove all storage files under `{tenantId}/` in a bucket.
 * Used for flat/nested tenant-scoped buckets:
 *   - product-images   → {tenantId}/products/{productId}.{ext}
 *   - featured-contents → {tenantId}/{contentId}.{ext}
 *   - tenant-assets    → {tenantId}/...
 *   - style-backgrounds → {tenantId}/...
 *
 * Non-throwing: on error logs a warning and continues.
 * Returns total file count removed.
 */
async function purgeTenantFolder(
    admin: ReturnType<typeof createClient>,
    bucket: string,
    tenantId: string
): Promise<number> {
    const storage = admin.storage.from(bucket);
    let totalRemoved = 0;

    async function purgePrefix(prefix: string): Promise<void> {
        const { data: items, error: listErr } = await storage.list(prefix, { limit: 1000 });
        if (listErr) {
            console.warn(`tenant-purge: list warn ${bucket}/${prefix}: ${listErr.message}`);
            return;
        }
        if (!items || items.length === 0) return;

        const filePaths = items.filter(f => f.id !== null).map(f => `${prefix}/${f.name}`);
        const subfolders = items.filter(f => f.id === null).map(f => `${prefix}/${f.name}`);

        if (filePaths.length > 0) {
            const { error: removeErr } = await storage.remove(filePaths);
            if (removeErr) {
                console.warn(`tenant-purge: remove warn ${bucket}/${prefix}: ${removeErr.message}`);
            } else {
                totalRemoved += filePaths.length;
            }
        }

        for (const sub of subfolders) {
            await purgePrefix(sub);
        }
    }

    await purgePrefix(tenantId);
    return totalRemoved;
}

/**
 * Remove all storage files for a single activity folder.
 * Path convention: `{tenantId}/{safeSlug}__{activityId}/`
 */
export async function purgeActivityFolder(
    admin: ReturnType<typeof createClient>,
    bucket: string,
    activity: Activity,
    tenantId: string
): Promise<number> {
    const storage = admin.storage.from(bucket);

    const safeSlug = activity.slug
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 60) || "activity";
    const folder = `${tenantId}/${safeSlug}__${activity.id}`;

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
 *    1.  Storage assets per activity  ({tenantId}/{slug}__{activityId}/ in business-covers)
 *        + tenant-scoped buckets: product-images, featured-contents, tenant-assets, style-backgrounds
 *    --- junction / product-child tables ---
 *    2.  featured_content_products
 *    3.  schedule_featured_contents
 *    4.  catalog_category_products
 *    5.  product_group_items
 *    6.  product_option_values
 *    7.  product_ingredients
 *    8.  product_attribute_values
 *    9.  product_allergens
 *    --- secondary entities ---
 *   10.  catalog_categories
 *   11.  catalogs
 *   12.  product_option_groups
 *   13.  product_groups
 *   14.  ingredients
 *   15.  product_attribute_definitions
 *   16.  featured_contents
 *    --- styles (circular FK — must break before deleting versions) ---
 *   17.  UPDATE styles SET current_version_id = NULL
 *   18.  style_versions
 *   19.  styles
 *    --- schedules ---
 *   20.  schedule_targets   (no tenant_id — filtered by schedule_id)
 *   21.  schedule_layout
 *   22.  schedules
 *    --- activity structures ---
 *   23.  activity_group_members
 *   24.  activity_groups
 *   25.  activities
 *    --- products ---
 *   26.  products
 *    --- memberships ---
 *   27.  tenant_memberships
 *    --- tenant ---
 *   28.  tenants  (hard delete)
 */
export async function purgeTenantData(
    admin: ReturnType<typeof createClient>,
    tenantId: string
): Promise<PurgeSummary> {
    const deleted: Record<string, number> = {};
    let storageFilesRemoved = 0;

    // 1. Fetch activities for storage cleanup (must happen before DB delete)
    const { data: activities, error: actErr } = await admin
        .from("activities")
        .select("id, slug")
        .eq("tenant_id", tenantId);

    if (actErr) throw new Error(`Failed to fetch activities: ${actErr.message}`);

    // 2. Storage cleanup
    //    2a. business-covers: one folder per activity ({tenantId}/{slug}__{id}/)
    for (const activity of activities ?? []) {
        storageFilesRemoved += await purgeActivityFolder(admin, "business-covers", activity as Activity, tenantId);
    }

    //    2b. Tenant-scoped buckets: entire {tenantId}/ folder
    //        Errors are non-blocking — logged and counted, purge continues.
    const tenantBuckets = ["product-images", "featured-contents", "tenant-assets", "style-backgrounds"];
    for (const bucket of tenantBuckets) {
        try {
            const removed = await purgeTenantFolder(admin, bucket, tenantId);
            storageFilesRemoved += removed;
            if (removed > 0) {
                console.log(`tenant-purge: removed ${removed} files from ${bucket}/${tenantId}`);
            }
        } catch (err) {
            console.warn(`tenant-purge: bucket ${bucket} cleanup failed: ${err instanceof Error ? err.message : String(err)}`);
        }
    }

    // 3. Junction / product-child tables (deepest dependents first)
    deleted["featured_content_products"]     = await deleteFromTable(admin, "featured_content_products",     tenantId);
    deleted["schedule_featured_contents"]    = await deleteFromTable(admin, "schedule_featured_contents",    tenantId);
    deleted["catalog_category_products"]     = await deleteFromTable(admin, "catalog_category_products",     tenantId);
    deleted["product_group_items"]           = await deleteFromTable(admin, "product_group_items",           tenantId);
    deleted["product_option_values"]         = await deleteFromTable(admin, "product_option_values",         tenantId);
    deleted["product_ingredients"]           = await deleteFromTable(admin, "product_ingredients",           tenantId);
    deleted["product_attribute_values"]      = await deleteFromTable(admin, "product_attribute_values",      tenantId);
    deleted["product_allergens"]             = await deleteFromTable(admin, "product_allergens",             tenantId);

    // 4. Secondary entities (children cleared above)
    deleted["catalog_categories"]            = await deleteFromTable(admin, "catalog_categories",            tenantId);
    deleted["catalogs"]                      = await deleteFromTable(admin, "catalogs",                      tenantId);
    deleted["product_option_groups"]         = await deleteFromTable(admin, "product_option_groups",         tenantId);
    deleted["product_groups"]                = await deleteFromTable(admin, "product_groups",                tenantId);
    deleted["ingredients"]                   = await deleteFromTable(admin, "ingredients",                   tenantId);
    // tenant_id is nullable here (platform attrs use NULL) — only removes tenant-owned definitions
    deleted["product_attribute_definitions"] = await deleteFromTable(admin, "product_attribute_definitions", tenantId);
    deleted["featured_contents"]             = await deleteFromTable(admin, "featured_contents",             tenantId);

    // 5. Styles — break circular FK (styles.current_version_id → style_versions.id)
    //    before deleting versions
    const { error: nullifyErr } = await admin
        .from("styles")
        .update({ current_version_id: null })
        .eq("tenant_id", tenantId);

    if (nullifyErr) throw new Error(`Failed to nullify current_version_id: ${nullifyErr.message}`);

    deleted["style_versions"] = await deleteFromTable(admin, "style_versions", tenantId);
    deleted["styles"]         = await deleteFromTable(admin, "styles",         tenantId);

    // 6. Schedules — schedule_targets has no tenant_id column; filter by schedule_id
    const { data: schedRows, error: schedErr } = await admin
        .from("schedules")
        .select("id")
        .eq("tenant_id", tenantId);

    if (schedErr) throw new Error(`Failed to fetch schedules: ${schedErr.message}`);

    const scheduleIds = (schedRows ?? []).map(r => r.id);
    if (scheduleIds.length > 0) {
        const { data: stData, error: stErr } = await admin
            .from("schedule_targets")
            .delete()
            .in("schedule_id", scheduleIds)
            .select();

        if (stErr) throw new Error(`Failed to delete from schedule_targets: ${stErr.message}`);
        deleted["schedule_targets"] = stData?.length ?? 0;
    } else {
        deleted["schedule_targets"] = 0;
    }

    deleted["schedule_layout"] = await deleteFromTable(admin, "schedule_layout", tenantId);
    deleted["schedules"]       = await deleteFromTable(admin, "schedules",       tenantId);

    // 7. Activity structures
    deleted["activity_group_members"] = await deleteFromTable(admin, "activity_group_members", tenantId);
    deleted["activity_groups"]        = await deleteFromTable(admin, "activity_groups",        tenantId);
    deleted["activities"]             = await deleteFromTable(admin, "activities",             tenantId);

    // 8. Products (RESTRICT on tenant_id — all children cleared above)
    deleted["products"] = await deleteFromTable(admin, "products", tenantId);

    // 9. Memberships
    deleted["tenant_memberships"] = await deleteFromTable(admin, "tenant_memberships", tenantId);

    // 10. Hard-delete tenant row (cascades any remaining children)
    const { error: tenantErr } = await admin.from("tenants").delete().eq("id", tenantId);
    if (tenantErr) throw new Error(`Failed to delete tenant row: ${tenantErr.message}`);

    deleted["tenants"] = 1;

    return { deleted, storageFilesRemoved };
}
