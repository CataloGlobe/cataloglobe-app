export const CATALOG_TYPES = [
    "menu",
    "products",
    "services",
    "events",
    "offers",
    "generic"
] as const;
export type CatalogType = (typeof CATALOG_TYPES)[number];

export type ServiceSubtype = "generic" | "hairdresser" | "beauty";

export type ItemBase = {
    id: string;
    type: CatalogType;
    name: string;
    description: string | null;
    base_price: string | number | null;
    duration: number | null;
    metadata: Record<string, unknown> | null;
    created_at: string;
    updated_at: string;
};

export type CollectionBase = {
    id: string;
    name: string;
    description: string | null;
    collection_type: CatalogType;
    style: Record<string, unknown> | null;
};
