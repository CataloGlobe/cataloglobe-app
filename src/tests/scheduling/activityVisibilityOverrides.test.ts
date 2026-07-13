import { describe, it, expect, vi } from "vitest";

// Il resolver importa il client Supabase al top-level (`export const supabase = ...`),
// che lancia senza env. La funzione sotto test è pura → stub del modulo client.
vi.mock("@/services/supabase/client", () => ({ supabase: {} }));

import {
    applyActivityVisibilityOverridesToCatalog,
    type ActivityProductOverrideRow,
    type ResolvedCatalog,
    type ResolvedProduct
} from "@/services/supabase/resolveActivityCatalogs";

// Minimal ResolvedProduct: la funzione legge id/is_visible/is_disabled/parentSelected/variants.
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
            {
                id: "sec-1",
                name: "Sezione",
                parent_category_id: null,
                products
            }
        ]
    } as unknown as ResolvedCatalog;
}

function firstCategoryProducts(result: ResolvedCatalog | undefined): ResolvedProduct[] {
    return result?.categories?.[0]?.products ?? [];
}

describe("applyActivityVisibilityOverridesToCatalog — realtime tri-state", () => {
    // Un prodotto "control" sempre visibile tiene viva la sezione (filterEmptyCategories).
    const control = product("p-control");

    it("mode 'disable' + visible_override=false → prodotto TENUTO con is_disabled=true", () => {
        const target = product("p-unavailable");
        const base = catalog([control, target]);
        const overrides: Record<string, ActivityProductOverrideRow> = {
            "p-unavailable": { product_id: "p-unavailable", visible_override: false, mode: "disable" }
        };

        const out = applyActivityVisibilityOverridesToCatalog(base, base, overrides);
        const products = firstCategoryProducts(out);
        const found = products.find(p => p.id === "p-unavailable");

        expect(found).toBeDefined();
        expect(found?.is_disabled).toBe(true);
        expect(found?.is_visible).toBe(true);
    });

    it("mode 'hide' + visible_override=false → prodotto RIMOSSO", () => {
        const target = product("p-hidden");
        const base = catalog([control, target]);
        const overrides: Record<string, ActivityProductOverrideRow> = {
            "p-hidden": { product_id: "p-hidden", visible_override: false, mode: "hide" }
        };

        const out = applyActivityVisibilityOverridesToCatalog(base, base, overrides);
        const ids = firstCategoryProducts(out).map(p => p.id);

        expect(ids).not.toContain("p-hidden");
        expect(ids).toContain("p-control");
    });

    it("mode null + visible_override=false → fallback 'hide', prodotto RIMOSSO", () => {
        const target = product("p-legacy");
        const base = catalog([control, target]);
        const overrides: Record<string, ActivityProductOverrideRow> = {
            "p-legacy": { product_id: "p-legacy", visible_override: false, mode: null }
        };

        const out = applyActivityVisibilityOverridesToCatalog(base, base, overrides);
        const ids = firstCategoryProducts(out).map(p => p.id);

        expect(ids).not.toContain("p-legacy");
    });

    it("visible_override=null → nessun cambiamento, is_disabled resta false", () => {
        const target = product("p-normal");
        const base = catalog([control, target]);
        const overrides: Record<string, ActivityProductOverrideRow> = {
            "p-normal": { product_id: "p-normal", visible_override: null, mode: null }
        };

        const out = applyActivityVisibilityOverridesToCatalog(base, base, overrides);
        const found = firstCategoryProducts(out).find(p => p.id === "p-normal");

        expect(found).toBeDefined();
        expect(found?.is_disabled).toBe(false);
    });
});
