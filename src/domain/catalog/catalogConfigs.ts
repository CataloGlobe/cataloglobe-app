import type { CatalogConfig } from "./config";

export const catalogConfigs: Record<string, CatalogConfig> = {
    menu: {
        type: "menu",
        label: "Menu (cibo e bevande)",
        fields: [
            { key: "name", label: "Nome", type: "text", required: true, storage: "base" },
            { key: "description", label: "Descrizione", type: "textarea", storage: "base" },
            { key: "base_price", label: "Prezzo", type: "number", storage: "base" },

            // metadata base menu
            { key: "ingredients", label: "Ingredienti", type: "chips", storage: "metadata" },
            { key: "allergens", label: "Allergeni", type: "chips", storage: "metadata" },
            {
                key: "diet",
                label: "Diete",
                type: "multiselect",
                storage: "metadata",
                options: [
                    { value: "vegetarian", label: "Vegetariano" },
                    { value: "vegan", label: "Vegano" },
                    { value: "gluten_free", label: "Senza glutine" },
                    { value: "lactose_free", label: "Senza lattosio" }
                ]
            },
            {
                key: "spicy",
                label: "Piccante",
                type: "select",
                storage: "metadata",
                options: [
                    { value: "0", label: "No" },
                    { value: "1", label: "Leggero" },
                    { value: "2", label: "Medio" },
                    { value: "3", label: "Forte" }
                ]
            }
        ],
        render: {
            card: () => "menu"
        }
    },

    products: {
        type: "products",
        label: "Prodotti",
        fields: [
            { key: "name", label: "Nome", type: "text", required: true, storage: "base" },
            { key: "description", label: "Descrizione", type: "textarea", storage: "base" },
            { key: "base_price", label: "Prezzo", type: "number", storage: "base" },

            { key: "sku", label: "SKU / Codice", type: "text", storage: "metadata" },
            { key: "material", label: "Materiale", type: "text", storage: "metadata" },
            {
                key: "variants",
                label: "Varianti (testo libero per ora)",
                type: "textarea",
                storage: "metadata"
            },
            { key: "in_stock", label: "Disponibile", type: "switch", storage: "metadata" }
        ],
        render: { card: () => "product" }
    },

    services: {
        type: "services",
        label: "Servizi",
        fields: [
            { key: "name", label: "Nome", type: "text", required: true, storage: "base" },
            { key: "description", label: "Descrizione", type: "textarea", storage: "base" },
            { key: "base_price", label: "Prezzo", type: "number", storage: "base" },
            { key: "duration", label: "Durata (minuti)", type: "number", storage: "base" },

            // campo comune in metadata
            { key: "notes", label: "Note", type: "textarea", storage: "metadata" }
        ],
        subtypes: {
            default: "generic",
            options: [
                { value: "generic", label: "Generico" },
                { value: "hairdresser", label: "Parrucchiere" },
                { value: "beauty", label: "Centro estetico" }
            ],
            extraFieldsBySubtype: {
                hairdresser: [
                    {
                        key: "target",
                        label: "Target",
                        type: "select",
                        storage: "metadata",
                        options: [
                            { value: "male", label: "Uomo" },
                            { value: "female", label: "Donna" },
                            { value: "unisex", label: "Unisex" }
                        ]
                    },
                    {
                        key: "level",
                        label: "Livello",
                        type: "select",
                        storage: "metadata",
                        options: [
                            { value: "junior", label: "Junior" },
                            { value: "senior", label: "Senior" },
                            { value: "master", label: "Master" }
                        ]
                    }
                ],
                beauty: [
                    {
                        key: "treatment_area",
                        label: "Area trattata",
                        type: "text",
                        storage: "metadata"
                    },
                    {
                        key: "contraindications",
                        label: "Controindicazioni",
                        type: "textarea",
                        storage: "metadata"
                    }
                ]
            }
        },
        render: {
            card: item => {
                const subtype = (item.metadata?.subtype as string | undefined) ?? "generic";
                if (subtype === "hairdresser") return "service";
                if (subtype === "beauty") return "service";
                return "service";
            }
        }
    },

    events: {
        type: "events",
        label: "Eventi",
        fields: [
            { key: "name", label: "Titolo evento", type: "text", required: true, storage: "base" },
            { key: "description", label: "Descrizione", type: "textarea", storage: "base" },
            { key: "base_price", label: "Prezzo (opz.)", type: "number", storage: "base" },

            {
                key: "start_at",
                label: "Inizio",
                type: "datetime",
                required: true,
                storage: "metadata"
            },
            { key: "end_at", label: "Fine", type: "datetime", storage: "metadata" },
            { key: "location", label: "Luogo", type: "text", storage: "metadata" }
        ],
        render: { card: () => "event" }
    },

    offers: {
        type: "offers",
        label: "Offerte / Promo",
        fields: [
            { key: "name", label: "Titolo offerta", type: "text", required: true, storage: "base" },
            { key: "description", label: "Descrizione", type: "textarea", storage: "base" },
            { key: "base_price", label: "Prezzo (opz.)", type: "number", storage: "base" },

            { key: "valid_from", label: "Valida dal", type: "datetime", storage: "metadata" },
            { key: "valid_to", label: "Valida fino al", type: "datetime", storage: "metadata" },
            { key: "conditions", label: "Condizioni", type: "textarea", storage: "metadata" }
        ],
        render: { card: () => "offer" }
    },

    generic: {
        type: "generic",
        label: "Generico",
        fields: [
            { key: "name", label: "Titolo", type: "text", required: true, storage: "base" },
            { key: "description", label: "Descrizione", type: "textarea", storage: "base" },
            { key: "base_price", label: "Prezzo (opz.)", type: "number", storage: "base" },
            { key: "duration", label: "Durata (opz.)", type: "number", storage: "base" },
            { key: "details", label: "Dettagli", type: "textarea", storage: "metadata" }
        ],
        render: { card: () => "generic" }
    }
};
