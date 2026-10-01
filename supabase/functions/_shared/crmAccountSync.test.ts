import { describe, expect, it } from "vitest";
import { nextStageForAccount, normalizeVenueName, pickTenant, stageForSubscription } from "./crmAccountSync";

describe("stageForSubscription", () => {
    it("trialing → In prova, active → Cliente pagante, il resto niente", () => {
        expect(stageForSubscription("trialing")).toBe("in_prova");
        expect(stageForSubscription("active")).toBe("cliente_pagante");
        expect(stageForSubscription("suspended")).toBeNull();
        expect(stageForSubscription("canceled")).toBeNull();
        expect(stageForSubscription(null)).toBeNull();
    });
});

describe("nextStageForAccount", () => {
    it("porta avanti dalle fasi di lavoro", () => {
        expect(nextStageForAccount("contattato", "trialing")).toBe("in_prova");
        expect(nextStageForAccount("chiamata_fatta", "active")).toBe("cliente_pagante");
        expect(nextStageForAccount("in_prova", "active")).toBe("cliente_pagante");
    });

    it("non torna mai indietro e non si ripete", () => {
        expect(nextStageForAccount("cliente_pagante", "trialing")).toBeNull();
        expect(nextStageForAccount("in_prova", "trialing")).toBeNull();
        expect(nextStageForAccount("cliente_pagante", "canceled")).toBeNull();
    });

    it("da Perso esce se l'account parte", () => {
        expect(nextStageForAccount("perso", "trialing")).toBe("in_prova");
        expect(nextStageForAccount("perso", "suspended")).toBeNull();
    });

    it("da Perso non esce sopra uno stop né sopra un Perso deciso dopo il collegamento", () => {
        expect(nextStageForAccount("perso", "active", { lostKind: "stop" })).toBeNull();
        expect(nextStageForAccount("perso", "active", { lostKind: "obiezione", lostAfterLink: true })).toBeNull();
        expect(nextStageForAccount("perso", "active", { lostKind: "obiezione" })).toBe("cliente_pagante");
    });
});

describe("pickTenant", () => {
    const t = (id: string, status: string, created: string) => ({
        id,
        name: id,
        subscription_status: status,
        created_at: created
    });

    it("preferisce active, poi trialing, poi la più recente", () => {
        expect(pickTenant([t("a", "trialing", "2026-10-02"), t("b", "active", "2026-01-01")])?.id).toBe("b");
        expect(pickTenant([t("a", "suspended", "2026-10-02"), t("b", "trialing", "2026-01-01")])?.id).toBe("b");
        expect(pickTenant([t("a", "suspended", "2026-01-01"), t("b", "suspended", "2026-10-01")])?.id).toBe("b");
        expect(pickTenant([])).toBeNull();
    });
});

describe("normalizeVenueName", () => {
    it("ignora maiuscole, accenti e punteggiatura", () => {
        expect(normalizeVenueName("  Caffè  dell'Arte! ")).toBe("caffe dell arte");
        expect(normalizeVenueName("CAFFE' DELL ARTE")).toBe("caffe dell arte");
    });
});
