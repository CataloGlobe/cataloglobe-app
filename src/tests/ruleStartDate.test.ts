import { describe, expect, it } from "vitest";
import { isStartDateInPast } from "@/utils/ruleStartDate";

const TODAY = "2026-09-24";

describe("isStartDateInPast", () => {
    it("nessuna data di inizio: nessun errore", () => {
        expect(isStartDateInPast("", "", TODAY)).toBe(false);
    });

    it("data di inizio oggi o futura: nessun errore", () => {
        expect(isStartDateInPast(TODAY, "", TODAY)).toBe(false);
        expect(isStartDateInPast("2026-10-01", "", TODAY)).toBe(false);
    });

    it("regola nuova con inizio nel passato: errore", () => {
        expect(isStartDateInPast("2026-09-20", "", TODAY)).toBe(true);
    });

    it("regola già partita, data invariata: nessun errore (si può salvare)", () => {
        expect(isStartDateInPast("2026-09-01", "2026-09-01", TODAY)).toBe(false);
    });

    it("regola già partita, data spostata a un altro giorno passato: errore", () => {
        expect(isStartDateInPast("2026-08-15", "2026-09-01", TODAY)).toBe(true);
    });

    it("data futura spostata nel passato: errore", () => {
        expect(isStartDateInPast("2026-09-20", "2026-10-01", TODAY)).toBe(true);
    });
});
