import type { VerticalType } from "@/constants/verticalTypes";
import type { CatalogType } from "@/types/catalog";

export const BUSINESS_TO_CATALOG_TYPES: Record<VerticalType, CatalogType[]> = {
    food_beverage: ["menu", "products", "events", "offers"],
    // Legacy verticals — kept for tenants not yet migrated
    restaurant: ["menu", "products", "events", "offers"],
    bar: ["menu", "events", "offers"],
    retail: ["products", "offers"],
    hotel: ["services", "events", "offers"],
    generic: ["generic"]
};

export function getAllowedCatalogTypesForBusiness(verticalType: VerticalType): CatalogType[] {
    return BUSINESS_TO_CATALOG_TYPES[verticalType] ?? ["generic"];
}

export function getAllowedCatalogTypesForBusinesses(verticalTypes: VerticalType[]): CatalogType[] {
    const set = new Set<CatalogType>();

    for (const type of verticalTypes) {
        (BUSINESS_TO_CATALOG_TYPES[type] ?? ["generic"]).forEach(t => set.add(t));
    }

    // fallback sempre disponibile
    set.add("generic");

    return Array.from(set);
}
