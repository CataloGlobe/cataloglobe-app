import { describe, expect, it } from "vitest";
import { crmErrorMessage } from "@/utils/crm/stages";

describe("crmErrorMessage", () => {
    it("riconosce «niente da verificare» dal codice VN001, non dal testo", () => {
        expect(crmErrorMessage({ code: "VN001", message: "qualunque testo" })).toBe(
            "Non c'è un nome del locale da verificare."
        );
        expect(crmErrorMessage({ code: "22023", message: "nothing_to_verify" })).toBe(
            "Qualcosa non ha funzionato. Riprova."
        );
    });

    it("legge il messaggio anche da un errore PostgREST che non è un Error", () => {
        expect(crmErrorMessage({ code: "22023", message: "invalid_phone" })).toBe("Il telefono non è valido.");
        expect(crmErrorMessage(new Error("venue_not_found"))).toBe("Questo locale non esiste più.");
    });

    it("ripiega sul messaggio generico", () => {
        expect(crmErrorMessage(null)).toBe("Qualcosa non ha funzionato. Riprova.");
        expect(crmErrorMessage("boh")).toBe("Qualcosa non ha funzionato. Riprova.");
    });
});
