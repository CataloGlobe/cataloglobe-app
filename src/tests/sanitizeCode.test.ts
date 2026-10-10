import { describe, expect, it } from "vitest";
import { sanitizeCode } from "@/components/ui/CodeInput/sanitizeCode";

describe("sanitizeCode", () => {
    it("tiene solo le cifre", () => {
        expect(sanitizeCode("482 913", 6)).toBe("482913");
        expect(sanitizeCode("Codice: 482-913", 6)).toBe("482913");
    });

    it("taglia alla lunghezza del codice", () => {
        expect(sanitizeCode("4829131", 6)).toBe("482913");
    });

    it("vuoto se non ci sono cifre", () => {
        expect(sanitizeCode("abc", 6)).toBe("");
    });
});
