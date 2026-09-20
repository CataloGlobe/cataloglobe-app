import { describe, expect, it } from "vitest";

import { publicClosuresWindow } from "./publicClosuresWindow";

// FASE 5.5 — il payload pubblico porta le chiusure dell'orizzonte di
// prenotazione, non «le prime dieci»; e parte da ieri, perché la coda
// notturna di ieri è la mattina di oggi.

describe("publicClosuresWindow", () => {
    it("da ieri a oggi + orizzonte − 1: il cancello più la coda notturna", () => {
        expect(publicClosuresWindow("2026-09-18", 90)).toEqual({ fromIso: "2026-09-17", toIso: "2026-12-16" });
    });

    it("orizzonte 1 = solo oggi; valori non validi valgono 1", () => {
        expect(publicClosuresWindow("2026-09-18", 1)).toEqual({ fromIso: "2026-09-17", toIso: "2026-09-18" });
        expect(publicClosuresWindow("2026-09-18", 0)).toEqual({ fromIso: "2026-09-17", toIso: "2026-09-18" });
        expect(publicClosuresWindow("2026-09-18", Number.NaN)).toEqual({ fromIso: "2026-09-17", toIso: "2026-09-18" });
    });

    it("scavalca il cambio di mese e di anno", () => {
        expect(publicClosuresWindow("2026-12-30", 5).toIso).toBe("2027-01-03");
        expect(publicClosuresWindow("2027-01-01", 5).fromIso).toBe("2026-12-31");
    });
});
