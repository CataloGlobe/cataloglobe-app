// Mapper puro ResolvedCatalog → MenuPdfData (Stage 1b). Nessun fetch, nessun JSX.
// Semantica di stampa v1 (decisioni di prodotto baked-in):
// - i prodotti `hide` sono già stati rimossi a monte da
//   applyActivityVisibilityOverridesToCatalog (nel loader);
// - i prodotti `disable` entrano come normali: `is_disabled` viene ignorato
//   e `isDisabled` emesso sempre false;
// - nessun prezzo barrato: `originalPriceLabel` sempre null.

import { formatPriceSummary } from "@/utils/formatPriceSummary";
import type { PriceSummary } from "@/utils/priceSummary";
import { euNumberForCode } from "./allergenEuNumbers";
import type {
    ResolvedAllergen,
    ResolvedCatalog,
    ResolvedCharacteristic,
    ResolvedOptionGroup,
    ResolvedProduct,
    ResolvedVariant
} from "@/services/supabase/resolveActivityCatalogs";
import type {
    MenuPdfAddonGroup,
    MenuPdfAllergen,
    MenuPdfAllergenCoverage,
    MenuPdfBrand,
    MenuPdfCategory,
    MenuPdfCharacteristic,
    MenuPdfClosingInfo,
    MenuPdfData,
    MenuPdfFormat,
    MenuPdfProduct,
    MenuPdfVariant
} from "./menuPdfTypes";

export type MapCatalogContext = {
    brand: MenuPdfBrand;
    activityName: string;
    slug: string;
    address: string | null;
    closingInfo: MenuPdfClosingInfo;
    /** ISO timestamp; iniettabile per test deterministici. Default: now. */
    generatedAt?: string;
};

function singleSummary(price: number): PriceSummary {
    return { kind: "single", min: price, max: price, count: 1 };
}

/** Ricostruisce i fatti prezzo dai campi già risolti dal resolver condiviso. */
function summaryFromResolved(item: {
    price?: number;
    from_price?: number;
    to_price?: number;
}): PriceSummary {
    if (typeof item.price === "number") return singleSummary(item.price);
    if (typeof item.from_price === "number") {
        const max = typeof item.to_price === "number" ? item.to_price : item.from_price;
        return { kind: "multi", min: item.from_price, max, count: 2 };
    }
    return { kind: "none", min: null, max: null, count: 0 };
}

/** Formati espliciti (nome + prezzo) solo quando il PRIMARY_PRICE ha ≥2 valori prezzati. */
function mapFormats(optionGroups: ResolvedOptionGroup[] | undefined): MenuPdfFormat[] {
    const primary = (optionGroups ?? []).find(
        g => g.group_kind === "PRIMARY_PRICE" && g.pricing_mode === "ABSOLUTE"
    );
    if (!primary) return [];

    const priced = primary.values.filter(v => typeof v.absolute_price === "number");
    if (priced.length < 2) return [];

    return priced.map(v => ({
        name: v.name,
        priceLabel: formatPriceSummary(singleSummary(v.absolute_price as number)) ?? ""
    }));
}

function formatAddonValue(
    group: ResolvedOptionGroup,
    value: ResolvedOptionGroup["values"][number]
): string | null {
    if (!value.name) return null;

    if (
        group.pricing_mode === "ABSOLUTE" &&
        typeof value.absolute_price === "number" &&
        value.absolute_price !== 0
    ) {
        return `${value.name} € ${value.absolute_price.toFixed(2)}`;
    }

    if (
        group.pricing_mode === "DELTA" &&
        typeof value.price_modifier === "number" &&
        value.price_modifier !== 0
    ) {
        const sign = value.price_modifier > 0 ? "+" : "-";
        return `${value.name} ${sign}€ ${Math.abs(value.price_modifier).toFixed(2)}`;
    }

    return value.name;
}

function mapAddons(optionGroups: ResolvedOptionGroup[] | undefined): MenuPdfAddonGroup[] {
    return (optionGroups ?? [])
        .filter(g => g.group_kind === "ADDON")
        .map(g => ({
            label: g.name,
            values: g.values
                .map(v => formatAddonValue(g, v))
                .filter((v): v is string => v !== null)
        }))
        .filter(g => g.values.length > 0);
}

function mapAllergens(allergens: ResolvedAllergen[] | undefined): MenuPdfAllergen[] {
    const mapped: MenuPdfAllergen[] = [];
    for (const a of allergens ?? []) {
        const euNumber = euNumberForCode(a.code);
        if (euNumber === null) {
            // Fuori standard UE: niente apice/legenda numerata — non deve capitare
            // con i 14 code platform, loggato per intercettare dati anomali.
            console.warn(`[mapCatalogToMenuPdfData] allergene senza numero UE, escluso: ${a.code}`);
            continue;
        }
        mapped.push({ code: a.code, label: a.label_it ?? a.label, euNumber });
    }
    return mapped;
}

function mapCharacteristics(
    characteristics: ResolvedCharacteristic[] | undefined
): MenuPdfCharacteristic[] {
    return (characteristics ?? []).map(c => ({
        code: c.code,
        label: c.label_it ?? c.label,
        icon: c.icon
    }));
}

function mapVariant(variant: ResolvedVariant): MenuPdfVariant {
    // Stessa regola di mapProduct: se c'è l'elenco formati, niente "da € X".
    const formats = mapFormats(variant.optionGroups);
    return {
        id: variant.id,
        name: variant.name,
        description: variant.description ?? null,
        priceLabel: formats.length > 0 ? null : formatPriceSummary(summaryFromResolved(variant)),
        originalPriceLabel: null,
        formats,
        allergens: mapAllergens(variant.allergens),
        characteristics: mapCharacteristics(variant.characteristics),
        imageUrl: variant.image_url ?? null,
        imageFraming: variant.image_framing ?? null,
        imageAspectRatio: variant.image_aspect_ratio ?? null
    };
}

function mapProduct(product: ResolvedProduct): MenuPdfProduct {
    // L'elenco formati (≥2 valori prezzati) è già esaustivo: in quel caso il
    // riepilogo "da € X" nell'header è ridondante → soppresso (priceLabel null).
    const formats = mapFormats(product.optionGroups);
    return {
        id: product.id,
        name: product.name,
        description: product.description ?? null,
        priceLabel: formats.length > 0 ? null : formatPriceSummary(summaryFromResolved(product)),
        originalPriceLabel: null,
        formats,
        addons: mapAddons(product.optionGroups),
        allergens: mapAllergens(product.allergens),
        characteristics: mapCharacteristics(product.characteristics),
        imageUrl: product.image_url ?? null,
        imageFraming: product.image_framing ?? null,
        imageAspectRatio: product.image_aspect_ratio ?? null,
        isDisabled: false,
        variants: (product.variants ?? []).map(mapVariant)
    };
}

/**
 * Legenda + copertura in un solo passaggio sulle categorie GIÀ mappate (quindi
 * post-filtro visibilità e post-scarto delle categorie vuote): il catalogo
 * risolto non viene percorso una seconda volta.
 *
 * Copertura: denominatore = prodotti effettivamente stampati (gli unavailable/
 * disable contano, finiscono nel PDF come normali); numeratore = prodotti con
 * almeno un allergene, propri o di una variante. Gli allergeni sono già passati
 * da `mapAllergens`, quindi i code fuori dai 14 UE non contano: non comparendo
 * nel documento non sono copertura.
 */
function buildAllergenSummary(categories: MenuPdfCategory[]): {
    legend: MenuPdfAllergen[];
    coverage: MenuPdfAllergenCoverage;
} {
    const byCode = new Map<string, MenuPdfAllergen>();
    let productsTotal = 0;
    let productsWithAllergens = 0;

    for (const category of categories) {
        for (const product of category.products) {
            productsTotal += 1;
            const allergens = [
                ...product.allergens,
                ...product.variants.flatMap(v => v.allergens)
            ];
            if (allergens.length > 0) productsWithAllergens += 1;
            for (const allergen of allergens) {
                if (!byCode.has(allergen.code)) byCode.set(allergen.code, allergen);
            }
        }
    }

    return {
        legend: Array.from(byCode.values()).sort((a, b) => a.euNumber - b.euNumber),
        coverage: { productsTotal, productsWithAllergens }
    };
}

export function mapCatalogToMenuPdfData(
    catalog: ResolvedCatalog,
    context: MapCatalogContext
): MenuPdfData {
    const categories: MenuPdfCategory[] = (catalog.categories ?? [])
        .map(category => ({
            id: category.id,
            name: category.name,
            level: category.level,
            parentCategoryId: category.parent_category_id,
            products: category.products
                .filter(p => p.is_visible !== false)
                .map(mapProduct)
        }))
        .filter(category => category.products.length > 0);

    const { legend, coverage } = buildAllergenSummary(categories);

    return {
        meta: {
            activityName: context.activityName,
            catalogName: catalog.name,
            slug: context.slug,
            address: context.address,
            generatedAt: context.generatedAt ?? new Date().toISOString(),
            closingInfo: context.closingInfo
        },
        brand: context.brand,
        categories,
        allergenLegend: legend,
        allergenCoverage: coverage
    };
}
