import { describe, expect, it } from "vitest";
import {
    agentCheckMessage,
    CRM_MODEL_OPTIONS,
    crmAgentErrorMessage,
    decisionActionLabel,
    formatUsdInput,
    modelLabel,
    parseUsdCap
} from "@/utils/crm/agentLabels";

describe("parseUsdCap", () => {
    it("accetta virgola, punto, simbolo e spazi", () => {
        expect(parseUsdCap("100")).toBe(100);
        expect(parseUsdCap("12,50")).toBe(12.5);
        expect(parseUsdCap(" 12.5 $")).toBe(12.5);
    });

    it("rifiuta zero, negativi, testo, tre decimali e oltre 10.000", () => {
        for (const text of ["0", "-5", "dieci", "1,234", "10000,01", "", "1.000,00"]) {
            expect(parseUsdCap(text)).toBeNull();
        }
        expect(parseUsdCap("10000")).toBe(10000);
    });

    it("formatUsdInput torna indietro", () => {
        expect(formatUsdInput(12.5)).toBe("12,50");
        expect(parseUsdCap(formatUsdInput(99.99))).toBe(99.99);
    });
});

describe("modelli", () => {
    it("solo modelli del listino, con il nome leggibile", () => {
        expect(CRM_MODEL_OPTIONS.map(o => o.value)).toContain("claude-sonnet-5-5");
        expect(modelLabel("claude-opus-5-5")).not.toBe("claude-opus-5-5");
        expect(modelLabel("claude-sconosciuto")).toBe("claude-sconosciuto");
    });
});

describe("agentCheckMessage", () => {
    it("riuscita: modello, tempo e costo", () => {
        expect(
            agentCheckMessage({ ok: true, model: "claude-x", reply: "ok", cost_usd: 0.00042, latency_ms: 812 })
        ).toBe("claude-x risponde: 812 ms, 0,0004 $.");
    });

    it("fallita: motivo noto, dettaglio solo per l'errore di Claude", () => {
        expect(agentCheckMessage({ ok: false, reason: "day_cap", model: null, detail: "x" })).toBe(
            "Tetto di spesa di oggi raggiunto."
        );
        expect(agentCheckMessage({ ok: false, reason: "api_error", model: null, detail: "http_401" })).toBe(
            "Claude ha risposto con un errore. (http_401)"
        );
        expect(agentCheckMessage({ ok: false, reason: "boh", model: null, detail: null })).toBe(
            "La prova non è riuscita."
        );
    });
});

describe("messaggi", () => {
    it("azioni del diario: etichetta o codice leggibile", () => {
        expect(decisionActionLabel("brake_on")).toBe("Agenti messi in pausa");
        expect(decisionActionLabel("message_sent")).toBe("Messaggio WhatsApp inviato");
        expect(decisionActionLabel("call_booked")).toBe("call booked");
    });

    it("errori delle funzioni crm_*", () => {
        expect(crmAgentErrorMessage({ message: "brake_release_needs_person" })).toBe(
            "Per riattivare gli agenti serve una persona."
        );
        expect(crmAgentErrorMessage(new Error('violates check constraint "crm_settings_ai_day_cap_within_month"'))).toBe(
            "Il tetto di oggi non può superare quello del mese."
        );
        expect(crmAgentErrorMessage(null)).toBe("Qualcosa non ha funzionato. Riprova.");
    });
});
