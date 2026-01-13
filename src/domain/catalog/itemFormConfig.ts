import type { CatalogType } from "@/types/catalog";

export type ItemFormField = "name" | "category" | "description" | "price" | "duration";

export type ItemFormConfig = {
    fields: ItemFormField[];
    required: ItemFormField[];
};

export const ITEM_FORM_CONFIG: Record<CatalogType, ItemFormConfig> = {
    menu: {
        fields: ["name", "category", "description", "price"],
        required: ["name", "category", "price"]
    },
    services: {
        fields: ["name", "category", "description", "price", "duration"],
        required: ["name", "category", "price", "duration"]
    },
    products: {
        fields: ["name", "category", "description", "price"],
        required: ["name", "category", "price"]
    },
    events: {
        fields: ["name", "category", "description"],
        required: ["name", "category"]
    },
    offers: {
        fields: ["name", "description"],
        required: ["name"]
    },
    generic: {
        fields: ["name", "description"],
        required: ["name"]
    }
};
