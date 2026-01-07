import type { CatalogType, ServiceSubtype, ItemBase } from "@/types/catalog";
import type { FieldDef } from "./fields";

export type CatalogSubtype = ServiceSubtype | "none";

export type CatalogConfig = {
    type: CatalogType;
    label: string;

    // suggerimenti/UX (non vincoli)
    suggestedForBusinessTypes?: string[];

    // schema form
    fields: FieldDef[];

    // subtypes (solo per alcuni catalog types, es: services)
    subtypes?: {
        default: CatalogSubtype;
        options: { value: CatalogSubtype; label: string }[];
        extraFieldsBySubtype: Partial<Record<CatalogSubtype, FieldDef[]>>;
    };

    // rendering
    render: {
        card: (item: ItemBase) => "menu" | "product" | "service" | "event" | "offer" | "generic";
        // opzionale dopo: detail renderer
    };
};
