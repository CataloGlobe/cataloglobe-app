import { describe, expect, it } from "vitest";

import {
    parseSearchQuery,
    phoneDigits,
    sanitizeNameQuery,
    SEARCH_MIN_LENGTH,
    SEARCH_PHONE_MIN_DIGITS,
    sortByProximity
} from "@/utils/reservationSearch";

// FASE 5.2b — la ricerca per telefono confronta le sole cifre, sul
// suffisso: chi cerca digita `3331234567`, in tabella c'è `+39 333 123 4567`.

describe("phoneDigits", () => {
    it("tiene solo le cifre", () => {
        expect(phoneDigits("+39 333 123-4567")).toBe("393331234567");
        expect(phoneDigits("(0341) 12.34.56")).toBe("0341123456");
        expect(phoneDigits(null)).toBe("");
    });
});

describe("parseSearchQuery", () => {
    it("cifre, spazi, +, trattini → telefono, ridotto alle cifre", () => {
        expect(parseSearchQuery(" +39 333 123 4567 ")).toEqual({ kind: "phone", digits: "393331234567" });
        expect(parseSearchQuery("3-987")).toEqual({ kind: "phone", digits: "3987" });
    });

    it("lettere → nome, trimmed", () => {
        expect(parseSearchQuery("  Rossi ")).toEqual({ kind: "name", text: "Rossi" });
        expect(parseSearchQuery("Rossi 2")).toEqual({ kind: "name", text: "Rossi 2" });
    });

    it("sotto la lunghezza minima non si cerca: 2 caratteri per un nome, 4 cifre per un telefono", () => {
        expect(parseSearchQuery("")).toBeNull();
        expect(parseSearchQuery("R".repeat(SEARCH_MIN_LENGTH - 1))).toBeNull();
        expect(parseSearchQuery("+ ")).toBeNull();
        expect(parseSearchQuery("3".repeat(SEARCH_PHONE_MIN_DIGITS - 1))).toBeNull();
        expect(parseSearchQuery("+39 3")).toBeNull();
        expect(parseSearchQuery("3".repeat(SEARCH_PHONE_MIN_DIGITS))).toEqual({
            kind: "phone",
            digits: "3".repeat(SEARCH_PHONE_MIN_DIGITS)
        });
    });
});

describe("sanitizeNameQuery", () => {
    it("il nome perde i caratteri riservati da PostgREST e da LIKE", () => {
        expect(sanitizeNameQuery('Ros%si, (O"Brien)_\\')).toBe("Rossi OBrien");
        expect(sanitizeNameQuery("D'Angelo")).toBe("D'Angelo");
    });
});

describe("sortByProximity", () => {
    const r = (id: string, date: string, time = "20:00:00") => ({ id, reservation_date: date, reservation_time: time });

    it("dalla più vicina a oggi; a pari distanza prima il futuro; poi per ora", () => {
        const rows = [
            r("far-past", "2025-11-03"),
            r("far-future", "2027-03-12"),
            r("tomorrow-late", "2026-09-18", "21:00:00"),
            r("yesterday", "2026-09-16"),
            r("today", "2026-09-17"),
            r("tomorrow-early", "2026-09-18", "12:30:00")
        ];
        expect(sortByProximity(rows, "2026-09-17").map(x => x.id)).toEqual([
            "today",
            "tomorrow-early",
            "tomorrow-late",
            "yesterday",
            "far-future",
            "far-past"
        ]);
    });

    it("non muta l'input", () => {
        const rows = [r("b", "2027-01-01"), r("a", "2026-09-17")];
        const copy = rows.map(x => ({ ...x }));
        sortByProximity(rows, "2026-09-17");
        expect(rows).toEqual(copy);
    });
});
