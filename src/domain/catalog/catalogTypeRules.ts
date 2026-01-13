import type { BusinessType } from "@/types/database";
import type { CatalogType } from "@/types/catalog";

export const BUSINESS_TO_CATALOG_TYPES: Record<BusinessType, CatalogType[]> = {
    restaurant: ["menu", "products", "events", "offers"],
    bar: ["menu", "events", "offers"],
    hairdresser: ["services", "products", "offers"],
    beauty: ["services", "products", "offers"],
    shop: ["products", "offers"],
    hotel: ["services", "events", "offers"],
    other: ["generic"]
};

export function getAllowedCatalogTypesForBusinesses(businessTypes: BusinessType[]): CatalogType[] {
    const set = new Set<CatalogType>();

    for (const type of businessTypes) {
        (BUSINESS_TO_CATALOG_TYPES[type] ?? ["generic"]).forEach(t => set.add(t));
    }

    // fallback sempre disponibile
    set.add("generic");

    return Array.from(set);
}
