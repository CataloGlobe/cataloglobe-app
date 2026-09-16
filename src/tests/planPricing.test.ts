import { describe, expect, it } from "vitest";
import {
    availableIntervals,
    coerceInterval,
    monthByMonthEquivalentCents,
    priceCentsFor
} from "@/utils/planPricing";
import type { PlanPrice } from "@/types/plan";

const monthlyOnly: PlanPrice[] = [
    { plan_code: "base", billing_interval: "month", price_cents: 3900 },
    { plan_code: "pro", billing_interval: "month", price_cents: 5900 }
];

const full: PlanPrice[] = [
    ...monthlyOnly,
    { plan_code: "base", billing_interval: "year", price_cents: 39000 },
    { plan_code: "pro", billing_interval: "year", price_cents: 59000 }
];

describe("availableIntervals", () => {
    it("returns only month when yearly rows are missing (production today)", () => {
        expect(availableIntervals(monthlyOnly, ["base", "pro"])).toEqual(["month"]);
    });

    it("returns month then year when every plan has both rows", () => {
        expect(availableIntervals(full, ["base", "pro"])).toEqual(["month", "year"]);
    });

    it("requires every plan to have the interval, not just one", () => {
        const partial: PlanPrice[] = [
            ...monthlyOnly,
            { plan_code: "base", billing_interval: "year", price_cents: 39000 }
        ];
        expect(availableIntervals(partial, ["base", "pro"])).toEqual(["month"]);
    });

    it("returns nothing when there are no plans", () => {
        expect(availableIntervals(full, [])).toEqual([]);
    });

    it("returns nothing when the monthly row itself is missing", () => {
        expect(availableIntervals([], ["base"])).toEqual([]);
    });
});

describe("priceCentsFor", () => {
    it("reads the configured price", () => {
        expect(priceCentsFor(full, "pro", "year")).toBe(59000);
    });

    it("is null for a missing combination", () => {
        expect(priceCentsFor(monthlyOnly, "pro", "year")).toBeNull();
    });
});

describe("monthByMonthEquivalentCents", () => {
    it("is 12 monthly prices for a yearly interval", () => {
        expect(monthByMonthEquivalentCents(full, "base", "year")).toBe(46800);
    });

    it("is null for the monthly interval itself", () => {
        expect(monthByMonthEquivalentCents(full, "base", "month")).toBeNull();
    });

    it("is null when the monthly price is unknown", () => {
        const yearlyOnly: PlanPrice[] = [{ plan_code: "base", billing_interval: "year", price_cents: 39000 }];
        expect(monthByMonthEquivalentCents(yearlyOnly, "base", "year")).toBeNull();
    });
});

describe("coerceInterval", () => {
    it("keeps a purchasable interval", () => {
        expect(coerceInterval("year", ["month", "year"])).toBe("year");
    });

    it("falls back to month when the stored interval is not purchasable", () => {
        expect(coerceInterval("year", ["month"])).toBe("month");
    });

    it("falls back to month when nothing is stored", () => {
        expect(coerceInterval(null, ["month", "year"])).toBe("month");
    });
});
