import { describe, it, expect } from "vitest";
import { formatPriceSummary } from "@/utils/formatPriceSummary";
import { resolvePriceSummary } from "@/utils/priceSummary";

// Formato "€ X,XX" (simbolo anteposto, spazio, virgola decimale italiana
// via formatCurrency) e prefisso "da ". Il simbolo resta PRIMA del numero:
// è la convenzione già in uso nel PDF, unico consumer produttivo.
// Pagina pubblica e backoffice hanno ancora convenzioni proprie (toFixed
// col punto, simbolo dopo): migrazione fuori perimetro, task Notion.
describe("formatPriceSummary", () => {
    it("returns null when there is no price", () => {
        expect(formatPriceSummary(resolvePriceSummary([]))).toBeNull();
    });

    it("formats a single price without a 'da' prefix", () => {
        expect(formatPriceSummary(resolvePriceSummary([10]))).toBe("€ 10,00");
    });

    it("formats multiple prices with the 'da' prefix on the minimum", () => {
        expect(formatPriceSummary(resolvePriceSummary([90, 10]))).toBe("da € 10,00");
    });

    it("respects a custom currency symbol", () => {
        expect(
            formatPriceSummary(resolvePriceSummary([10]), { currencySymbol: "$" })
        ).toBe("$ 10,00");
        expect(
            formatPriceSummary(resolvePriceSummary([90, 10]), { currencySymbol: "$" })
        ).toBe("da $ 10,00");
    });

    it("accepts a context option without changing today's output (reserved for future use)", () => {
        expect(
            formatPriceSummary(resolvePriceSummary([90, 10]), { context: "backoffice" })
        ).toBe("da € 10,00");
    });

    // Regressione mirata sui bug #6/#9: un gruppo con un solo valore
    // prezzato deve produrre il prezzo secco, mai "da X" — anche quando il
    // chiamante ha un secondo valore raw senza prezzo (bug #8's cugino).
    it("shows the plain price, not 'da X', when only one value has a valid price (bugs #6/#8/#9 regression)", () => {
        expect(formatPriceSummary(resolvePriceSummary([10, null]))).toBe("€ 10,00");
    });
});
