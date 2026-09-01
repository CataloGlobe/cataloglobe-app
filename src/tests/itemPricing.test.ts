import { describe, expect, it } from "vitest";
import {
    hasOrderablePrice,
    isOrderablePrice,
    type PriceableItem
} from "@/components/PublicCollectionView/itemPricing";

const primary = (
    ...prices: Array<number | null>
): NonNullable<PriceableItem["optionGroups"]> => [
    {
        group_kind: "PRIMARY_PRICE",
        values: prices.map(p => ({ absolutePrice: p }))
    }
];

describe("isOrderablePrice", () => {
    it("accetta numeri finiti, zero incluso", () => {
        expect(isOrderablePrice(12.5)).toBe(true);
        expect(isOrderablePrice(0)).toBe(true);
    });

    it("rifiuta null, undefined e NaN", () => {
        expect(isOrderablePrice(null)).toBe(false);
        expect(isOrderablePrice(undefined)).toBe(false);
        expect(isOrderablePrice(Number.NaN)).toBe(false);
    });
});

describe("hasOrderablePrice — prodotto senza formati", () => {
    it("prezzo presente → ordinabile", () => {
        expect(hasOrderablePrice({ price: 8 })).toBe(true);
    });

    it("effective_price ha la precedenza su price", () => {
        expect(hasOrderablePrice({ price: null, effective_price: 6 })).toBe(true);
    });

    it("base_price NULL e nessun gruppo → NON ordinabile", () => {
        expect(hasOrderablePrice({ price: null })).toBe(false);
        expect(hasOrderablePrice({})).toBe(false);
        expect(hasOrderablePrice({ price: null, optionGroups: [] })).toBe(false);
    });

    it("solo gruppi ADDON → decide il prezzo base", () => {
        const addons: PriceableItem["optionGroups"] = [
            { group_kind: "ADDON", values: [{ absolutePrice: null }] }
        ];
        expect(hasOrderablePrice({ price: null, optionGroups: addons })).toBe(false);
        expect(hasOrderablePrice({ price: 5, optionGroups: addons })).toBe(true);
    });
});

describe("hasOrderablePrice — prodotto a formati", () => {
    it("almeno un formato prezzato → ordinabile", () => {
        expect(hasOrderablePrice({ price: null, optionGroups: primary(4) })).toBe(true);
        expect(hasOrderablePrice({ price: null, optionGroups: primary(null, 7) })).toBe(true);
    });

    it("gruppo PRIMARY_PRICE senza valori → NON ordinabile", () => {
        expect(hasOrderablePrice({ price: null, optionGroups: primary() })).toBe(false);
        expect(
            hasOrderablePrice({ price: null, optionGroups: [{ group_kind: "PRIMARY_PRICE" }] })
        ).toBe(false);
    });

    it("formats senza alcun formato prezzato → NON ordinabile", () => {
        expect(hasOrderablePrice({ price: null, optionGroups: primary(null, null) })).toBe(false);
    });

    it("il gruppo vince su base_price, come nel server", () => {
        // validateOrderItems: se esiste PRIMARY_PRICE, base_price non è fallback.
        expect(hasOrderablePrice({ price: 9, optionGroups: primary(null) })).toBe(false);
    });

    it("group_kind case-insensitive (il payload risolto usa maiuscolo)", () => {
        expect(
            hasOrderablePrice({
                price: null,
                optionGroups: [{ group_kind: "primary_price", values: [{ absolutePrice: 3 }] }]
            })
        ).toBe(true);
    });
});

describe("hasOrderablePrice — varianti", () => {
    // buildVariantItem (CollectionView) costruisce un item sintetico con
    // price/optionGroups DELLA VARIANTE: il gate valuta la riga effettivamente
    // ordinabile, non il padre.
    it("padre prezzato, variante senza prezzo → variante NON ordinabile", () => {
        const parent: PriceableItem = { price: 10 };
        const variantItem: PriceableItem = { price: null };
        expect(hasOrderablePrice(parent)).toBe(true);
        expect(hasOrderablePrice(variantItem)).toBe(false);
    });

    it("padre senza prezzo, variante prezzata → variante ordinabile", () => {
        expect(hasOrderablePrice({ price: null })).toBe(false);
        expect(hasOrderablePrice({ price: 4 })).toBe(true);
    });

    it("variante a formati senza valori prezzati → NON ordinabile", () => {
        expect(hasOrderablePrice({ price: null, optionGroups: primary(null) })).toBe(false);
    });
});
