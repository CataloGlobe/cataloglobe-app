import { describe, expect, it } from "vitest";
import {
    hasConfiguredPrice,
    hasConfiguredEffectivePrice
} from "@/utils/productPriceStatus";

describe("hasConfiguredPrice", () => {
    it("base_price valorizzato, nessun formato → prezzato", () => {
        expect(hasConfiguredPrice({ basePrice: 12.5 })).toBe(true);
        expect(hasConfiguredPrice({ basePrice: 12.5, pricedFormatsCount: 0 })).toBe(true);
    });

    it("prezzo zero è un prezzo", () => {
        expect(hasConfiguredPrice({ basePrice: 0 })).toBe(true);
    });

    it("base_price NULL ma formati prezzati → prezzato", () => {
        expect(hasConfiguredPrice({ basePrice: null, pricedFormatsCount: 1 })).toBe(true);
        expect(hasConfiguredPrice({ basePrice: null, pricedFormatsCount: 3 })).toBe(true);
    });

    it("base_price NULL e nessun formato prezzato → NON prezzato", () => {
        expect(hasConfiguredPrice({ basePrice: null })).toBe(false);
        expect(hasConfiguredPrice({ basePrice: null, pricedFormatsCount: 0 })).toBe(false);
        expect(hasConfiguredPrice({ basePrice: undefined })).toBe(false);
        expect(hasConfiguredPrice({ basePrice: null, pricedFormatsCount: null })).toBe(false);
    });

    it("gruppo PRIMARY_PRICE presente ma senza valori prezzati → NON prezzato", () => {
        // `pricedFormatsCount` conta i soli formati con prezzo valido: un gruppo
        // esistente ma vuoto (o con soli valori senza prezzo) arriva qui a 0.
        expect(hasConfiguredPrice({ basePrice: null, pricedFormatsCount: 0 })).toBe(false);
    });

    it("NaN non è un prezzo", () => {
        expect(hasConfiguredPrice({ basePrice: Number.NaN })).toBe(false);
    });
});

describe("hasConfiguredEffectivePrice", () => {
    it("variante con prezzo proprio → prezzata a prescindere dal padre", () => {
        expect(
            hasConfiguredEffectivePrice({ basePrice: 4 }, { basePrice: null })
        ).toBe(true);
    });

    it("variante senza prezzo che eredita da padre prezzato → prezzata", () => {
        expect(
            hasConfiguredEffectivePrice({ basePrice: null }, { basePrice: 10 })
        ).toBe(true);
        expect(
            hasConfiguredEffectivePrice(
                { basePrice: null },
                { basePrice: null, pricedFormatsCount: 2 }
            )
        ).toBe(true);
    });

    it("variante senza prezzo e padre senza prezzo → NON prezzata", () => {
        expect(
            hasConfiguredEffectivePrice({ basePrice: null }, { basePrice: null })
        ).toBe(false);
    });

    it("senza padre degrada al predicato semplice", () => {
        expect(hasConfiguredEffectivePrice({ basePrice: null })).toBe(false);
        expect(hasConfiguredEffectivePrice({ basePrice: null }, null)).toBe(false);
        expect(hasConfiguredEffectivePrice({ basePrice: 7 })).toBe(true);
    });
});
