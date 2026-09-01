import { describe, it, expect } from "vitest";
import {
    ZOOM_EPS,
    shouldUseLegacyCoverPath
} from "@/components/ui/FramedMedia/framedMediaPath";

describe("shouldUseLegacyCoverPath", () => {
    it("ratio null + zoom 1 → legacy (prodotto pre-framing, nessun dato)", () => {
        expect(shouldUseLegacyCoverPath(null, 1)).toBe(true);
    });

    it("ratio null + zoom 2 → legacy: senza ratio la geometria non è calcolabile", () => {
        // Caso che motiva la scrittura del ratio nel reframe-only: qui lo zoom
        // dell'utente viene ignorato, ed è corretto che lo sia.
        expect(shouldUseLegacyCoverPath(null, 2)).toBe(true);
    });

    it("ratio valorizzato + zoom 1 → legacy: il parametrico coinciderebbe col cover", () => {
        expect(shouldUseLegacyCoverPath(16 / 9, 1)).toBe(true);
    });

    it("ratio valorizzato + zoom 2 → parametrico", () => {
        expect(shouldUseLegacyCoverPath(16 / 9, 2)).toBe(false);
    });

    it("zoom 1.00005 (dentro la tolleranza) → legacy", () => {
        expect(1.00005 - 1).toBeLessThan(ZOOM_EPS);
        expect(shouldUseLegacyCoverPath(16 / 9, 1.00005)).toBe(true);
    });

    it("zoom 1.001 (fuori dalla tolleranza) → parametrico", () => {
        expect(1.001 - 1).toBeGreaterThan(ZOOM_EPS);
        expect(shouldUseLegacyCoverPath(16 / 9, 1.001)).toBe(false);
    });

    it("è simmetrica sotto l'1: zoom 0.999 → parametrico, 0.99995 → legacy", () => {
        expect(shouldUseLegacyCoverPath(1, 0.999)).toBe(false);
        expect(shouldUseLegacyCoverPath(1, 0.99995)).toBe(true);
    });
});
