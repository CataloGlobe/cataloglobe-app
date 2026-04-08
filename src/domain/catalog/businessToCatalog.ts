import type { VerticalType } from "@/constants/verticalTypes";
import type { CatalogType } from "@/types/catalog";

export function businessTypeToCatalogType(
    verticalType: VerticalType | null | undefined
): CatalogType {
    switch (verticalType) {
        case "food_beverage":
        case "restaurant":
        case "bar":
        case "hotel":
            return "menu";

        case "retail":
            return "products";

        default:
            return "menu"; // fallback sensato
    }
}
