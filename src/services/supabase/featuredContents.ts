import { supabase } from "@/services/supabase/client";

export type FeaturedContentStatus = "draft" | "published";
export type FeaturedContentPricingMode = "none" | "per_item" | "bundle";
export type FeaturedContentType = "announcement" | "event" | "promo" | "bundle";

export interface FeaturedContent {
    id: string;
    tenant_id: string;
    internal_name: string;
    title: string;
    subtitle: string | null;
    description: string | null;
    media_id: string | null;
    cta_text: string | null;
    cta_url: string | null;
    status: FeaturedContentStatus;
    layout_style: string | null;
    pricing_mode: FeaturedContentPricingMode;
    content_type: FeaturedContentType;
    bundle_price: number | null;
    show_original_total: boolean;
    created_at: string;
    updated_at: string;
}

export interface FeaturedContentProduct {
    id: string;
    tenant_id: string;
    featured_content_id: string;
    product_id: string;
    sort_order: number;
    note: string | null;
    created_at: string;
}

export interface FeaturedContentWithProducts extends FeaturedContent {
    products_count?: number;
    products?: (FeaturedContentProduct & {
        product?: {
            id: string;
            name: string;
            description?: string;
            base_price?: number;
        };
    })[];
}

type FeaturedContentListRaw = FeaturedContent & {
    products: [{ count: number }] | null;
};

export interface FeaturedContentProductRow {
    id: string;
    featured_content_id: string;
    product_id: string;
    sort_order: number;
    note: string | null;
    products: {
        id: string;
        name: string;
        base_price: number | null;
        option_groups: Array<{
            group_kind: string;
            values: Array<{ absolute_price: number | null }>;
        }> | null;
    } | null;
}

export async function listFeaturedContents(tenantId: string): Promise<FeaturedContentWithProducts[]> {
    const { data, error } = await supabase
        .from("featured_contents")
        .select(
            `
            *,
            products:featured_content_products (count)
        `
        )
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false });

    if (error) throw error;

    return (data as unknown as FeaturedContentListRaw[]).map(item => {
        const { products: _, ...rest } = item;
        return { ...rest, products_count: item.products?.[0]?.count || 0 };
    });
}

export async function getFeaturedContentById(id: string, tenantId: string): Promise<FeaturedContentWithProducts> {
    const { data: content, error: contentError } = await supabase
        .from("featured_contents")
        .select(`*`)
        .eq("id", id)
        .eq("tenant_id", tenantId)
        .single();

    if (contentError) throw contentError;

    const { data: products, error: productsError } = await supabase
        .from("featured_content_products")
        .select(
            `
            *,
            product:product_id (id, name, description, base_price)
        `
        )
        .eq("featured_content_id", id)
        .eq("tenant_id", tenantId)
        .order("sort_order", { ascending: true });

    if (productsError) throw productsError;

    return { ...content, products };
}

export async function createFeaturedContent(
    tenantId: string,
    contentData: Partial<FeaturedContent>,
    productsData: Partial<FeaturedContentProduct>[] = []
) {
    const { data: content, error: contentError } = await supabase
        .from("featured_contents")
        .insert({
            ...contentData,
            tenant_id: tenantId
        })
        .select()
        .single();

    if (contentError) throw contentError;

    if (productsData.length > 0) {
        const productsToInsert = productsData.map((p, index) => ({
            ...p,
            tenant_id: tenantId,
            featured_content_id: content.id,
            sort_order: p.sort_order ?? index
        }));

        const { error: productsError } = await supabase
            .from("featured_content_products")
            .insert(productsToInsert);

        if (productsError) throw productsError;
    }

    return content;
}

export async function updateFeaturedContent(
    id: string,
    tenantId: string,
    contentData: Partial<FeaturedContent>,
    productsData?: Partial<FeaturedContentProduct>[]
): Promise<FeaturedContent> {
    const { data: content, error: contentError } = await supabase
        .from("featured_contents")
        .update(contentData)
        .eq("id", id)
        .eq("tenant_id", tenantId)
        .select()
        .single();

    if (contentError) throw contentError;

    // Solo se productsData è esplicitamente passato, esegui delete+reinsert
    if (productsData !== undefined) {
        const { error: delError } = await supabase
            .from("featured_content_products")
            .delete()
            .eq("featured_content_id", id)
            .eq("tenant_id", tenantId);

        if (delError) throw delError;

        if (productsData.length > 0) {
            const productsToInsert = productsData.map((p, index) => ({
                product_id: p.product_id,
                note: p.note || null,
                tenant_id: tenantId,
                featured_content_id: id,
                sort_order: p.sort_order ?? index
            }));

            const { error: productsError } = await supabase
                .from("featured_content_products")
                .insert(productsToInsert);

            if (productsError) throw productsError;
        }
    }

    return content as FeaturedContent;
}

export async function deleteFeaturedContent(id: string, tenantId: string) {
    const { error } = await supabase
        .from("featured_contents")
        .delete()
        .eq("id", id)
        .eq("tenant_id", tenantId);

    if (error) throw error;
}

export async function listFeaturedContentProducts(
    featuredId: string,
    tenantId: string
): Promise<FeaturedContentProductRow[]> {
    const { data, error } = await supabase
        .from("featured_content_products")
        .select(
            `
            id,
            featured_content_id,
            product_id,
            sort_order,
            note,
            products (id, name, base_price, option_groups:product_option_groups(group_kind, values:product_option_values(absolute_price)))
        `
        )
        .eq("featured_content_id", featuredId)
        .eq("tenant_id", tenantId)
        .order("sort_order", { ascending: true });

    if (error) throw error;
    return (data as unknown as FeaturedContentProductRow[]) ?? [];
}

export async function deleteFeaturedContentProduct(id: string, tenantId: string): Promise<void> {
    const { error } = await supabase
        .from("featured_content_products")
        .delete()
        .eq("id", id)
        .eq("tenant_id", tenantId);

    if (error) throw error;
}

export async function updateFeaturedContentProductNote(
    id: string,
    tenantId: string,
    note: string | null
): Promise<void> {
    const { error } = await supabase
        .from("featured_content_products")
        .update({ note })
        .eq("id", id)
        .eq("tenant_id", tenantId);

    if (error) throw error;
}

export async function updateFeaturedContentProductsSortOrder(
    rows: { id: string; sort_order: number }[],
    tenantId: string
): Promise<void> {
    const results = await Promise.all(
        rows.map(row =>
            supabase
                .from("featured_content_products")
                .update({ sort_order: row.sort_order })
                .eq("id", row.id)
                .eq("tenant_id", tenantId)
        )
    );
    const failed = results.find(r => r.error);
    if (failed?.error) throw failed.error;
}

export async function syncFeaturedContentProducts(
    featuredId: string,
    tenantId: string,
    toRemoveIds: string[],
    toAddItems: { productId: string; sortOrder: number }[]
): Promise<void> {
    const ops: Promise<void>[] = [];

    if (toRemoveIds.length > 0) {
        ops.push(
            Promise.resolve(
                supabase
                    .from("featured_content_products")
                    .delete()
                    .in("id", toRemoveIds)
                    .eq("tenant_id", tenantId)
                    .then(({ error }) => {
                        if (error) throw error;
                    })
            )
        );
    }

    if (toAddItems.length > 0) {
        const payload = toAddItems.map(item => ({
            tenant_id: tenantId,
            featured_content_id: featuredId,
            product_id: item.productId,
            sort_order: item.sortOrder,
            note: null
        }));
        ops.push(
            Promise.resolve(
                supabase
                    .from("featured_content_products")
                    .insert(payload)
                    .then(({ error }) => {
                        if (error) throw error;
                    })
            )
        );
    }

    await Promise.all(ops);
}
