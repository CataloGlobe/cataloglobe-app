// TODO(phase10): Uses legacy BusinessType enum (restaurant, bar, hotel, hairdresser, beauty, shop, other).
// Does not align with v2_tenants.vertical_type values (restaurant, bar, retail, hotel, generic).
// Update this mapping to consume selectedTenant.vertical_type from useTenant() when the V2 catalog pipeline is wired.
import type { CatalogType } from "@/types/catalog";

export type BusinessType =
    | "restaurant"
    | "bar"
    | "hotel"
    | "hairdresser"
    | "beauty"
    | "shop"
    | "other";

export function businessTypeToCatalogType(
    businessType: BusinessType | null | undefined
): CatalogType {
    switch (businessType) {
        case "restaurant":
        case "bar":
        case "hotel":
            return "menu";

        case "hairdresser":
        case "beauty":
            return "services";

        case "shop":
            return "products";

        default:
            return "menu"; // fallback sensato
    }
}
