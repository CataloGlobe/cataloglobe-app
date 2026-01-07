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
