import { describe, expect, it } from "vitest";
import {
    aiProductHasPrice,
    aiProductMissesPrice,
    countAiProductsWithoutPrice,
    toAiPriceableProduct
} from "@/pages/Dashboard/Catalogs/AiMenuImport/aiProductPricing";

describe("aiProductHasPrice — prodotto semplice", () => {
    it("base_price valorizzato → prezzato", () => {
        expect(aiProductHasPrice({ base_price: 12 })).toBe(true);
        expect(aiProductHasPrice({ base_price: 0 })).toBe(true);
    });

    it("base_price NULL o assente → senza prezzo", () => {
        expect(aiProductHasPrice({ base_price: null })).toBe(false);
        expect(aiProductHasPrice({})).toBe(false);
        expect(aiProductHasPrice({ base_price: null, formats: [] })).toBe(false);
    });
});

describe("aiProductHasPrice — prodotto a formati", () => {
    it("almeno un formato prezzato → prezzato, anche con gli altri vuoti", () => {
        expect(
            aiProductHasPrice({
                base_price: null,
                formats: [{ price: 5 }, { price: null }]
            })
        ).toBe(true);
    });

    it("nessun formato prezzato → senza prezzo", () => {
        expect(
            aiProductHasPrice({
                base_price: null,
                formats: [{ price: null }, { price: null }]
            })
        ).toBe(false);
    });

    it("i formati vincono su base_price, come nel resolver pubblico", () => {
        expect(
            aiProductHasPrice({ base_price: 9, formats: [{ price: null }] })
        ).toBe(false);
    });
});

describe("aiProductMissesPrice / countAiProductsWithoutPrice", () => {
    it("è il complemento di aiProductHasPrice", () => {
        expect(aiProductMissesPrice({ base_price: null })).toBe(true);
        expect(aiProductMissesPrice({ base_price: 3 })).toBe(false);
    });

    it("conta i soli prodotti senza prezzo", () => {
        expect(
            countAiProductsWithoutPrice([
                { base_price: 8 },
                { base_price: null },
                { base_price: null, formats: [{ price: 4 }] },
                { base_price: null, formats: [{ price: null }] }
            ])
        ).toBe(2);
    });

    it("lista vuota → zero", () => {
        expect(countAiProductsWithoutPrice([])).toBe(0);
    });
});

describe("toAiPriceableProduct", () => {
    it("un 'simple' con formati appesi resta giudicato sul base_price", () => {
        // Output AI malformato: `buildImportManifest` scrive solo il base_price
        // per un product_type "simple", quindi i formati non devono contare.
        expect(
            aiProductHasPrice(
                toAiPriceableProduct({
                    product_type: "simple",
                    base_price: 7,
                    formats: [{ price: null }]
                })
            )
        ).toBe(true);
    });

    it("per un 'formats' i formati decidono", () => {
        expect(
            aiProductHasPrice(
                toAiPriceableProduct({
                    product_type: "formats",
                    base_price: 9,
                    formats: [{ price: null }]
                })
            )
        ).toBe(false);
    });

    it("un 'formats' senza array formati è senza prezzo", () => {
        expect(
            aiProductMissesPrice(
                toAiPriceableProduct({ product_type: "formats", base_price: null })
            )
        ).toBe(true);
    });
});
