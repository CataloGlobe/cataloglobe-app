// ---------------------------------------------------------------------------
// Vertical Types — source of truth
// ---------------------------------------------------------------------------

/** All vertical_type values accepted by the DB (includes legacy). */
export const VERTICAL_TYPES = [
    "food_beverage",
    "restaurant",
    "bar",
    "retail",
    "hotel",
    "generic"
] as const;

export type VerticalType = (typeof VERTICAL_TYPES)[number];

/** Macro verticals actively offered to new/existing tenants. */
export const ACTIVE_MACROS: VerticalType[] = ["food_beverage"];

// TODO: legacy verticals (restaurant, bar) inherit food_beverage
// config but DB CHECK on tenants.vertical_type still accepts them.
// product_characteristics.vertical CHECK only accepts 4 canonical
// values (food_beverage, retail, hotel, generic). If a tenant is
// ever created with vertical_type='restaurant' via direct DB write,
// listCharacteristics() will return empty. Mitigation: add
// canonicalVerticalType() mapper or tighten DB CHECKs in a dedicated
// cleanup phase.
/** Verticals kept for DB compatibility but hidden from selection UI. */
export const LEGACY_VERTICALS: VerticalType[] = ["restaurant", "bar", "retail", "hotel", "generic"];

export const DEFAULT_VERTICAL: VerticalType = "food_beverage";

// ---------------------------------------------------------------------------
// Business Subtypes — second-level classification within a macro vertical
// ---------------------------------------------------------------------------

export const BUSINESS_SUBTYPES = ["restaurant", "bar", "pizzeria", "cafe"] as const;

export type BusinessSubtype = (typeof BUSINESS_SUBTYPES)[number];

export const DEFAULT_SUBTYPE: BusinessSubtype = "restaurant";

export const SUBTYPE_OPTIONS: { value: BusinessSubtype; label: string }[] = [
    { value: "restaurant", label: "Ristorante" },
    { value: "bar", label: "Bar" },
    { value: "pizzeria", label: "Pizzeria" },
    { value: "cafe", label: "Caffetteria" }
];

export const SUBTYPE_LABELS: Record<BusinessSubtype, string> = {
    restaurant: "Ristorante",
    bar: "Bar",
    pizzeria: "Pizzeria",
    cafe: "Caffetteria"
};

// ---------------------------------------------------------------------------
// Dropdown options (macro vertical selection — currently single option)
// ---------------------------------------------------------------------------

export const VERTICAL_OPTIONS: { value: string; label: string; disabled?: boolean }[] = [
    { value: "food_beverage", label: "Food & Beverage" },
    { value: "coming_soon", label: "Altri settori — in arrivo", disabled: true }
];

// ---------------------------------------------------------------------------
// Labels (all values, needed to display existing tenants with legacy values)
// ---------------------------------------------------------------------------

export const VERTICAL_LABELS: Record<VerticalType, string> = {
    food_beverage: "Food & Beverage",
    restaurant: "Ristorante",
    bar: "Bar",
    retail: "Negozio",
    hotel: "Hotel",
    generic: "Generico"
};

// ---------------------------------------------------------------------------
// Vertical Config — per-macro-vertical UI & feature configuration
// ---------------------------------------------------------------------------

export interface VerticalConfig {
    label: string;
    catalogLabel: string;
    categoryLabel: string;
    productLabel: string;
    productLabelPlural: string;
    /**
     * Toggles which sections of the product detail/list UI are visible for
     * this vertical. Phase 4 will wire `characteristics` to the new
     * CharacteristicsTab; for now `characteristics: true` is infrastructure
     * only and renders nothing.
     */
    productSections: {
        allergens: boolean;
        ingredients: boolean;
        characteristics: boolean;
        customAttributes: boolean;
        notes: boolean;
    };
    /**
     * Vertical-dependent copy. Only the sections owned by Phase 3 scope are
     * here (allergens / ingredients / characteristics / customAttributes
     * labels + free-attribute placeholder/intro/empty descriptions).
     * Universal labels like "Generale", "Opzioni", "Utilizzo" remain
     * hardcoded in the consuming files.
     */
    copy: {
        productSections: {
            allergens: string;
            ingredients: string;
            characteristics: string;
            customAttributes: string;
        };
        productAttributes: {
            placeholderExamples: string;
            introDescription: string;
            perProductDescription: string;
            emptyDescription: string;
        };
    };
    scheduleHints: string[];
}

const FOOD_BEVERAGE_CONFIG: VerticalConfig = {
    label: "Food & Beverage",
    catalogLabel: "Menù",
    categoryLabel: "Portata",
    productLabel: "Prodotto",
    productLabelPlural: "Prodotti",
    productSections: {
        allergens: true,
        ingredients: true,
        characteristics: true,
        customAttributes: false,
        notes: true
    },
    copy: {
        productSections: {
            allergens: "Allergeni",
            ingredients: "Ingredienti",
            characteristics: "Caratteristiche e Note",
            customAttributes: "Attributi"
        },
        productAttributes: {
            // Placeholder is never rendered for food_beverage
            // (customAttributes flag is false). Empty string is intentional.
            placeholderExamples: "",
            introDescription:
                "Gli attributi descrivono caratteristiche dei prodotti. Non influenzano il prezzo.",
            perProductDescription:
                "Gli attributi descrivono il prodotto, ma non ne modificano il prezzo.",
            emptyDescription:
                "Crea attributi personalizzati per arricchire le informazioni dei prodotti."
        }
    },
    scheduleHints: ["Pranzo", "Cena", "Brunch", "Aperitivo"]
};

export const VERTICAL_CONFIG: Record<VerticalType, VerticalConfig> = {
    food_beverage: FOOD_BEVERAGE_CONFIG,
    // Legacy verticals — kept for compatibility with existing tenants who
    // never migrated to the canonical `food_beverage` value. Inherit fully
    // from the canonical config; only the visible label diverges.
    restaurant: {
        ...FOOD_BEVERAGE_CONFIG,
        label: "Ristorante"
    },
    bar: {
        ...FOOD_BEVERAGE_CONFIG,
        label: "Bar",
        categoryLabel: "Sezione",
        scheduleHints: ["Aperitivo", "Happy hour", "Dopocena"]
    },
    retail: {
        label: "Negozio",
        catalogLabel: "Catalogo",
        categoryLabel: "Categoria",
        productLabel: "Prodotto",
        productLabelPlural: "Prodotti",
        productSections: {
            allergens: false,
            ingredients: false,
            characteristics: true,
            customAttributes: true,
            notes: true
        },
        copy: {
            productSections: {
                allergens: "Allergeni",
                ingredients: "Ingredienti",
                characteristics: "Caratteristiche e Note",
                customAttributes: "Attributi"
            },
            productAttributes: {
                placeholderExamples: "es. Colore, Taglia, Materiale",
                introDescription:
                    "Gli attributi descrivono caratteristiche dei prodotti (es. colore, taglia). Non influenzano il prezzo.",
                perProductDescription:
                    "Gli attributi descrivono il prodotto, ma non ne modificano il prezzo.",
                emptyDescription:
                    "Crea attributi personalizzati per arricchire le informazioni dei prodotti."
            }
        },
        scheduleHints: ["Stagionale", "Saldi", "Promozione"]
    },
    hotel: {
        label: "Hotel",
        catalogLabel: "Catalogo",
        categoryLabel: "Categoria",
        productLabel: "Prodotto",
        productLabelPlural: "Prodotti",
        productSections: {
            allergens: false,
            ingredients: false,
            characteristics: true,
            customAttributes: true,
            notes: true
        },
        copy: {
            productSections: {
                allergens: "Allergeni",
                ingredients: "Ingredienti",
                characteristics: "Caratteristiche e Note",
                customAttributes: "Attributi"
            },
            productAttributes: {
                placeholderExamples: "es. Vista, Letto, Servizi",
                introDescription:
                    "Gli attributi descrivono caratteristiche dei servizi (es. vista, letto). Non influenzano il prezzo.",
                perProductDescription:
                    "Gli attributi descrivono il servizio, ma non ne modificano il prezzo.",
                emptyDescription:
                    "Crea attributi personalizzati per arricchire le informazioni dei servizi."
            }
        },
        scheduleHints: ["Stagionale", "Saldi", "Promozione"]
    },
    generic: {
        label: "Generico",
        catalogLabel: "Catalogo",
        categoryLabel: "Categoria",
        productLabel: "Prodotto",
        productLabelPlural: "Prodotti",
        productSections: {
            allergens: false,
            ingredients: false,
            characteristics: false,
            customAttributes: true,
            notes: true
        },
        copy: {
            productSections: {
                allergens: "Allergeni",
                ingredients: "Ingredienti",
                characteristics: "Caratteristiche e Note",
                customAttributes: "Attributi"
            },
            productAttributes: {
                placeholderExamples: "es. Codice, Variante, Categoria",
                introDescription:
                    "Gli attributi descrivono caratteristiche dei prodotti. Non influenzano il prezzo.",
                perProductDescription:
                    "Gli attributi descrivono il prodotto, ma non ne modificano il prezzo.",
                emptyDescription:
                    "Crea attributi personalizzati per arricchire le informazioni dei prodotti."
            }
        },
        scheduleHints: ["Stagionale", "Saldi", "Promozione"]
    }
};
