import { supabase } from "../client";

export type FeaturedContentType = "informative" | "composite";

export interface FeaturedContent {
    id: string;
    tenant_id: string;
    title: string;
    subtitle: string | null;
    description: string | null;
    cover_image_url: string | null;
    type: FeaturedContentType;
    is_active: boolean;
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
            image_url?: string;
            price?: number;
        };
    })[];
}

export async function listFeaturedContents() {
    const { data, error } = await supabase
        .from("v2_featured_contents")
        .select(
            `
            *,
            products:v2_featured_content_products (count)
        `
        )
        .order("created_at", { ascending: false });

    if (error) throw error;

    return data.map((item: any) => ({
        ...item,
        products_count: item.products?.[0]?.count || 0
    }));
}

export async function getFeaturedContentById(id: string): Promise<FeaturedContentWithProducts> {
    const { data: content, error: contentError } = await supabase
        .from("v2_featured_contents")
        .select(`*`)
        .eq("id", id)
        .single();

    if (contentError) throw contentError;

    if (content.type === "composite") {
        const { data: products, error: productsError } = await supabase
            .from("v2_featured_content_products")
            .select(
                `
                *,
                product:product_id (id, name, description, image_url, price)
            `
            )
            .eq("featured_content_id", id)
            .order("sort_order", { ascending: true });

        if (productsError) throw productsError;

        return { ...content, products };
    }

    return content;
}

export async function createFeaturedContent(
    tenantId: string,
    contentData: Partial<FeaturedContent>,
    productsData: Partial<FeaturedContentProduct>[] = []
) {
    const { data: content, error: contentError } = await supabase
        .from("v2_featured_contents")
        .insert({
            ...contentData,
            tenant_id: tenantId
        })
        .select()
        .single();

    if (contentError) throw contentError;

    if (content.type === "composite" && productsData.length > 0) {
        const productsToInsert = productsData.map((p, index) => ({
            ...p,
            tenant_id: tenantId,
            featured_content_id: content.id,
            sort_order: p.sort_order ?? index
        }));

        const { error: productsError } = await supabase
            .from("v2_featured_content_products")
            .insert(productsToInsert);

        if (productsError) throw productsError;
    }

    return content;
}

export async function updateFeaturedContent(
    id: string,
    tenantId: string,
    contentData: Partial<FeaturedContent>,
    productsData: Partial<FeaturedContentProduct>[] = []
) {
    const { data: content, error: contentError } = await supabase
        .from("v2_featured_contents")
        .update(contentData)
        .eq("id", id)
        .select()
        .single();

    if (contentError) throw contentError;

    if (contentData.type === "informative" || content.type === "informative") {
        // If it's informative, delete any possibly existing products
        const { error: delError } = await supabase
            .from("v2_featured_content_products")
            .delete()
            .eq("featured_content_id", id);
        if (delError) throw delError;
    } else if (content.type === "composite") {
        // Delete all and re-insert logic
        const { error: delError } = await supabase
            .from("v2_featured_content_products")
            .delete()
            .eq("featured_content_id", id);

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
                .from("v2_featured_content_products")
                .insert(productsToInsert);

            if (productsError) throw productsError;
        }
    }

    return content;
}

export async function deleteFeaturedContent(id: string) {
    const { error } = await supabase.from("v2_featured_contents").delete().eq("id", id);

    if (error) throw error;
}
