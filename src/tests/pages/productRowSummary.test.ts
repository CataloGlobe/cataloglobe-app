import { describe, expect, it } from "vitest";
import { describeFormats, describeMenus, describePrice } from "@/pages/Dashboard/Products/productRowSummary";
import type { ProductListMetadata } from "@/services/supabase/products";

const meta = (m: Partial<ProductListMetadata> = {}): ProductListMetadata => ({
    formatsCount: 0,
    configurationsCount: 0,
    catalogsCount: 0,
    fromPrice: null,
    toPrice: null,
    pricedFormatsCount: 0,
    ...m
});

describe("describePrice", () => {
    it("prezzo unico", () => {
        expect(describePrice({ base_price: 2.9 }, meta())).toEqual({ kind: "price", text: "€ 2,90", inherited: false });
    });

    it("più formati: «da» il minimo, anche con base_price presente", () => {
        expect(describePrice({ base_price: 9 }, meta({ pricedFormatsCount: 3, fromPrice: 2.5, formatsCount: 3 }))).toEqual({
            kind: "price",
            text: "da € 2,50",
            inherited: false
        });
    });

    it("un formato solo è un prezzo", () => {
        expect(describePrice({ base_price: null }, meta({ pricedFormatsCount: 1, fromPrice: 3 }))).toMatchObject({ text: "€ 3,00" });
    });

    it("variante senza prezzo proprio: eredita dal padre", () => {
        expect(describePrice({ base_price: null }, meta(), { base_price: 2.5 }, meta())).toEqual({
            kind: "price",
            text: "€ 2,50",
            inherited: true
        });
        expect(
            describePrice({ base_price: null }, meta(), { base_price: null }, meta({ pricedFormatsCount: 2, fromPrice: 1 }))
        ).toMatchObject({ text: "da € 1,00", inherited: true });
    });

    it("nessun prezzo", () => {
        expect(describePrice({ base_price: null }, meta())).toEqual({ kind: "none" });
        expect(describePrice({ base_price: null }, meta(), { base_price: null }, meta())).toEqual({ kind: "none" });
    });
});

describe("describeMenus", () => {
    const menu = { catalogLabel: "Menù", catalogLabelPlural: "Menù" };
    const catalog = { catalogLabel: "Catalogo", catalogLabelPlural: "Cataloghi" };

    it("singolare, plurale e nessuno dal verticale", () => {
        expect(describeMenus(2, menu)).toEqual({ text: "in 2 menù", none: false });
        expect(describeMenus(1, catalog)).toEqual({ text: "in 1 catalogo", none: false });
        expect(describeMenus(3, catalog)).toEqual({ text: "in 3 cataloghi", none: false });
        expect(describeMenus(0, menu)).toEqual({ text: "in nessun menù", none: true });
    });

    it("la variante senza collegamenti vale quanto il padre", () => {
        expect(describeMenus(0, menu, 2)).toEqual({ text: "in 2 menù", none: false });
    });
});

describe("describeFormats", () => {
    it("solo con più di un formato", () => {
        expect(describeFormats(meta({ formatsCount: 3 }))).toBe("3 formati");
        expect(describeFormats(meta({ formatsCount: 1 }))).toBeNull();
    });
});
