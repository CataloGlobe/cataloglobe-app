import { describe, expect, it } from "vitest";
import { calculateSeatsPricing, nextSeatOffer } from "@/utils/pricing";

const pro = { unit_price_cents: 5900, max_self_service_seats: 5 };

describe("nextSeatOffer", () => {
    it("con sedi pagate libere non costa niente", () => {
        expect(nextSeatOffer(pro, 3, 2)).toEqual({ kind: "free", freeSeats: 1 });
    });

    it("al limite offre la sede successiva a prezzo pieno", () => {
        expect(nextSeatOffer(pro, 3, 3)).toEqual({ kind: "upgrade", extraPriceCents: 5900 });
    });

    it("anche la seconda sede costa quanto la prima", () => {
        expect(nextSeatOffer(pro, 1, 1)).toEqual({ kind: "upgrade", extraPriceCents: 5900 });
    });

    it("al tetto self-service rimanda all'assistenza", () => {
        expect(nextSeatOffer(pro, 5, 5)).toEqual({ kind: "contact", cap: 5 });
    });
});

describe("calculateSeatsPricing", () => {
    it("ogni sede paga il prezzo pieno", () => {
        expect(calculateSeatsPricing({ unit_price_cents: 3900 }, 3)).toEqual({ seats: 3, unitPrice: 39, subtotal: 117 });
    });

    it("annuale: 390 € a sede", () => {
        expect(calculateSeatsPricing({ unit_price_cents: 39000 }, 2)).toEqual({ seats: 2, unitPrice: 390, subtotal: 780 });
    });

    it("senza prezzo vale zero", () => {
        expect(calculateSeatsPricing({ unit_price_cents: null }, 2)).toEqual({ seats: 2, unitPrice: 0, subtotal: 0 });
    });
});
