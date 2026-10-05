import { describe, expect, it } from "vitest";
import {
    CAP_MAX_EUR,
    agentCheckMessage,
    CRM_MODEL_OPTIONS,
    crmAgentErrorMessage,
    decisionActionLabel,
    draftStatusLabel,
    formatCapInput,
    modelLabel,
    parseEurCap
} from "@/utils/crm/agentLabels";
import { eurToUsd } from "@shared/crmAi";

describe("parseEurCap", () => {
    it("accetta virgola, punto, simbolo e spazi", () => {
        expect(parseEurCap("100")).toBe(100);
        expect(parseEurCap("12,50")).toBe(12.5);
        expect(parseEurCap(" 12.5 €")).toBe(12.5);
    });

    it("rifiuta zero, negativi, testo, tre decimali e oltre il massimo", () => {
        for (const text of ["0", "-5", "dieci", "1,234", `${CAP_MAX_EUR + 1}`, "", "1.000,00"]) {
            expect(parseEurCap(text)).toBeNull();
        }
        expect(parseEurCap(`${CAP_MAX_EUR}`)).toBe(CAP_MAX_EUR);
        // Il massimo in euro, riportato in dollari, sta nel limite del database.
        expect(eurToUsd(CAP_MAX_EUR)).toBeLessThanOrEqual(10_000);
    });

    it("formatCapInput mostra in euro e torna ai dollari", () => {
        expect(formatCapInput(100)).toBe("86,00");
        expect(eurToUsd(parseEurCap(formatCapInput(116.28)) as number)).toBe(116.28);
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
        ).toBe("claude-x risponde: 812 ms, 0,0004 €.");
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

describe("agente in prova (F1-3)", () => {
    it("fiducia in una riga", async () => {
        const { describeTrust } = await import("@/utils/crm/agentLabels");
        expect(describeTrust({ approved_in_row: 1, total_approved: 3, total_edited: 1, total_discarded: 0 })).toBe(
            "1 approvata di fila senza modifiche · in tutto 3 approvate, 1 corrette, 0 scartate"
        );
        expect(describeTrust({ approved_in_row: 4, total_approved: 4, total_edited: 0, total_discarded: 0 })).toContain("4 approvate di fila");
    });
});

describe("riattivazione (F1-6)", () => {
    it("segnaposti ammessi", async () => {
        const { reactivationTextError } = await import("@/utils/crm/agentLabels");
        expect(reactivationTextError("")).toBeNull();
        expect(reactivationTextError("Ciao {nome}, sono {mittente} di CataloGlobe: {locale} come va?")).toBeNull();
        expect(reactivationTextError("Ciao {giorno}")).toBe("Segnaposto sconosciuto: {giorno}.");
        expect(reactivationTextError("x".repeat(1001))).toBe("Al massimo 1000 caratteri.");
    });
});

describe("uscita dalla prova (F1-7)", () => {
    it("stato del tipo", async () => {
        const { describeTrust } = await import("@/utils/crm/agentLabels");
        expect(describeTrust({ approved_in_row: 2, total_approved: 2, total_edited: 0, total_discarded: 0, required_in_row: 5, autonomous: false })).toContain(
            "in prova (ne servono 5 di fila e 3 giorni)"
        );
        expect(describeTrust({ approved_in_row: 6, total_approved: 6, total_edited: 0, total_discarded: 0, required_in_row: 5, autonomous: true, total_auto: 4 })).toMatch(
            /^fuori dalla prova · .*4 partite da sole$/
        );
    });
});

describe("draftStatusLabel", () => {
    it("«Gestita» dice quale esito, dal motivo", () => {
        expect(draftStatusLabel("handled", "È uno stop.")).toBe("Stop");
        expect(draftStatusLabel("handled", "Obiezione, non stop.")).toBe("«Non adesso»");
        expect(draftStatusLabel("handled", "Proponi altri orari.")).toBe("Altri orari");
        expect(draftStatusLabel("handled", null)).toBe("Gestita da una persona");
        expect(draftStatusLabel("sent", "È uno stop.")).toBe("Inviata così");
        expect(draftStatusLabel("handled", "Messo in Perso.")).toBe("Messo in Perso");
        expect(draftStatusLabel("discarded", null, "lost_proposal")).toBe("Resta aperto");
        expect(draftStatusLabel("sent", "Inviata in autonomia.")).toBe("Partita da sola");
        expect(draftStatusLabel("sent", "Era sbagliata.")).toBe("Partita da sola, era sbagliata");
    });
});

describe("azioni del Diario dell'agente in prova", () => {
    it("in italiano, mai il codice", () => {
        for (const a of ["lead_stop", "draft_created", "draft_sent", "draft_edited", "draft_discard", "draft_handle", "draft_stop", "draft_objection", "draft_other", "call_from_agent", "draft_lost", "draft_auto_sent", "draft_wrong", "reactivation_lost", "autonomy_on", "autonomy_off", "replies_on", "replies_off", "followups_on", "followups_off", "gea_note", "gea_move_stage", "gea_assign", "gea_pause", "gea_resume", "gea_refused"]) {
            expect(decisionActionLabel(a)).not.toBe(a.replace(/_/g, " "));
        }
    });
});
