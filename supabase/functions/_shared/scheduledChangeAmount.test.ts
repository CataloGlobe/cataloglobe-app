import { describe, it, expect } from "vitest";
import { isUsableListTotal, previewTotalOrNull } from "./scheduledChangeAmount";

describe("importo del rinnovo nel cambio programmato", () => {
    it("usa il totale del listino quando ha senso", () => {
        expect(isUsableListTotal(5800, 2)).toBe(true);
    });

    it("non prende per buono uno 0 dal listino con sedi da pagare", () => {
        expect(isUsableListTotal(0, 3)).toBe(false);
        expect(isUsableListTotal(null, 3)).toBe(false);
    });

    it("accetta lo 0 dell'anteprima fattura (sconto vero), non un totale mancante", () => {
        expect(previewTotalOrNull(0)).toBe(0);
        expect(previewTotalOrNull(8700)).toBe(8700);
        expect(previewTotalOrNull(undefined)).toBeNull();
        expect(previewTotalOrNull(null)).toBeNull();
        expect(previewTotalOrNull(Number.NaN)).toBeNull();
    });
});
