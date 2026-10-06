import { describe, expect, it } from "vitest";
import { legacyTabTarget } from "@/utils/navLanding";

// Voci, gruppi e atterraggio sono passati a `navModel` (§51): i loro test
// stanno in `navModel.test.ts`. Qui restano i vecchi `?tab=` della Scheda.

describe("legacyTabTarget — i vecchi ?tab= della scheda", () => {
    it("porta alla rotta e all'ancora", () => {
        expect(legacyTabTarget("hours")).toEqual({ segment: "orari" });
        expect(legacyTabTarget("ordering")).toEqual({ segment: "ordini-al-tavolo" });
        expect(legacyTabTarget("reservations")).toEqual({ segment: "prenotazioni-online" });
        expect(legacyTabTarget("availability")).toEqual({ segment: "cosa-vedono" });
    });

    it("la Sala è una tab della Scheda (correzioni UI SV3)", () => {
        expect(legacyTabTarget("sala")).toEqual({ segment: "sala" });
        expect(legacyTabTarget("tables")).toEqual({ segment: "sala" });
    });

    it("la sala del momento è l'Elenco di Servizio", () => {
        expect(legacyTabTarget("service")).toEqual({ segment: "servizio", search: "modo=elenco" });
    });

    it("un valore sconosciuto apre l'Anagrafica", () => {
        expect(legacyTabTarget("boh")).toEqual({ segment: "anagrafica" });
    });
});
