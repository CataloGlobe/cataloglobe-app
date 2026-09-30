import { describe, expect, it } from "vitest";
import { nextSeatOffer } from "@/utils/pricing";

const pro = { unit_price_cents: 5900, volume_discount_threshold: 2, volume_discount_percent: 10, max_self_service_seats: 5 };

describe("nextSeatOffer", () => {
    it("con sedi pagate libere non costa niente", () => {
        expect(nextSeatOffer(pro, 3, 2)).toEqual({ kind: "free", freeSeats: 1 });
    });

    it("al limite offre la sede successiva con lo sconto volume", () => {
        // 3 sedi: 59 + 53,10 + 53,10 = 165,20; 4 sedi: + 53,10 → differenza 53,10
        expect(nextSeatOffer(pro, 3, 3)).toEqual({
            kind: "upgrade",
            extraPriceCents: 5310,
            listPriceCents: 5900,
            volumeDiscountPercent: 10
        });
    });

    it("la prima sede in più su un piano da una sede è già scontata", () => {
        expect(nextSeatOffer(pro, 1, 1)).toMatchObject({ kind: "upgrade", extraPriceCents: 5310 });
    });

    it("al tetto self-service rimanda all'assistenza", () => {
        expect(nextSeatOffer(pro, 5, 5)).toEqual({ kind: "contact", cap: 5 });
    });
});
