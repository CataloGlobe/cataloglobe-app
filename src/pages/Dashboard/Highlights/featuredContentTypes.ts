import type {
    FeaturedContent,
    FeaturedContentPricingMode,
    FeaturedContentType
} from "@/services/supabase/featuredContents";

/** Il nome del tipo di un contenuto in evidenza (§28.4: «Tipo», non «Modalità prezzo»). */
export const CONTENT_TYPE_LABEL: Record<FeaturedContentType, string> = {
    announcement: "Annuncio",
    event: "Evento",
    promo: "Promo",
    bundle: "Bundle"
};

export const CONTENT_TYPE_ORDER: FeaturedContentType[] = ["announcement", "event", "promo", "bundle"];

/** La modalità di prezzo non si sceglie: si deriva dal tipo (§28.4, tabella). */
export const PRICING_OF_TYPE: Record<FeaturedContentType, FeaturedContentPricingMode> = {
    announcement: "none",
    event: "none",
    promo: "per_item",
    bundle: "bundle"
};

/** «Prezzi: …» sotto il tipo, a parole. */
export const PRICING_LABEL: Record<FeaturedContentPricingMode, string> = {
    none: "nessun prezzo",
    per_item: "per prodotto",
    bundle: "prezzo unico del bundle"
};

export function typeHasProducts(type: FeaturedContentType): boolean {
    return PRICING_OF_TYPE[type] !== "none";
}

export type TypeChoice = {
    type: FeaturedContentType;
    /** Testo del campo prezzo (virgola o punto), vuoto se non c'è. */
    bundlePrice: string;
    showOriginalTotal: boolean;
    showImages: boolean;
};

export type DerivedTypeFields = Pick<
    FeaturedContent,
    "content_type" | "pricing_mode" | "bundle_price" | "show_original_total" | "layout_style"
>;

/** «18», «18,5», «18.50» → 18.5; altro → null. */
export function parsePrice(text: string): number | null {
    const normalized = text.trim().replace(",", ".");
    if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
    const value = Number(normalized);
    return Number.isFinite(value) ? value : null;
}

/**
 * I campi che il tipo decide, com'erano derivati da `FeaturedPricingModeForm`:
 * il prezzo del bundle e il totale originale solo per Bundle, le immagini dei
 * prodotti solo per Promo e Bundle.
 */
export function deriveTypeFields(choice: TypeChoice): DerivedTypeFields {
    const isBundle = choice.type === "bundle";
    return {
        content_type: choice.type,
        pricing_mode: PRICING_OF_TYPE[choice.type],
        bundle_price: isBundle ? parsePrice(choice.bundlePrice) : null,
        show_original_total: isBundle ? choice.showOriginalTotal : false,
        layout_style: typeHasProducts(choice.type) && choice.showImages ? "with_images" : null
    };
}

/** Il motivo per cui il tipo non si può salvare, o null. */
export function typeChoiceError(choice: TypeChoice): string | null {
    if (choice.type !== "bundle") return null;
    const price = parsePrice(choice.bundlePrice);
    if (price == null || price <= 0) return "Inserisci il prezzo del bundle.";
    return null;
}
