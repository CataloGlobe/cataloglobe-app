import { describe, expect, it } from "vitest";
import { MAX_SELF_SERVICE_SEATS, planSeatRealign } from "../../../supabase/functions/_shared/seatRealign";

describe("planSeatRealign (CG-03, D10)", () => {
    it("non tocca nulla se le sedi stanno nei posti pagati", () => {
        expect(planSeatRealign(2, 2)).toEqual({ action: "none" });
        expect(planSeatRealign(3, 1)).toEqual({ action: "none" });
        expect(planSeatRealign(1, 0)).toEqual({ action: "none" });
    });

    it("mai in giù: meno sedi dei posti restano posti liberi già pagati", () => {
        expect(planSeatRealign(5, 2)).toEqual({ action: "none" });
    });

    it("sedi aggiunte a checkout aperto: la quantity sale alle sedi", () => {
        expect(planSeatRealign(2, 5)).toEqual({ action: "raise", to: 5 });
        expect(planSeatRealign(1, 2)).toEqual({ action: "raise", to: 2 });
    });

    it("oltre il tetto self-service non si alza: va all'assistenza", () => {
        expect(MAX_SELF_SERVICE_SEATS).toBe(5);
        expect(planSeatRealign(2, 6)).toEqual({ action: "over_cap", activities: 6 });
        expect(planSeatRealign(6, 7)).toEqual({ action: "over_cap", activities: 7 });
    });

    it("il tetto si può passare", () => {
        expect(planSeatRealign(2, 6, 10)).toEqual({ action: "raise", to: 6 });
    });
});
