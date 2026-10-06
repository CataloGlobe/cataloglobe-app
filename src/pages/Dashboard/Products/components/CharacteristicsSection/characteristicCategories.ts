import type { ProductCharacteristicCategory } from "@/types/productCharacteristic";

/**
 * Fixed display order for the 6 categories. Diet first as it carries the
 * primary dietary claims; spicy follows because mutex semantics differ;
 * origin/preparation/warning are descriptive metadata; status closes the
 * list as the most operational layer (chef pick, new, out_of_stock).
 */
export const CATEGORY_ORDER: ProductCharacteristicCategory[] = [
    "diet",
    "spicy",
    "origin",
    "preparation",
    "warning",
    "status"
];

export const CATEGORY_LABELS: Record<ProductCharacteristicCategory, string> = {
    diet: "Dieta",
    spicy: "Piccantezza",
    origin: "Origine e qualità",
    preparation: "Preparazione",
    warning: "Avvertenze",
    status: "Stato"
};
