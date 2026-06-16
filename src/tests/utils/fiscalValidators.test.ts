import { describe, it, expect } from "vitest";
import { isValidPartitaIva, isValidCodiceFiscale } from "@/utils/fiscalValidators";

describe("isValidPartitaIva", () => {
    it("accepts a valid 11-digit P.IVA with correct check digit", () => {
        expect(isValidPartitaIva("12345678903")).toBe(true);
    });

    it("ignores surrounding whitespace", () => {
        expect(isValidPartitaIva("  12345678903 ")).toBe(true);
    });

    it("rejects a wrong check digit", () => {
        expect(isValidPartitaIva("12345678900")).toBe(false);
    });

    it("rejects fewer than 11 digits", () => {
        expect(isValidPartitaIva("1234567890")).toBe(false);
    });

    it("rejects non-numeric input", () => {
        expect(isValidPartitaIva("1234567890A")).toBe(false);
    });
});

describe("isValidCodiceFiscale", () => {
    it("accepts a well-formed persona fisica CF", () => {
        expect(isValidCodiceFiscale("RSSMRA85T10A562S")).toBe(true);
    });

    it("is case-insensitive", () => {
        expect(isValidCodiceFiscale("rssmra85t10a562s")).toBe(true);
    });

    it("accepts an 11-digit ente CF", () => {
        expect(isValidCodiceFiscale("12345678903")).toBe(true);
    });

    it("rejects a 15-char string", () => {
        expect(isValidCodiceFiscale("RSSMRA85T10A562")).toBe(false);
    });

    it("rejects an unstructured string", () => {
        expect(isValidCodiceFiscale("ABC")).toBe(false);
    });
});
