import { describe, expect, it } from "vitest";
import {
    accountStateFor,
    nextStageForAccount,
    normalizeVenueName,
    pickTenant,
    stageForSubscription,
    trialKindFromMetadata
} from "./crmAccountSync";

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

    it("Perso non lo tocca mai, nemmeno se l'account parte", () => {
        expect(nextStageForAccount("perso", "trialing")).toBeNull();
        expect(nextStageForAccount("perso", "active")).toBeNull();
    });

    it("una fase bloccata a mano non si sposta", () => {
        expect(nextStageForAccount("contattato", "trialing", { locked: true })).toBeNull();
        expect(nextStageForAccount("in_prova", "active", { locked: true })).toBeNull();
    });

    it("registrato senza prova: nessuno spostamento", () => {
        expect(nextStageForAccount("contattato", "suspended")).toBeNull();
    });
});

describe("accountStateFor", () => {
    it("senza subscription è registrato, anche col default suspended", () => {
        expect(accountStateFor({ subscription_status: "suspended", stripe_subscription_id: null })).toBe("registrato");
    });

    it("con subscription segue lo stato", () => {
        expect(accountStateFor({ subscription_status: "trialing", stripe_subscription_id: "sub_1" })).toBe("trialing");
        expect(accountStateFor({ subscription_status: "canceled", stripe_subscription_id: "sub_1" })).toBe("canceled");
        expect(accountStateFor({ subscription_status: "boh", stripe_subscription_id: "sub_1" })).toBe("suspended");
    });
});

describe("trialKindFromMetadata", () => {
    it("trial_no_card = codice, altrimenti carta", () => {
        expect(trialKindFromMetadata({ trial_no_card: "true", tenant_id: "x" })).toBe("codice");
        expect(trialKindFromMetadata({ promotion_code_id: "promo_1" })).toBe("carta");
        expect(trialKindFromMetadata(null)).toBe("carta");
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
