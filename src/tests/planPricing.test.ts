import { describe, expect, it } from "vitest";
import {
    availableIntervals,
    coerceInterval,
    monthByMonthEquivalentCents,
    priceCentsFor,
    yearlySavingsNote
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

describe("yearlySavingsNote — the line under the price, present in both states", () => {
    it("monthly: names the yearly total and the two free months, tone success", () => {
        expect(yearlySavingsNote(full, "pro", "month")).toEqual({ text: "€590 all'anno, due mesi gratis", tone: "success" });
    });

    it("yearly: names the month-by-month equivalent, tone muted", () => {
        expect(yearlySavingsNote(full, "base", "year")).toEqual({ text: "€468 pagando mese per mese", tone: "muted" });
    });

    it("is null when the other interval is not purchasable", () => {
        expect(yearlySavingsNote(monthlyOnly, "base", "month")).toBeNull();
        expect(yearlySavingsNote(monthlyOnly, "base", "year")).toBeNull();
    });

    it("never claims two free months when yearly is not 10 × monthly", () => {
        const odd: PlanPrice[] = [
            { plan_code: "base", billing_interval: "month", price_cents: 3900 },
            { plan_code: "base", billing_interval: "year", price_cents: 40000 }
        ];
        expect(yearlySavingsNote(odd, "base", "month")).toBeNull();
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
