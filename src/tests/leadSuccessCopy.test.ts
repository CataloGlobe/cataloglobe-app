import { describe, expect, it } from "vitest";
import { leadSuccessCopy } from "@/pages/CampaignLanding/components/sections/Contact/successCopy";

describe("leadSuccessCopy", () => {
    it("usa la prima parola del nome, senza spazi attorno", () => {
        expect(leadSuccessCopy("  Marco Rossi ", "333 1234567").title).toBe("Grazie Marco, richiesta ricevuta.");
    });

    it("senza nome dice solo che la richiesta è arrivata", () => {
        expect(leadSuccessCopy("   ", "333 1234567").title).toBe("Richiesta ricevuta.");
    });

    it("ripete il telefono come l'ha scritto l'utente, solo trim", () => {
        expect(leadSuccessCopy("Marco", "  +39 333-123 4567 ").phone).toBe("+39 333-123 4567");
    });

    it("senza telefono non lascia un buco nella frase (vale la frase senza numero)", () => {
        expect(leadSuccessCopy("Marco", " ").phone).toBeNull();
    });
});
