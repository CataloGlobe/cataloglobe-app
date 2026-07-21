import { describe, it, expect, vi } from "vitest";

// resolveActivityCatalogs importa il client Supabase al top-level (lancia senza
// env). Le funzioni sotto test sono pure → stub del modulo client (stesso
// pattern di src/tests/scheduling/activityVisibilityOverrides.test.ts).
vi.mock("@/services/supabase/client", () => ({ supabase: {} }));

import {
    applyActivityVisibilityOverridesToCatalog,
    type ActivityProductOverrideRow,
    type ResolvedAllergen,
    type ResolvedCatalog,
    type ResolvedCategory,
    type ResolvedProduct
} from "@/services/supabase/resolveActivityCatalogs";
import { DEFAULT_STYLE_TOKENS } from "@/pages/Dashboard/Styles/Editor/StyleTokenModel";
import { mapCatalogToMenuPdfData, type MapCatalogContext } from "@/services/pdf/mapCatalogToMenuPdfData";

function allergen(code: string, label: string): ResolvedAllergen {
    return { id: code.charCodeAt(0), code, label, label_it: label };
}

function product(id: string, overrides: Partial<ResolvedProduct> = {}): ResolvedProduct {
    return {
        id,
        name: `Prodotto ${id}`,
        is_visible: true,
        is_disabled: false,
        parentSelected: true,
        variants: [],
        ...overrides
    } as ResolvedProduct;
}

function category(id: string, products: ResolvedProduct[]): ResolvedCategory {
    return {
        id,
        name: `Categoria ${id}`,
        level: 0,
        sort_order: 0,
        parent_category_id: null,
        products
    };
}

function catalog(categories: ResolvedCategory[]): ResolvedCatalog {
    return { id: "cat-1", name: "Menu Test", categories };
}

function context(): MapCatalogContext {
    return {
        brand: {
            tokens: DEFAULT_STYLE_TOKENS,
            styleName: null,
            logoUrl: null,
            coverUrl: null
        },
        activityName: "Sede Test",
        slug: "sede-test",
        address: "Via Roma, 1 — 20100 Milano",
        generatedAt: "2026-07-22T10:00:00.000Z"
    };
}

describe("mapCatalogToMenuPdfData — prezzi", () => {
    it("prezzo singolo → '€ X.XX'", () => {
        const data = mapCatalogToMenuPdfData(
            catalog([category("c1", [product("p1", { price: 10 })])]),
            context()
        );
        expect(data.categories[0].products[0].priceLabel).toBe("€ 10.00");
    });

    it("from/to price → 'da € X.XX' + formats espliciti dal PRIMARY_PRICE", () => {
        const data = mapCatalogToMenuPdfData(
            catalog([
                category("c1", [
                    product("p1", {
                        from_price: 8,
                        to_price: 12,
                        optionGroups: [
                            {
                                id: "og1",
                                name: "Formato",
                                group_kind: "PRIMARY_PRICE",
                                pricing_mode: "ABSOLUTE",
                                is_required: true,
                                max_selectable: 1,
                                values: [
                                    { id: "v1", name: "Piccola", absolute_price: 8, price_modifier: null },
                                    { id: "v2", name: "Grande", absolute_price: 12, price_modifier: null }
                                ]
                            }
                        ]
                    })
                ])
            ]),
            context()
        );
        const p = data.categories[0].products[0];
        expect(p.priceLabel).toBe("da € 8.00");
        expect(p.formats).toEqual([
            { name: "Piccola", priceLabel: "€ 8.00" },
            { name: "Grande", priceLabel: "€ 12.00" }
        ]);
    });

    it("nessun prezzo → priceLabel null; originalPriceLabel sempre null in v1", () => {
        const data = mapCatalogToMenuPdfData(
            catalog([category("c1", [product("p1")])]),
            context()
        );
        expect(data.categories[0].products[0].priceLabel).toBeNull();
        expect(data.categories[0].products[0].originalPriceLabel).toBeNull();
    });
});

describe("mapCatalogToMenuPdfData — legenda allergeni", () => {
    it("unione degli allergeni usati (prodotti + varianti), dedup, ordinata per code", () => {
        const glutine = allergen("01", "Glutine");
        const latte = allergen("07", "Latte");
        const frutta = allergen("08", "Frutta a guscio");

        const data = mapCatalogToMenuPdfData(
            catalog([
                category("c1", [
                    product("p1", { allergens: [latte, glutine] }),
                    product("p2", {
                        allergens: [glutine],
                        variants: [
                            {
                                id: "var1",
                                name: "Variante",
                                allergens: [frutta]
                            }
                        ]
                    })
                ])
            ]),
            context()
        );

        expect(data.allergenLegend).toEqual([
            { code: "01", label: "Glutine" },
            { code: "07", label: "Latte" },
            { code: "08", label: "Frutta a guscio" }
        ]);
    });
});

describe("mapCatalogToMenuPdfData — semantica override di stampa", () => {
    it("hide assente, disable presente come prodotto normale (isDisabled false)", () => {
        const base = catalog([
            category("c1", [product("visibile"), product("nascosto"), product("esaurito")])
        ]);
        const overrides: Record<string, ActivityProductOverrideRow> = {
            nascosto: { product_id: "nascosto", visible_override: false, mode: "hide" },
            esaurito: { product_id: "esaurito", visible_override: false, mode: "disable" }
        };

        const curated = applyActivityVisibilityOverridesToCatalog(base, base, overrides);
        expect(curated).toBeDefined();

        const data = mapCatalogToMenuPdfData(curated as ResolvedCatalog, context());
        const ids = data.categories[0].products.map(p => p.id);

        expect(ids).toEqual(["visibile", "esaurito"]);
        const esaurito = data.categories[0].products.find(p => p.id === "esaurito");
        expect(esaurito?.isDisabled).toBe(false);
    });
});

describe("mapCatalogToMenuPdfData — categorie", () => {
    it("categorie vuote assenti (anche se svuotate dagli override)", () => {
        const base = catalog([
            category("piena", [product("p1", { price: 5 })]),
            category("vuota", []),
            category("svuotata", [product("p2")])
        ]);
        const overrides: Record<string, ActivityProductOverrideRow> = {
            p2: { product_id: "p2", visible_override: false, mode: "hide" }
        };

        const curated = applyActivityVisibilityOverridesToCatalog(base, base, overrides);
        const data = mapCatalogToMenuPdfData(curated as ResolvedCatalog, context());

        expect(data.categories.map(c => c.id)).toEqual(["piena"]);
    });

    it("meta e brand passano invariati", () => {
        const data = mapCatalogToMenuPdfData(
            catalog([category("c1", [product("p1")])]),
            context()
        );
        expect(data.meta).toEqual({
            activityName: "Sede Test",
            catalogName: "Menu Test",
            slug: "sede-test",
            address: "Via Roma, 1 — 20100 Milano",
            generatedAt: "2026-07-22T10:00:00.000Z"
        });
        expect(data.brand.tokens).toBe(DEFAULT_STYLE_TOKENS);
    });
});
