import { describe, expect, it, vi } from "vitest";
import { checkLeadSend, CRM_LEAD_SEND_BLOCK_LABEL, interpretLeadSendGate } from "./crmLeadSendGate";

describe("interpretLeadSendGate", () => {
    it("lascia passare solo un sì esplicito", () => {
        expect(interpretLeadSendGate([{ r_allowed: true, r_reason: null }], null)).toEqual({ allowed: true });
        expect(interpretLeadSendGate({ r_allowed: true, r_reason: null }, null)).toEqual({ allowed: true });
    });

    it("riporta il motivo del database", () => {
        for (const reason of ["brake", "stop", "suppressed", "no_phone", "no_email", "not_found", "sender_not_allowed"]) {
            expect(interpretLeadSendGate([{ r_allowed: false, r_reason: reason }], null)).toEqual({
                allowed: false,
                reason
            });
        }
    });

    it("ferma l'invio quando la risposta non è chiara", () => {
        const blocked = { allowed: false, reason: "gate_error" };
        expect(interpretLeadSendGate(null, { message: "boom" })).toEqual(blocked);
        expect(interpretLeadSendGate([{ r_allowed: true }], { message: "boom" })).toEqual(blocked);
        expect(interpretLeadSendGate([], null)).toEqual(blocked);
        expect(interpretLeadSendGate(null, null)).toEqual(blocked);
        expect(interpretLeadSendGate([{ r_allowed: "true" }], null)).toEqual(blocked);
        expect(interpretLeadSendGate([{ r_allowed: false, r_reason: "boh" }], null)).toEqual(blocked);
    });

    it("ha un testo per ogni motivo", () => {
        for (const label of Object.values(CRM_LEAD_SEND_BLOCK_LABEL)) expect(label.length).toBeGreaterThan(0);
    });
});

describe("checkLeadSend", () => {
    it("chiama crm_lead_send_gate coi parametri giusti", async () => {
        const rpc = vi.fn().mockResolvedValue({ data: [{ r_allowed: true, r_reason: null }], error: null });
        await expect(checkLeadSend({ rpc }, "c1", "whatsapp", "system")).resolves.toEqual({ allowed: true });
        expect(rpc).toHaveBeenCalledWith("crm_lead_send_gate", {
            p_contact_id: "c1",
            p_channel: "whatsapp",
            p_sender: "system"
        });
    });

    it("trasforma un'eccezione in un no", async () => {
        const rpc = vi.fn().mockRejectedValue(new Error("rete"));
        await expect(checkLeadSend({ rpc }, "c1", "email", "agent")).resolves.toEqual({
            allowed: false,
            reason: "gate_error"
        });
    });
});
