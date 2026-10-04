import { describe, expect, it } from "vitest";
import { findUnavailableProductIds } from "../../../supabase/functions/_shared/validateOrderItems";

describe("findUnavailableProductIds", () => {
    it("blocca un prodotto segnato «Non disponibile» dal pannello (visible_override=false)", () => {
        expect(
            findUnavailableProductIds([], [{ product_id: "p1", visible_override: false }])
        ).toEqual(["p1"]);
    });

    it("ignora gli override che non spengono il prodotto", () => {
        expect(
            findUnavailableProductIds(
                [],
                [
                    { product_id: "p1", visible_override: true },
                    { product_id: "p2", visible_override: null }
                ]
            )
        ).toEqual([]);
    });

    it("continua a bloccare i prodotti della tabella legacy", () => {
        expect(findUnavailableProductIds([{ product_id: "p3" }], [])).toEqual(["p3"]);
    });

    it("unisce le due fonti senza doppioni", () => {
        expect(
            findUnavailableProductIds(
                [{ product_id: "p1" }],
                [
                    { product_id: "p1", visible_override: false },
                    { product_id: "p2", visible_override: false }
                ]
            ).sort()
        ).toEqual(["p1", "p2"]);
    });
});
