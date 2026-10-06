import { describe, expect, it } from "vitest";
import { channelHealth, messageAuthorLabel, messageStatusLine, messageText, parseTestNumbers, waErrorMessage } from "@/utils/crm/waLabels";
import type { CrmWaChannel } from "@/types/crm";

const NOW = new Date("2026-10-05T10:00:00Z");
const channel = (patch: Partial<CrmWaChannel>): CrmWaChannel => ({
    last_heartbeat_at: "2026-10-05T09:58:00Z",
    wa_state: "ok",
    wa_state_detail: null,
    wa_state_at: null,
    worker_version: null,
    failures_in_row: 0,
    next_send_at: null,
    silent_alerted_at: null,
    ...patch
});

describe("messaggi", () => {
    it("autore", () => {
        expect(messageAuthorLabel({ author: "lead", purpose: null })).toBe("Lead");
        expect(messageAuthorLabel({ author: "person", purpose: null })).toBe("Scritto a mano");
        expect(messageAuthorLabel({ author: "agent", purpose: "first_message" })).toBe("Agente, primo messaggio");
        expect(messageAuthorLabel({ author: "agent", purpose: "reply" })).toBe("Agente");
    });
    it("testo", () => {
        expect(messageText({ body: "Ciao", kind: "text", purpose: null, status: null })).toBe("Ciao");
        expect(messageText({ body: "menu", kind: "image", purpose: null, status: null })).toBe("Foto: menu");
        expect(messageText({ body: null, kind: "voice", purpose: null, status: null })).toBe("Vocale, da ascoltare su WhatsApp");
        expect(messageText({ body: null, kind: "text", purpose: "first_message", status: "queued" })).toContain("al momento dell'invio");
    });
    it("stato", () => {
        expect(messageStatusLine({ status: null, status_reason: null })).toBeNull();
        expect(messageStatusLine({ status: "sent", status_reason: null })).toBe("Inviato");
        expect(messageStatusLine({ status: "cancelled", status_reason: "Locale in Perso." })).toBe("Annullato: Locale in Perso.");
    });
});

describe("channelHealth", () => {
    it("mai collegato, muto, da ricollegare, avviso, fallimenti, ok", () => {
        expect(channelHealth(null, NOW).label).toBe("Mai collegato");
        expect(channelHealth(channel({ last_heartbeat_at: null }), NOW).label).toBe("Mai collegato");
        expect(channelHealth(channel({ last_heartbeat_at: "2026-10-05T09:40:00Z" }), NOW).variant).toBe("danger");
        expect(channelHealth(channel({ wa_state: "needs_relink" }), NOW).label).toBe("Da ricollegare");
        expect(channelHealth(channel({ wa_state: "warning", wa_state_detail: "Telefono offline" }), NOW).detail).toContain("Telefono offline");
        expect(channelHealth(channel({ failures_in_row: 2 }), NOW).detail).toContain("2 invii falliti");
        expect(channelHealth(channel({}), NOW)).toMatchObject({ label: "Collegato", variant: "success" });
    });
});

describe("parseTestNumbers", () => {
    it("normalizza, toglie doppioni, segnala gli errori", () => {
        expect(parseTestNumbers("+39 333 123 4567\n0039.333.123.4567, 3331234567\n\n+44 7700 900123")).toEqual({
            numbers: ["+393331234567", "+447700900123"],
            invalid: ["3331234567"]
        });
        expect(parseTestNumbers("")).toEqual({ numbers: [], invalid: [] });
    });
});

describe("waErrorMessage", () => {
    it("codici noti e ripiego", () => {
        expect(waErrorMessage(new Error("message_not_cancellable"))).toContain("non è più in coda");
        expect(waErrorMessage(new Error('violates check constraint "crm_settings_wa_test_numbers_check"'))).toContain("prefisso");
        expect(waErrorMessage("boh")).toBe("Operazione non riuscita. Riprova.");
    });
});

describe("messaggi della telefonata (F1-4a)", () => {
    it("chi scrive e testo in coda", () => {
        expect(messageAuthorLabel({ author: "agent", purpose: "call_confirm" })).toBe("Agente, conferma della telefonata");
        expect(messageAuthorLabel({ author: "agent", purpose: "call_reminder" })).toBe("Agente, promemoria della telefonata");
        expect(messageText({ body: null, kind: "text", purpose: "call_reminder", status: "queued" })).toContain(
            "impostazioni dell'agenda"
        );
    });
});
