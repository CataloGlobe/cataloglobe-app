import { supabase } from "@/services/supabase/client";

// ==========================================
// TYPES
// ==========================================
export type V2Catalog = {
    id: string;
    tenant_id: string;
    name: string;
    created_at: string;
};

export type V2CatalogCategory = {
    id: string;
    tenant_id: string;
    catalog_id: string;
    parent_category_id: string | null;
    name: string;
    sort_order: number;
    level: 1 | 2 | 3;
    created_at: string;
};

export type V2CatalogCategoryProduct = {
    id: string;
    tenant_id: string;
    catalog_id: string;
    category_id: string;
    product_id: string;
    sort_order: number;
    created_at: string;
};

// ==========================================
// CATALOGS
// ==========================================
export async function listCatalogs(tenantId: string): Promise<V2Catalog[]> {
    const { data, error } = await supabase
        .from("catalogs")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false });

    if (error) throw error;
    return data || [];
}

export async function createCatalog(tenantId: string, name: string): Promise<V2Catalog> {
    const { data, error } = await supabase
        .from("catalogs")
        .insert([{ tenant_id: tenantId, name }])
        .select()
        .single();

    if (error) throw error;
    return data;
}

export async function updateCatalog(
    catalogId: string,
    tenantId: string,
    updates: { name?: string }
): Promise<V2Catalog> {
    const { data, error } = await supabase
        .from("catalogs")
        .update(updates)
        .eq("id", catalogId)
        .eq("tenant_id", tenantId)
        .select()
        .single();

    if (error) throw error;
    return data;
}

export async function deleteCatalog(catalogId: string, tenantId: string): Promise<void> {
    const { error } = await supabase
        .from("catalogs")
        .delete()
        .eq("id", catalogId)
        .eq("tenant_id", tenantId);

    if (error) throw error;
}

// ==========================================
// CATEGORIES
// ==========================================
export async function listCategories(
    tenantId: string,
    catalogId: string
): Promise<V2CatalogCategory[]> {
    const { data, error } = await supabase
        .from("catalog_categories")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("catalog_id", catalogId)
        .order("level", { ascending: true })
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });

    if (error) throw error;
    return data || [];
}

export async function createCategory(
    tenantId: string,
    catalogId: string,
    name: string,
    level: 1 | 2 | 3,
    parentCategoryId: string | null = null,
    sortOrder: number = 0
): Promise<V2CatalogCategory> {
    if (level > 1 && !parentCategoryId) {
        throw new Error("Una categoria di livello superiore a 1 deve avere un genitore.");
    }

    const { data, error } = await supabase
        .from("catalog_categories")
        .insert([
            {
                tenant_id: tenantId,
                catalog_id: catalogId,
                name,
                level,
                parent_category_id: parentCategoryId,
                sort_order: sortOrder
            }
        ])
        .select()
        .single();

    if (error) throw error;
    return data;
}

export async function updateCategory(
    categoryId: string,
    tenantId: string,
    updates: {
        name?: string;
        sort_order?: number;
        parent_category_id?: string | null;
        level?: 1 | 2 | 3;
    }
): Promise<V2CatalogCategory> {
    const { data, error } = await supabase
        .from("catalog_categories")
        .update(updates)
        .eq("id", categoryId)
        .eq("tenant_id", tenantId)
        .select()
        .single();

    if (error) throw error;
    return data;
}

export async function deleteCategory(categoryId: string, tenantId: string): Promise<void> {
    const { error } = await supabase
        .from("catalog_categories")
        .delete()
        .eq("id", categoryId)
        .eq("tenant_id", tenantId);

    if (error) throw error;
}

// ==========================================
// CATEGORY PRODUCTS
// ==========================================
export async function listCategoryProducts(
    tenantId: string,
    catalogId: string
): Promise<V2CatalogCategoryProduct[]> {
    const { data, error } = await supabase
        .from("catalog_category_products")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("catalog_id", catalogId)
        .order("sort_order", { ascending: true });

    if (error) throw error;
    return data || [];
}

export async function addProductToCategory(
    tenantId: string,
    catalogId: string,
    categoryId: string,
    productId: string,
    sortOrder: number = 0
): Promise<V2CatalogCategoryProduct> {
    // ---------------------------------------------------------------------------------
    // ANTI-DUPLICATION CHECK: VERTICAL BRANCH VALIDATION
    // Ensure the product does not exist in the exact same branch (ancestors or descendants)
    // ---------------------------------------------------------------------------------

    // 1. Fetch all categories for this catalog to build the tree
    const categories = await listCategories(tenantId, catalogId);

    // 2. Fetch all products currently assigned in this catalog
    const categoryProducts = await listCategoryProducts(tenantId, catalogId);

    // Find where this product is already assigned
    const existingAssignments = categoryProducts.filter(cp => cp.product_id === productId);

    if (existingAssignments.length > 0) {
        // Build an ancestor map for quick lookup: [categoryId] -> parentCategoryId
        const parentMap = new Map<string, string | null>();
        categories.forEach(cat => parentMap.set(cat.id, cat.parent_category_id));

        // Helper to get all ancestors of a category
        const getAncestors = (catId: string): string[] => {
            const ancestors: string[] = [];
            let currentParent = parentMap.get(catId);
            while (currentParent) {
                ancestors.push(currentParent);
                currentParent = parentMap.get(currentParent);
            }
            return ancestors;
        };

        // Helper to get all descendants of a category
        const getDescendants = (catId: string): string[] => {
            const children = categories.filter(c => c.parent_category_id === catId).map(c => c.id);
            let descendants = [...children];
            for (const childId of children) {
                descendants = [...descendants, ...getDescendants(childId)];
            }
            return descendants;
        };

        const targetAncestors = getAncestors(categoryId);
        const targetDescendants = getDescendants(categoryId);

        // Check each existing assignment against the target category
        for (const assignment of existingAssignments) {
            if (assignment.category_id === categoryId) {
                throw new Error("Il prodotto è già presente in questa categoria.");
            }

            if (targetAncestors.includes(assignment.category_id)) {
                // The product is already in an ancestor category
                const ancestorCat = categories.find(c => c.id === assignment.category_id);
                throw new Error(
                    `Non puoi aggiungere questo prodotto qui, in quanto è già presente in una categoria genitore ("${ancestorCat?.name}").`
                );
            }

            if (targetDescendants.includes(assignment.category_id)) {
                // The product is already in a descendant category
                const descendantCat = categories.find(c => c.id === assignment.category_id);
                throw new Error(
                    `Non puoi aggiungere questo prodotto qui, in quanto è già presente in una sotto-categoria figlia ("${descendantCat?.name}").`
                );
            }
        }
    }

    // ---------------------------------------------------------------------------------
    // IF WE REACH HERE, IT'S SAFE TO INSERT
    // ---------------------------------------------------------------------------------

    const { data, error } = await supabase
        .from("catalog_category_products")
        .insert([
            {
                tenant_id: tenantId,
                catalog_id: catalogId,
                category_id: categoryId,
                product_id: productId,
                sort_order: sortOrder
            }
        ])
        .select()
        .single();

    if (error) {
        if (error.code === "23505") {
            // Postgres unique_violation
            throw new Error("Il prodotto è già presente in questa categoria.");
        }
        throw error;
    }

    return data;
}

export async function removeProductFromCategory(tenantId: string, linkId: string): Promise<void> {
    const { error } = await supabase
        .from("catalog_category_products")
        .delete()
        .eq("id", linkId)
        .eq("tenant_id", tenantId);

    if (error) throw error;
}

export async function updateProductSortOrder(
    linkId: string,
    tenantId: string,
    sortOrder: number
): Promise<V2CatalogCategoryProduct> {
    const { data, error } = await supabase
        .from("catalog_category_products")
        .update({ sort_order: sortOrder })
        .eq("id", linkId)
        .eq("tenant_id", tenantId)
        .select()
        .single();

    if (error) throw error;
    return data;
}
