import { describe, it, expect, vi } from "vitest";

// Il resolver importa il client Supabase al top-level (`export const supabase = ...`),
// che lancia senza env. La funzione sotto test è pura → stub del modulo client.
vi.mock("@/services/supabase/client", () => ({ supabase: {} }));

import {
    applyVisibilityOverridesToCatalog,
    type ResolvedCatalog,
    type ResolvedProduct,
    type VisibilityOverrideRow
} from "@/services/supabase/resolveActivityCatalogs";

function product(id: string): ResolvedProduct {
    return {
        id,
        name: id,
        is_visible: true,
        is_disabled: false,
        parentSelected: true,
        variants: []
    } as unknown as ResolvedProduct;
}

function catalog(products: ResolvedProduct[]): ResolvedCatalog {
    return {
        id: "cat-1",
        name: "Catalogo",
        categories: [
            { id: "sec-1", name: "Sezione", parent_category_id: null, products }
        ]
    } as unknown as ResolvedCatalog;
}

function firstCategoryProducts(result: ResolvedCatalog | undefined): ResolvedProduct[] {
    return result?.categories?.[0]?.products ?? [];
}

// Regola di scheduling rule_type='visibility'. Prima del fix double-key la funzione
// scartava il mapping (override inerti) → questi test erano rossi. Vedi Model A gemello.
describe("applyVisibilityOverridesToCatalog — scheduling visibility rule (Model B)", () => {
    const control = product("p-control");

    it("mode 'disable' → prodotto TENUTO con is_disabled=true", () => {
        const target = product("p-unavailable");
        const overrides: Record<string, VisibilityOverrideRow> = {
            "p-unavailable": { product_id: "p-unavailable", visible: false, mode: "disable" }
        };

        const out = applyVisibilityOverridesToCatalog(catalog([control, target]), overrides, "hide");
        const found = firstCategoryProducts(out).find(p => p.id === "p-unavailable");

        expect(found).toBeDefined();
        expect(found?.is_disabled).toBe(true);
    });

    it("mode 'hide' → prodotto RIMOSSO", () => {
        const target = product("p-hidden");
        const overrides: Record<string, VisibilityOverrideRow> = {
            "p-hidden": { product_id: "p-hidden", visible: false, mode: "hide" }
        };

        const out = applyVisibilityOverridesToCatalog(catalog([control, target]), overrides, "hide");
        const ids = firstCategoryProducts(out).map(p => p.id);

        expect(ids).not.toContain("p-hidden");
        expect(ids).toContain("p-control");
    });

    it("mode null + fallback 'disable' → is_disabled=true (fallback applicato)", () => {
        const target = product("p-legacy");
        const overrides: Record<string, VisibilityOverrideRow> = {
            "p-legacy": { product_id: "p-legacy", visible: false, mode: null }
        };

        const out = applyVisibilityOverridesToCatalog(catalog([control, target]), overrides, "disable");
        const found = firstCategoryProducts(out).find(p => p.id === "p-legacy");

        expect(found).toBeDefined();
        expect(found?.is_disabled).toBe(true);
    });

    it("visible=true → prodotto TENUTO, is_disabled=false", () => {
        const target = product("p-shown");
        const overrides: Record<string, VisibilityOverrideRow> = {
            "p-shown": { product_id: "p-shown", visible: true }
        };

        const out = applyVisibilityOverridesToCatalog(catalog([control, target]), overrides, "hide");
        const found = firstCategoryProducts(out).find(p => p.id === "p-shown");

        expect(found).toBeDefined();
        expect(found?.is_disabled).toBe(false);
    });
});
