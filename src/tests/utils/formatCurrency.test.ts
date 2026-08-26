import { describe, it, expect } from "vitest";
import { formatCurrency, formatDecimal } from "@/utils/formatCurrency";

// Convenzione italiana: virgola decimale, punto per le migliaia, simbolo
// ANTEPOSTO con spazio ("€ 22,00") — la posizione del simbolo replica quella
// già in uso nel PDF, non quella di `Intl` con style:"currency" ("22,00 €").
describe("formatDecimal", () => {
    it("formatta un intero con due decimali", () => {
        expect(formatDecimal(22)).toBe("22,00");
    });

    it("completa il secondo decimale mancante", () => {
        expect(formatDecimal(5.5)).toBe("5,50");
    });

    it("formatta lo zero", () => {
        expect(formatDecimal(0)).toBe("0,00");
    });

    // Comportamento dichiarato: grouping SEMPRE attivo. CLDR per `it` ha
    // minimumGroupingDigits=2 → il default di Intl produrrebbe "1234,50" a 4
    // cifre intere (e "12.345,00" da 5 in su): incoerenza su un listino.
    it("usa il punto come separatore delle migliaia (forma italiana)", () => {
        expect(formatDecimal(1234.5)).toBe("1.234,50");
        expect(formatDecimal(12345)).toBe("12.345,00");
    });

    it("arrotonda oltre la seconda cifra decimale", () => {
        expect(formatDecimal(2.555)).toBe("2,56");
    });

    it("mantiene il segno sui negativi", () => {
        expect(formatDecimal(-3.5)).toBe("-3,50");
    });
});

describe("formatCurrency", () => {
    it("antepone il simbolo euro con uno spazio", () => {
        expect(formatCurrency(22)).toBe("€ 22,00");
        expect(formatCurrency(1234.5)).toBe("€ 1.234,50");
    });

    it("accetta un simbolo di valuta custom", () => {
        expect(formatCurrency(10, "$")).toBe("$ 10,00");
    });
});
