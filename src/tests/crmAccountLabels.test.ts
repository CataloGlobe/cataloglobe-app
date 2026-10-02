import { describe, expect, it } from "vitest";
import { crmAccountLabel, needsStageLock } from "@/utils/crm/accountLabels";

describe("crmAccountLabel", () => {
    it("prova con carta o con codice, con la scadenza", () => {
        expect(
            crmAccountLabel({ account_state: "trialing", trial_kind: "carta", trial_ends_at: "2026-10-31T10:00:00Z" })
        ).toEqual({ label: "Prova con carta · scade il 31/10/2026", variant: "warning" });
        expect(
            crmAccountLabel({ account_state: "trialing", trial_kind: "codice", trial_ends_at: "2026-12-31T23:30:00Z" })
                ?.label
        ).toBe("Prova con codice · scade il 01/01/2027");
    });

    it("tipo ancora da sapere: In prova", () => {
        expect(crmAccountLabel({ account_state: "trialing", trial_kind: null, trial_ends_at: null })?.label).toBe(
            "In prova"
        );
    });

    it("registrato senza prova", () => {
        expect(crmAccountLabel({ account_state: "registrato", trial_kind: null, trial_ends_at: null })?.label).toBe(
            "Registrato, prova non partita"
        );
    });

    it("niente etichetta per gli altri stati", () => {
        expect(crmAccountLabel({ account_state: "active", trial_kind: "carta", trial_ends_at: null })).toBeNull();
        expect(crmAccountLabel({ account_state: null, trial_kind: null, trial_ends_at: null })).toBeNull();
    });
});

describe("needsStageLock", () => {
    it("dentro o fuori da In prova e Cliente pagante", () => {
        expect(needsStageLock("contattato", "in_prova", false)).toBe(true);
        expect(needsStageLock("in_prova", "telefonata_fatta", false)).toBe(true);
        expect(needsStageLock("in_prova", "cliente_pagante", false)).toBe(true);
    });

    it("non per le altre fasi, per Perso o per una carta già bloccata", () => {
        expect(needsStageLock("nuovo", "contattato", false)).toBe(false);
        expect(needsStageLock("in_prova", "perso", false)).toBe(false);
        expect(needsStageLock("contattato", "in_prova", true)).toBe(false);
    });
});
