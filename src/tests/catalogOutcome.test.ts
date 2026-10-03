import { describe, expect, it, vi } from "vitest";

// `catalogExplanation.ts` importa il resolver, che importa il client.
vi.mock("@/services/supabase/client", () => ({ supabase: {} }));

const { describeCounts, describeOutcome } = await import("@/utils/catalogExplanation");

const base = {
    seatName: "Centro",
    seatPublished: true,
    subscriptionServing: true,
    hasCatalogRule: true,
    catalogName: "Pranzo" as string | null,
    renderable: true
};

describe("describeOutcome", () => {
    it("il menù che vedono", () => {
        expect(describeOutcome(base)).toEqual({ kind: "showing", headline: "I clienti di Centro vedono Pranzo", missing: [] });
    });

    it("la sede sospesa viene prima di tutto, come nell'Edge", () => {
        const outcome = describeOutcome({ ...base, seatPublished: false, subscriptionServing: false });
        expect(outcome.kind).toBe("suspended");
        expect(outcome.headline).toBe("I clienti di Centro non vedono il menù: la sede è sospesa");
        expect(outcome.missing).toEqual(["seat", "subscription"]);
    });

    it("l'abbonamento fermo", () => {
        const outcome = describeOutcome({ ...base, subscriptionServing: false });
        expect(outcome.kind).toBe("subscription");
        expect(outcome.missing).toEqual(["subscription"]);
    });

    it("nessuna regola menù, o nessuna che valga adesso", () => {
        expect(describeOutcome({ ...base, hasCatalogRule: false, catalogName: null, renderable: false })).toMatchObject({
            kind: "noRule",
            headline: "I clienti di Centro non vedono nessun menù: nessuna regola gliene assegna uno",
            missing: ["rule"]
        });
        expect(describeOutcome({ ...base, catalogName: null, renderable: false })).toMatchObject({
            kind: "noneNow",
            missing: ["rule"]
        });
    });

    it("il menù vuoto", () => {
        expect(describeOutcome({ ...base, renderable: false })).toEqual({
            kind: "empty",
            headline: "I clienti di Centro non vedono prodotti: Pranzo è vuoto adesso",
            missing: ["products"]
        });
    });
});

describe("describeCounts", () => {
    it("singolare e plurale", () => {
        expect(describeCounts({ visible: 1, hidden: 1, unavailable: 1 })).toBe("1 visibile · 1 nascosto · 1 non disponibile");
        expect(describeCounts({ visible: 0, hidden: 2, unavailable: 3 })).toBe("0 visibili · 2 nascosti · 3 non disponibili");
    });
});
