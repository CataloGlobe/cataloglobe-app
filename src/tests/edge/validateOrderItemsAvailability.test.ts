import { describe, expect, it } from "vitest";
import {
    availabilityLookupIds,
    buildOrderableProducts,
    findUnavailableProductIds,
    parentsWithAllVariants
} from "../../../supabase/functions/_shared/orderAvailability";

const noVariants = new Map<string, string>();

describe("findUnavailableProductIds", () => {
    it("blocca un prodotto segnato «Non disponibile» dal pannello (visible_override=false)", () => {
        expect(
            findUnavailableProductIds(
                ["p1"],
                noVariants,
                [],
                [{ product_id: "p1", visible_override: false }]
            )
        ).toEqual(["p1"]);
    });

    it("ignora gli override che non spengono il prodotto", () => {
        expect(
            findUnavailableProductIds(
                ["p1", "p2"],
                noVariants,
                [],
                [
                    { product_id: "p1", visible_override: true },
                    { product_id: "p2", visible_override: null }
                ]
            )
        ).toEqual([]);
    });

    it("continua a bloccare i prodotti della tabella legacy", () => {
        expect(
            findUnavailableProductIds(["p3"], noVariants, [{ product_id: "p3" }], [])
        ).toEqual(["p3"]);
    });

    it("unisce le due fonti senza doppioni", () => {
        expect(
            findUnavailableProductIds(
                ["p1", "p2"],
                noVariants,
                [{ product_id: "p1" }],
                [
                    { product_id: "p1", visible_override: false },
                    { product_id: "p2", visible_override: false }
                ]
            )
        ).toEqual(["p1", "p2"]);
    });

    it("blocca la variante di un piatto «Non disponibile» (override sul padre)", () => {
        const parentByVariant = new Map([["v1", "parent"]]);
        expect(
            findUnavailableProductIds(
                ["v1"],
                parentByVariant,
                [],
                [{ product_id: "parent", visible_override: false }]
            )
        ).toEqual(["v1"]);
    });

    it("lascia ordinabile la variante se il padre è disponibile", () => {
        const parentByVariant = new Map([["v1", "parent"]]);
        expect(
            findUnavailableProductIds(
                ["v1"],
                parentByVariant,
                [],
                [{ product_id: "other", visible_override: false }]
            )
        ).toEqual([]);
    });
});

describe("availabilityLookupIds", () => {
    it("aggiunge i padri delle varianti richieste, senza doppioni", () => {
        const parentByVariant = new Map([
            ["v1", "parent"],
            ["v2", "parent"]
        ]);
        expect(availabilityLookupIds(["v1", "v2", "p9"], parentByVariant).sort()).toEqual(
            ["p9", "parent", "v1", "v2"]
        );
    });
});

describe("varianti dei cataloghi legacy (padre collegato senza varianti scelte)", () => {
    const link = (category_id: string, product_id: string, variant_product_id: string | null = null) => ({
        category_id,
        product_id,
        variant_product_id
    });
    const variants = [
        { id: "v1", parent_product_id: "p1" },
        { id: "v2", parent_product_id: "p1" },
        { id: "w1", parent_product_id: "p2" }
    ];

    it("solo il padre collegato: tutte le sue varianti sono ordinabili, come sulla pagina pubblica", () => {
        const rows = [link("c1", "p1")];
        expect(parentsWithAllVariants(rows)).toEqual(["p1"]);
        const { ids, parentByVariant } = buildOrderableProducts(rows, variants);
        expect([...ids].sort()).toEqual(["p1", "v1", "v2"]);
        expect(parentByVariant.get("v2")).toBe("p1");
    });

    it("varianti scelte: solo quelle, anche se il padre è collegato", () => {
        const rows = [link("c1", "p1"), link("c1", "p1", "v1")];
        expect(parentsWithAllVariants(rows)).toEqual([]);
        const { ids } = buildOrderableProducts(rows, variants);
        expect(ids.has("v1")).toBe(true);
        expect(ids.has("v2")).toBe(false);
    });

    it("il gruppo è per categoria: tutte le varianti in una, una sola in un'altra", () => {
        const rows = [link("c1", "p1"), link("c2", "p1", "v1")];
        const { ids } = buildOrderableProducts(rows, variants);
        expect(ids.has("v2")).toBe(true);
    });

    it("le varianti di un altro padre non entrano", () => {
        const { ids } = buildOrderableProducts([link("c1", "p1")], variants);
        expect(ids.has("w1")).toBe(false);
    });

    it("una variante del catalogo legacy segue il padre spento", () => {
        const { parentByVariant } = buildOrderableProducts([link("c1", "p1")], variants);
        expect(
            findUnavailableProductIds(["v1"], parentByVariant, [], [{ product_id: "p1", visible_override: false }])
        ).toEqual(["v1"]);
    });
});
