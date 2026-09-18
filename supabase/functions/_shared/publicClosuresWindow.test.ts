import { describe, expect, it } from "vitest";

import { publicClosuresWindow } from "./publicClosuresWindow";

// FASE 5.5 — il payload pubblico porta le chiusure dell'orizzonte di
// prenotazione, non «le prime dieci».

describe("publicClosuresWindow", () => {
    it("da oggi a oggi + orizzonte − 1, come il cancello", () => {
        expect(publicClosuresWindow("2026-09-18", 90)).toEqual({ fromIso: "2026-09-18", toIso: "2026-12-16" });
    });

    it("orizzonte 1 = solo oggi; valori non validi valgono 1", () => {
        expect(publicClosuresWindow("2026-09-18", 1)).toEqual({ fromIso: "2026-09-18", toIso: "2026-09-18" });
        expect(publicClosuresWindow("2026-09-18", 0)).toEqual({ fromIso: "2026-09-18", toIso: "2026-09-18" });
        expect(publicClosuresWindow("2026-09-18", Number.NaN)).toEqual({ fromIso: "2026-09-18", toIso: "2026-09-18" });
    });

    it("scavalca il cambio di mese e di anno", () => {
        expect(publicClosuresWindow("2026-12-30", 5).toIso).toBe("2027-01-03");
    });
});
