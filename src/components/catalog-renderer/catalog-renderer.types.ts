// =========================================
// Catalog Renderer — Shared Public Types
// =========================================

export type PublicOptionValue = {
    id: string;
    name: string;
    absolute_price: number | null;
    price_modifier: number | null;
};

export type PublicOptionGroup = {
    id: string;
    name: string;
    group_kind: "PRIMARY_PRICE" | "ADDON";
    pricing_mode: "ABSOLUTE" | "DELTA";
    is_required: boolean;
    max_selectable: number | null;
    values: PublicOptionValue[];
};

/**
 * Pricing shape per product in the public payload.
 * - effective_price: final price after override
 * - from_price: min absolute_price from PRIMARY_PRICE group (if any)
 */
export type PublicProductPricing = {
    base_price: number | null;
    effective_price: number | null;
    has_override: boolean;
    show_original_price: boolean;
    original_price: number | null;
    /** Set when the product has a PRIMARY_PRICE format group; use "da X€" display */
    from_price: number | null;
};

export type PublicProduct = {
    id: string;
    tenant_id: string;
    name: string;
    description: string | null;
    base_price: number | null;
    is_visible: boolean;
    parent_product_id: string | null;
    created_at: string;
    updated_at: string;
    options?: PublicOptionGroup[];
};

export type PublicCatalogCategoryProduct = {
    link: Record<string, unknown>;
    product: PublicProduct;
    pricing: PublicProductPricing;
};

export type PublicCatalogCategory = {
    category: {
        id: string;
        catalog_id: string;
        name: string;
        description: string | null;
        sort_order: number | null;
        parent_category_id: string | null;
    };
    products: PublicCatalogCategoryProduct[];
};

export type PublicCatalogPayload = {
    ok: boolean;
    error?: string;
    catalog: Record<string, unknown>;
    active_schedule: Record<string, unknown> | null;
    active_layout: Record<string, unknown> | null;
    style: Record<string, unknown> | null;
    featured_contents: unknown[];
    categories: PublicCatalogCategory[];
};
