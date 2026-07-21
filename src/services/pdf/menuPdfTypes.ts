// Tipi del data layer PDF menu (Stage 1b).
// Disaccoppiati da ResolvedCollections: il documento react-pdf consuma solo
// stringhe già pronte (priceLabel via formatPriceSummary), nessuna logica di
// prezzo/visibilità nel layer di rendering.
//
// Forward-compat v1: `isDisabled` è sempre false e `originalPriceLabel` sempre
// null (decisione di prodotto: niente stato "non disponibile" né prezzi
// barrati nel PDF v1) ma restano nel tipo per gli stage successivi.

import type { StyleTokenModel } from "@/pages/Dashboard/Styles/Editor/StyleTokenModel";
import type { ResolvedMediaFraming } from "@/services/supabase/resolveActivityCatalogs";

export type MenuPdfAllergen = {
    code: string;
    label: string;
};

export type MenuPdfCharacteristic = {
    code: string;
    label: string;
    icon: string;
};

/** Formato prezzo multiplo (gruppo PRIMARY_PRICE con più valori prezzati). */
export type MenuPdfFormat = {
    name: string;
    priceLabel: string;
};

/** Gruppo ADDON pre-formattato ("Extra: Nome € 2.00, ..."). */
export type MenuPdfAddonGroup = {
    label: string;
    values: string[];
};

export type MenuPdfVariant = {
    id: string;
    name: string;
    description: string | null;
    priceLabel: string | null;
    originalPriceLabel: string | null;
    formats: MenuPdfFormat[];
    allergens: MenuPdfAllergen[];
    characteristics: MenuPdfCharacteristic[];
    imageUrl: string | null;
    imageFraming: ResolvedMediaFraming | null;
    imageAspectRatio: number | null;
};

export type MenuPdfProduct = {
    id: string;
    name: string;
    description: string | null;
    priceLabel: string | null;
    originalPriceLabel: string | null;
    formats: MenuPdfFormat[];
    addons: MenuPdfAddonGroup[];
    allergens: MenuPdfAllergen[];
    characteristics: MenuPdfCharacteristic[];
    imageUrl: string | null;
    imageFraming: ResolvedMediaFraming | null;
    imageAspectRatio: number | null;
    isDisabled: boolean;
    variants: MenuPdfVariant[];
};

export type MenuPdfCategory = {
    id: string;
    name: string;
    level: number;
    parentCategoryId: string | null;
    products: MenuPdfProduct[];
};

export type MenuPdfBrand = {
    /** Token stile già parsati (parseTokens) — mai null, fallback DEFAULT_STYLE_TOKENS. */
    tokens: StyleTokenModel;
    styleName: string | null;
    logoUrl: string | null;
    coverUrl: string | null;
};

export type MenuPdfMeta = {
    activityName: string;
    catalogName: string;
    /** Indirizzo già composto ("Via X, 12 — 20100 Milano") o null. */
    address: string | null;
    /** ISO timestamp di generazione (footer "aggiornato al"). */
    generatedAt: string;
};

export type MenuPdfData = {
    meta: MenuPdfMeta;
    brand: MenuPdfBrand;
    categories: MenuPdfCategory[];
    /** Solo gli allergeni effettivamente usati dai prodotti presenti, ordinati per code. */
    allergenLegend: MenuPdfAllergen[];
};
