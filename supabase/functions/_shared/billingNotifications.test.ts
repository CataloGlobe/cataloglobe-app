import { describe, it, expect } from "vitest";
import {
    buildPaymentFailedNotify,
    buildTrialEndingNotify,
    formatUnixDateIt
} from "./billingNotifications";

const TENANT = { id: "t1", name: "Trattoria" };

describe("billingNotifications", () => {
    it("pagamento fallito: owner, un avviso per fattura", () => {
        const n = buildPaymentFailedNotify(TENANT, "in_1");
        expect(n.eventType).toBe("billing.payment_failed");
        expect(n.recipients).toEqual({ tenantOwner: true });
        expect(n.tenantId).toBe("t1");
        expect(n.data).toMatchObject({ tenant_name: "Trattoria" });
        expect(n.dedupeKey).toBe("billing:payment_failed:in_1");
    });

    it("nome mancante → testo generico", () => {
        expect(buildPaymentFailedNotify({ id: "t1", name: null }, "in_1").data?.tenant_name).toBe(
            "la tua attività"
        );
    });

    it("prova in scadenza: data in italiano, ora di Roma", () => {
        // 2026-11-14 23:30 UTC = 15 novembre a Roma
        const end = Date.UTC(2026, 10, 14, 23, 30) / 1000;
        const n = buildTrialEndingNotify(TENANT, "sub_1", end);
        expect(n?.eventType).toBe("billing.trial_ending");
        expect(n?.data?.trial_end_label).toBe("15 novembre 2026");
        expect(n?.dedupeKey).toBe(`billing:trial_ending:sub_1:${end}`);
    });

    it("senza data di fine prova → niente avviso", () => {
        expect(buildTrialEndingNotify(TENANT, "sub_1", null)).toBeNull();
        expect(formatUnixDateIt(0)).toBeNull();
    });
});
