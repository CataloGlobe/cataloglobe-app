import { describe, it, expect } from "vitest";
import { featuredBundleOriginalTotal } from "@/utils/featuredBundleOriginalTotal";

const p = (fromPrice: number | null, base_price: number | null) => ({ product: { fromPrice, base_price } });
const bundle = (products: ReturnType<typeof p>[] | { product: null }[], extra: Partial<Parameters<typeof featuredBundleOriginalTotal>[0]> = {}) => ({
    pricing_mode: "bundle",
    show_original_total: true,
    bundle_price: 10,
    products,
    ...extra
});

describe("featuredBundleOriginalTotal", () => {
    it("somma i prezzi dei prodotti (formato o prezzo unico)", () => {
        expect(featuredBundleOriginalTotal(bundle([p(null, 8), p(4.5, null)]))).toBe(12.5);
    });

    it("un prodotto senza prezzo → nessun totale, non lo conta 0", () => {
        expect(featuredBundleOriginalTotal(bundle([p(null, 8), p(null, 6), p(null, null)]))).toBeNull();
    });

    it("tutti senza prezzo → nessun totale", () => {
        expect(featuredBundleOriginalTotal(bundle([p(null, null), p(null, null)]))).toBeNull();
    });

    it("ignora le righe con prodotto rimosso", () => {
        expect(featuredBundleOriginalTotal(bundle([p(null, 8), { product: null } as never, p(null, 6)]))).toBe(14);
    });

    it("totale uguale al prezzo del bundle → nessun totale", () => {
        expect(featuredBundleOriginalTotal(bundle([p(null, 4), p(null, 6)]))).toBeNull();
    });

    it("non è un bundle o il totale è spento → null", () => {
        expect(featuredBundleOriginalTotal(bundle([p(null, 8), p(null, 6)], { pricing_mode: "per_item" }))).toBeNull();
        expect(featuredBundleOriginalTotal(bundle([p(null, 8), p(null, 6)], { show_original_total: false }))).toBeNull();
    });

    it("nessun prodotto → null", () => {
        expect(featuredBundleOriginalTotal(bundle([]))).toBeNull();
    });
});
