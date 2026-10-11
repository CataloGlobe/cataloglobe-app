import { describe, expect, it } from "vitest";
import { legacyTabTarget } from "@/utils/navLanding";

// Voci, gruppi e atterraggio sono passati a `navModel` (§51): i loro test
// stanno in `navModel.test.ts`. Qui restano i vecchi `?tab=` della Scheda.

describe("legacyTabTarget — i vecchi ?tab= della scheda", () => {
    it("porta alla parte della Scheda (C+++)", () => {
        expect(legacyTabTarget("hours")).toEqual({ segment: "anagrafica", search: "parte=orari" });
        expect(legacyTabTarget("ordering")).toEqual({ segment: "anagrafica", search: "parte=ordini" });
        expect(legacyTabTarget("reservations")).toEqual({ segment: "anagrafica", search: "parte=prenotazioni" });
        expect(legacyTabTarget("settings")).toEqual({ segment: "anagrafica", search: "parte=link" });
        expect(legacyTabTarget("availability")).toEqual({ segment: "cosa-vedono" });
    });

    it("la Sala è un modo di Servizio (Officina 3)", () => {
        expect(legacyTabTarget("sala")).toEqual({ segment: "servizio", search: "modo=sala" });
        expect(legacyTabTarget("tables")).toEqual({ segment: "servizio", search: "modo=sala" });
    });

    it("la sala del momento è l'Elenco di Servizio", () => {
        expect(legacyTabTarget("service")).toEqual({ segment: "servizio", search: "modo=elenco" });
    });

    it("un valore sconosciuto apre l'Anagrafica", () => {
        expect(legacyTabTarget("boh")).toEqual({ segment: "anagrafica" });
    });
});
