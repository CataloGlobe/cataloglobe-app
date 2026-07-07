export type ResolvedVariantDimValue = {
    value_id: string;
    value_label: string;
    value_sort_order: number;
    dimension_id: string;
    dimension_name: string;
    dimension_sort_order: number;
};

export type ResolvedAllergen = {
    id: number;
    code: string;
    label: string;
    label_it?: string;
    label_en?: string;
};

/**
 * Shape of a single product characteristic as emitted by
 * `resolve-public-catalog`. Mirror of the lookup row in
 * `product_characteristics` (minus `vertical`, redundant in public payload
 * since each product implicitly belongs to a tenant of a single vertical).
 *
 * Source of truth: `mapCharacteristics` in
 * `supabase/functions/_shared/resolveActivityCatalogs.ts`.
 *
 * Distinct from `ResolvedProductCharacteristic` (in `productCharacteristic.ts`)
 * which is the FE service-side flat shape returned by `getProductsCharacteristics`.
 */
export type ResolvedCharacteristic = {
    id: string;
    code: string;
    category: "diet" | "spicy" | "origin" | "preparation" | "warning" | "status";
    label: string;
    label_it?: string;
    label_en?: string;
    icon: string;
    sort_order: number;
    mutex_group: string | null;
    dietary_claim: boolean;
};

export type ResolvedIngredient = {
    id: string;
    name: string;
};

/**
 * Structured product note as emitted by `resolve-public-catalog`. Mirror of
 * `ProductNote` from `@/services/supabase/products`. The shape is duplicated
 * here to keep the public type tree free of service imports; the canonical
 * shape contract lives in products.ts.
 */
export type ResolvedProductNote = {
    label: string;
    value: string;
};

/**
 * Shape of a single attribute as emitted by `resolve-public-catalog`.
 *
 * Source of truth: `mapAttributes` in `supabase/functions/_shared/resolveActivityCatalogs.ts`.
 * The same shape is attached to both products and variants. Definition is null
 * when the join produced no row; value_* are mutually exclusive based on type.
 *
 * The public renderer flattens this to `{ label, value }` in
 * `mapProductToItem` (see `src/pages/PublicCollectionPage/PublicCollectionPage.tsx`)
 * before it reaches `CollectionView` / `ItemDetail`. Components downstream of
 * the mapper consume the flat shape, not this one.
 */
export type ResolvedProductAttribute = {
    attribute_definition_id?: string;
    value_text?: string | null;
    value_number?: number | null;
    value_boolean?: boolean | null;
    value_json?: unknown;
    definition?: {
        code?: string;
        label?: string | null;
        type?: string;
        show_in_public_channels?: boolean | null;
    } | null;
};

export type ResolvedOptionValue = {
    id: string;
    name: string;
    absolute_price: number | null;
    price_modifier: number | null;
    /** Set when a value-level price override is active and show_original_price = true. */
    original_price?: number;
};

export type ResolvedOptionGroup = {
    id: string;
    name: string;
    group_kind: "PRIMARY_PRICE" | "ADDON";
    pricing_mode: "ABSOLUTE" | "DELTA";
    is_required: boolean;
    max_selectable: number | null;
    values: ResolvedOptionValue[];
};

export type ResolvedVariant = {
    id: string;
    name: string;
    price?: number;
    /** Set when a price override is active and show_original_price = true. */
    original_price?: number;
    /** Min absolute_price across PRIMARY_PRICE formats. Set when variant has formats instead of a single base_price. */
    from_price?: number;
    optionGroups?: ResolvedOptionGroup[];
    image_url?: string;
    description?: string;
    attributes?: ResolvedProductAttribute[];
    allergens?: ResolvedAllergen[];
    characteristics?: ResolvedCharacteristic[];
    ingredients?: ResolvedIngredient[];
    notes?: ResolvedProductNote[];
    dimension_values?: ResolvedVariantDimValue[];
};

export type ResolvedProduct = {
    id: string;
    name: string;
    description?: string;
    price?: number;
    effective_price?: number;
    original_price?: number;
    /** Min absolute_price across PRIMARY_PRICE formats. Set when product has formats. */
    from_price?: number;
    is_visible: boolean;
    is_disabled?: boolean;
    attributes?: ResolvedProductAttribute[];
    allergens?: ResolvedAllergen[];
    characteristics?: ResolvedCharacteristic[];
    ingredients?: ResolvedIngredient[];
    notes?: ResolvedProductNote[];
    image_url?: string;
    variants?: ResolvedVariant[];
    optionGroups?: ResolvedOptionGroup[];
    /** "simple" | "formats" | "configurable" */
    product_type?: string;
    /** ID of the pre-selected default variant for configurable products. */
    default_variant_id?: string;
    parentSelected: boolean;
    /** Raw DB base_price — used to detect if parent has its own independent price. */
    base_price?: number | null;
    /** Riferimenti leggeri agli abbinamenti (stesso catalogo). Nome/prezzo/
     *  immagine dell'abbinato NON viaggiano qui: li risolve il frontend con
     *  lookup by-id nel catalogo risolto. */
    pairings?: { paired_product_id: string; note: string | null; sort_order: number }[];
};

export type ResolvedCategory = {
    id: string;
    name: string;
    level: number;
    sort_order: number;
    parent_category_id: string | null;
    products: ResolvedProduct[];
};

export type ResolvedCatalog = {
    id: string;
    name: string;
    categories?: ResolvedCategory[];
};

export type ResolvedStyle = {
    id: string;
    name: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    config?: any;
};

export type V2FeaturedContent = {
    id: string;
    internal_name: string;
    title: string;
    subtitle: string | null;
    description: string | null;
    media_id: string | null;
    media_focal_x: number;
    media_focal_y: number;
    media_zoom: number;
    media_fill_mode: "blur" | "dominant" | "color" | "none";
    media_fill_color: string | null;
    media_aspect_ratio: number | null;
    cta_text: string | null;
    cta_url: string | null;
    status: "draft" | "published";
    layout_style: string | null;
    pricing_mode: "none" | "per_item" | "bundle";
    content_type: "announcement" | "event" | "promo" | "bundle";
    bundle_price: number | null;
    show_original_total: boolean;
    products?: Array<{
        sort_order: number | null;
        note: string | null;
        product: {
            id: string;
            name: string;
            description: string | null;
            base_price: number | null;
            image_url: string | null;
            fromPrice: number | null;
            is_from_price: boolean;
            price_variants: Array<{ name: string | null; absolute_price: number | null }>;
        } | null;
    }>;
    created_at: string;
    updated_at: string;
};

export type ResolvedCollections = {
    style?: ResolvedStyle;
    featured?: {
        before_catalog?: V2FeaturedContent[];
        after_catalog?: V2FeaturedContent[];
    };
    catalog?: ResolvedCatalog;
};
