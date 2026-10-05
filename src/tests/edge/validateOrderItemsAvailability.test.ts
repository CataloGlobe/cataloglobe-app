import { describe, expect, it } from "vitest";
import {
    availabilityLookupIds,
    findUnavailableProductIds
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
