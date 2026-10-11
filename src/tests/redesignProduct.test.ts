import { describe, expect, it } from "vitest";
import { formatPublicPrice, formatSurcharge } from "@/components/PublicCollectionView/redesign/price";
import { groupRule, productIdOf, productSheetPage } from "@/components/PublicCollectionView/redesign/product/productSheet";

describe("prezzi della pagina pubblica nuova", () => {
    it("virgola, simbolo dopo, spazio che non va a capo", () => {
        expect(formatPublicPrice(22)).toBe("22,00\u00a0€");
        expect(formatPublicPrice(1234.5)).toBe("1.234,50\u00a0€");
    });

    it("sovrapprezzo solo se c'è: mai «+0»", () => {
        expect(formatSurcharge(3)).toBe("+3,00\u00a0€");
        expect(formatSurcharge(0)).toBeNull();
        expect(formatSurcharge(null)).toBeNull();
        expect(formatSurcharge(undefined)).toBeNull();
    });
});

describe("regola di un gruppo di scelte (spec §6)", () => {
    it("obbligatoria da 1: «scegli 1»", () => {
        expect(groupRule({ isRequired: true, maxSelectable: 1 })).toEqual({ key: "product_sheet.rule_pick_one" });
    });

    it("obbligatoria fino a N", () => {
        expect(groupRule({ isRequired: true, maxSelectable: 3 })).toEqual({
            key: "product_sheet.rule_up_to_required",
            count: 3
        });
    });

    it("obbligatoria senza limite", () => {
        expect(groupRule({ isRequired: true, maxSelectable: null })).toEqual({ key: "product_sheet.rule_required" });
    });

    it("facoltativa, con o senza limite", () => {
        expect(groupRule({ isRequired: false, maxSelectable: null })).toEqual({ key: "product_sheet.rule_optional" });
        expect(groupRule({ isRequired: false, maxSelectable: 1 })).toEqual({ key: "product_sheet.rule_optional" });
        expect(groupRule({ isRequired: false, maxSelectable: 4 })).toEqual({
            key: "product_sheet.rule_up_to_optional",
            count: 4
        });
    });
});

describe("pagina del prodotto nel foglio", () => {
    it("chiave col prefisso, titolo nascosto, ritorno all'id", () => {
        const page = productSheetPage({ id: "p-1", name: "Amarone" });
        expect(page).toMatchObject({ key: "product:p-1", title: "Amarone", titleHidden: true });
        expect(productIdOf(page)).toBe("p-1");
        expect(productIdOf({ key: "info", title: "Informazioni" })).toBeNull();
    });
});
