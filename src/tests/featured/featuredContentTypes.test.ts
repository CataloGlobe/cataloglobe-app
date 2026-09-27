import { describe, expect, it } from "vitest";
import { deriveTypeFields, parsePrice, typeChoiceError, typeHasProducts } from "@/pages/Dashboard/Highlights/featuredContentTypes";

const base = { bundlePrice: "", showOriginalTotal: true, showImages: true };

describe("deriveTypeFields", () => {
    it("annuncio ed evento: nessun prezzo, niente immagini dei prodotti", () => {
        for (const type of ["announcement", "event"] as const) {
            expect(deriveTypeFields({ ...base, type, bundlePrice: "12" })).toEqual({
                content_type: type,
                pricing_mode: "none",
                bundle_price: null,
                show_original_total: false,
                layout_style: null
            });
        }
    });

    it("promo: prezzo per prodotto, immagini se chieste", () => {
        expect(deriveTypeFields({ ...base, type: "promo" })).toEqual({
            content_type: "promo",
            pricing_mode: "per_item",
            bundle_price: null,
            show_original_total: false,
            layout_style: "with_images"
        });
        expect(deriveTypeFields({ ...base, type: "promo", showImages: false }).layout_style).toBeNull();
    });

    it("bundle: prezzo unico e totale originale", () => {
        expect(deriveTypeFields({ ...base, type: "bundle", bundlePrice: "18,50" })).toEqual({
            content_type: "bundle",
            pricing_mode: "bundle",
            bundle_price: 18.5,
            show_original_total: true,
            layout_style: "with_images"
        });
    });
});

describe("parsePrice e typeChoiceError", () => {
    it("accetta virgola e punto, fino a due decimali", () => {
        expect(parsePrice("18")).toBe(18);
        expect(parsePrice(" 4,5 ")).toBe(4.5);
        expect(parsePrice("4.50")).toBe(4.5);
        expect(parsePrice("4,555")).toBeNull();
        expect(parsePrice("abc")).toBeNull();
    });

    it("il bundle senza prezzo positivo non si salva", () => {
        expect(typeChoiceError({ ...base, type: "bundle" })).toBe("Inserisci il prezzo del bundle.");
        expect(typeChoiceError({ ...base, type: "bundle", bundlePrice: "0" })).toBe("Inserisci il prezzo del bundle.");
        expect(typeChoiceError({ ...base, type: "bundle", bundlePrice: "9" })).toBeNull();
        expect(typeChoiceError({ ...base, type: "promo" })).toBeNull();
    });

    it("solo promo e bundle hanno prodotti", () => {
        expect(typeHasProducts("promo")).toBe(true);
        expect(typeHasProducts("bundle")).toBe(true);
        expect(typeHasProducts("event")).toBe(false);
        expect(typeHasProducts("announcement")).toBe(false);
    });
});
