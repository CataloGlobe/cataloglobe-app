import { describe, it, expect } from "vitest";
import { resolvePriceMode, shouldConfirmRevertToUnico } from "@/pages/Dashboard/Products/priceMode";

describe("resolvePriceMode", () => {
    it("senza override deriva dai dati: nessun gruppo → unico", () => {
        expect(resolvePriceMode(null, false)).toBe("unico");
    });

    it("senza override deriva dai dati: gruppo presente → formato", () => {
        expect(resolvePriceMode(null, true)).toBe("formato");
    });

    it("override 'formato' senza gruppo → formato (finestra pre-creazione lazy)", () => {
        expect(resolvePriceMode("formato", false)).toBe("formato");
    });

    it("override 'unico' con gruppo presente → unico", () => {
        expect(resolvePriceMode("unico", true)).toBe("unico");
    });

    it("override azzerato dopo la scrittura: torna autoritativa la derivazione", () => {
        expect(resolvePriceMode(null, true)).toBe("formato");
        expect(resolvePriceMode(null, false)).toBe("unico");
    });
});

describe("shouldConfirmRevertToUnico", () => {
    it("nessun gruppo → nessun modale", () => {
        expect(shouldConfirmRevertToUnico(null)).toBe(false);
    });

    it("gruppo con 0 valori → nessun modale (niente da perdere)", () => {
        expect(shouldConfirmRevertToUnico({ values: [] })).toBe(false);
    });

    it("gruppo con 1 valore → modale", () => {
        expect(shouldConfirmRevertToUnico({ values: [{ id: "a" }] })).toBe(true);
    });

    it("gruppo con piu' valori → modale", () => {
        expect(shouldConfirmRevertToUnico({ values: [{ id: "a" }, { id: "b" }] })).toBe(true);
    });
});
