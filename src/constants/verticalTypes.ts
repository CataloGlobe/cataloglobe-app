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
    hasAllergens: boolean;
    hasIngredients: boolean;
    scheduleHints: string[];
}

const RETAIL_CONFIG: VerticalConfig = {
    label: "Negozio",
    catalogLabel: "Catalogo",
    categoryLabel: "Categoria",
    productLabel: "Prodotto",
    productLabelPlural: "Prodotti",
    hasAllergens: false,
    hasIngredients: false,
    scheduleHints: ["Stagionale", "Saldi", "Promozione"]
};

export const VERTICAL_CONFIG: Record<VerticalType, VerticalConfig> = {
    food_beverage: {
        label: "Food & Beverage",
        catalogLabel: "Menù",
        categoryLabel: "Portata",
        productLabel: "Prodotto",
        productLabelPlural: "Prodotti",
        hasAllergens: true,
        hasIngredients: true,
        scheduleHints: ["Pranzo", "Cena", "Brunch", "Aperitivo"]
    },
    // Legacy verticals — kept for compatibility with existing tenants
    restaurant: {
        label: "Ristorante",
        catalogLabel: "Menù",
        categoryLabel: "Portata",
        productLabel: "Prodotto",
        productLabelPlural: "Prodotti",
        hasAllergens: true,
        hasIngredients: true,
        scheduleHints: ["Pranzo", "Cena", "Brunch", "Aperitivo"]
    },
    bar: {
        label: "Bar",
        catalogLabel: "Menù",
        categoryLabel: "Sezione",
        productLabel: "Prodotto",
        productLabelPlural: "Prodotti",
        hasAllergens: true,
        hasIngredients: true,
        scheduleHints: ["Aperitivo", "Happy hour", "Dopocena"]
    },
    retail: RETAIL_CONFIG,
    hotel: { ...RETAIL_CONFIG, label: "Hotel" },
    generic: { ...RETAIL_CONFIG, label: "Generico" }
};
