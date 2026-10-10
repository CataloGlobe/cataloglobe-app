import { resolveFeaturedDisplayPrice } from "@/utils/resolveFeaturedDisplayPrice";

type BundleLike = {
    pricing_mode: string;
    show_original_total: boolean | null;
    bundle_price: number | null;
    products?: { product: { fromPrice: number | null; base_price: number | null } | null }[] | null;
};

/**
 * Totale barrato ("prezzo pieno") di un bundle in evidenza: la somma dei
 * prezzi dei prodotti. Se anche un solo prodotto non ha prezzo il confronto
 * non si può fare, quindi niente totale (null) invece di contarlo 0 e
 * mostrare un risparmio più piccolo del reale.
 */
export function featuredBundleOriginalTotal(block: BundleLike): number | null {
    if (block.pricing_mode !== "bundle" || !block.show_original_total) return null;
    const products = (block.products ?? []).filter(item => item.product != null);
    if (products.length === 0) return null;
    let total = 0;
    for (const item of products) {
        const price = resolveFeaturedDisplayPrice(item.product!);
        if (price == null) return null;
        total += price;
    }
    if (total === 0 || total === block.bundle_price) return null;
    return total;
}
