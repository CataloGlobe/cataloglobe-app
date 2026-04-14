import type { Business } from "@/types/database";
import type {
    ResolvedCollections,
    ResolvedCategory,
    ResolvedProduct
} from "@/types/resolvedCollections";

type MockPublicCollection = {
    business: Pick<Business, "name" | "cover_image">;
    resolved: Omit<ResolvedCollections, "style">;
};

// ─── Antipasti ───────────────────────────────────────────────────────────────

const antipasti: ResolvedCategory = {
    id: "mock-cat-1",
    name: "Antipasti",
    level: 1,
    sort_order: 1,
    parent_category_id: null,
    products: [
        {
            // Caso: immagine + prezzo
            id: "mock-p-1",
            name: "Bruschetta Tricolore",
            description:
                "Tre varianti di bruschetta: pomodoro e basilico, ricotta e olive, pesto di rucola.",
            price: 7.5,
            is_visible: true,
            parentSelected: true,
            image_url: "https://placehold.co/80x80/fef3c7/92400e?text=B"
        },
        {
            // Caso: senza immagine + prezzo scontato + allergene
            id: "mock-p-2",
            name: "Carpaccio di Manzo",
            description:
                "Sottili fette di manzo crudo con rucola, scaglie di grana padano e limone.",
            price: 11.0,
            original_price: 14.0,
            is_visible: true,
            parentSelected: true,
            image_url: undefined,
            allergens: [{ id: 7, code: "milk", label_it: "Latte", label_en: "Milk" }]
        },
        {
            // Caso: immagine + descrizione lunga + attributo flag
            id: "mock-p-3",
            name: "Polpette al Sugo della Nonna",
            description:
                "Polpette di manzo e maiale cotte lentamente nel sugo di pomodoro con basilico fresco e un tocco di peperoncino. Servite con fette di pane casereccio tostato.",
            price: 9.0,
            is_visible: true,
            parentSelected: true,
            image_url: "https://placehold.co/80x80/fde68a/92400e?text=P",
            attributes: [{ definition: { label: "Piccante" }, value_boolean: true }]
        }
    ] satisfies ResolvedProduct[]
};

// ─── Pizze ────────────────────────────────────────────────────────────────────

const pizze: ResolvedCategory = {
    id: "mock-cat-2",
    name: "Pizze",
    level: 1,
    sort_order: 2,
    parent_category_id: null,
    products: [
        {
            // Caso: immagine + attributo testo
            id: "mock-p-4",
            name: "Margherita",
            description: "Pomodoro San Marzano, mozzarella fior di latte e basilico fresco.",
            price: 10.0,
            is_visible: true,
            parentSelected: true,
            image_url: "https://placehold.co/80x80/fee2e2/991b1b?text=M",
            attributes: [{ definition: { label: "Disponibile" }, value_text: "Vegano su richiesta" }]
        },
        {
            // Caso: disabilitato + attributo flag + immagine
            id: "mock-p-5",
            name: "Diavola",
            description: "Pomodoro, mozzarella e salame piccante calabrese.",
            price: 12.0,
            is_visible: true,
            is_disabled: true,
            parentSelected: true,
            image_url: "https://placehold.co/80x80/fecaca/7f1d1d?text=D",
            attributes: [{ definition: { label: "Piccante" }, value_boolean: true }]
        },
        {
            // Caso: senza immagine + più allergeni
            id: "mock-p-6",
            name: "Quattro Stagioni",
            description:
                "Pomodoro, mozzarella, prosciutto cotto, funghi trifolati, carciofi e olive taggiasche.",
            price: 13.0,
            is_visible: true,
            parentSelected: true,
            image_url: undefined,
            allergens: [
                { id: 1, code: "gluten", label_it: "Cereali", label_en: "Gluten" },
                { id: 7, code: "milk", label_it: "Latte", label_en: "Milk" },
                { id: 3, code: "eggs", label_it: "Uova", label_en: "Eggs" }
            ]
        },
        {
            // Caso: from_price + varianti (taglia)
            id: "mock-p-7",
            name: "Bianca ai Funghi Porcini",
            description:
                "Senza pomodoro, mozzarella, funghi porcini freschi e scaglie di tartufo nero.",
            is_visible: true,
            parentSelected: true,
            image_url: "https://placehold.co/80x80/d1fae5/065f46?text=BF",
            from_price: 10.0,
            variants: [
                { id: "mock-v-1", name: "Media (30 cm)", price: 10.0 },
                { id: "mock-v-2", name: "Grande (40 cm)", price: 13.5 }
            ]
        }
    ] satisfies ResolvedProduct[]
};

// ─── Dolci ────────────────────────────────────────────────────────────────────

const dolci: ResolvedCategory = {
    id: "mock-cat-3",
    name: "Dolci",
    level: 1,
    sort_order: 3,
    parent_category_id: null,
    products: [
        {
            // Caso: immagine + prezzo + allergeni
            id: "mock-p-8",
            name: "Tiramisù della Casa",
            description:
                "Savoiardi imbevuti di caffè espresso, crema di mascarpone e cacao amaro. Ricetta originale tramandata.",
            price: 7.0,
            is_visible: true,
            parentSelected: true,
            image_url: "https://placehold.co/80x80/e0e7ff/3730a3?text=Ti",
            allergens: [
                { id: 3, code: "eggs", label_it: "Uova", label_en: "Eggs" },
                { id: 7, code: "milk", label_it: "Latte", label_en: "Milk" },
                { id: 1, code: "gluten", label_it: "Cereali", label_en: "Gluten" }
            ]
        },
        {
            // Caso: senza immagine + descrizione lunga + attributo testo
            id: "mock-p-9",
            name: "Panna Cotta ai Frutti di Bosco",
            description:
                "Cremosa panna cotta con coulis di lamponi, mirtilli e ribes freschi di stagione, decorata con foglioline di menta e zucchero a velo.",
            price: 6.5,
            is_visible: true,
            parentSelected: true,
            image_url: undefined,
            attributes: [{ definition: { label: "Dieta" }, value_text: "Senza Glutine" }]
        },
        {
            // Caso: immagine + effective_price (sconto applicato)
            id: "mock-p-10",
            name: "Cannolo Siciliano",
            description:
                "Cialda fritta croccante con ricotta di pecora, gocce di cioccolato fondente e scorza di arancia candita.",
            effective_price: 5.5,
            original_price: 7.0,
            is_visible: true,
            parentSelected: true,
            image_url: "https://placehold.co/80x80/fce7f3/9d174d?text=C"
        }
    ] satisfies ResolvedProduct[]
};

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * Returns realistic mock data compatible with PublicCollectionRenderer props.
 *
 * Covered cases:
 *  - product with image / without image
 *  - long description
 *  - discounted price (original_price)
 *  - effective_price (applied discount)
 *  - from_price with size variants
 *  - text attribute (e.g. "Vegano su richiesta", "Senza Glutine")
 *  - boolean attribute flag (e.g. "Piccante")
 *  - allergens (label_it)
 *  - disabled product (sold out)
 *
 * Style is intentionally excluded — callers merge their own ResolvedStyle.
 */
export function createMockPublicCollection(): MockPublicCollection {
    return {
        business: {
            name: "Ristorante Officina del Gusto",
            cover_image: "https://placehold.co/960x200/1e293b/f1f5f9?text=Officina+del+Gusto"
        },
        resolved: {
            catalog: {
                id: "mock-catalog",
                name: "Menu",
                categories: [antipasti, pizze, dolci]
            }
        }
    };
}
