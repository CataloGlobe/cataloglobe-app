import { describe, expect, it } from "vitest";
import { leadToVerify } from "@/utils/crm/venueNameCheck";
import type { CrmEvent, CrmLead } from "@/types/crm";

function lead(overrides: Partial<CrmLead>): CrmLead {
    return {
        id: "l",
        venue_id: "v",
        contact_id: null,
        source: "landing",
        source_ref: null,
        ad_id: null,
        ad_name: null,
        campaign: null,
        form_answers: {},
        interests: [],
        consent_at: null,
        consent_text: null,
        received_at: "2026-10-01T10:00:00Z",
        created_at: "2026-10-01T10:00:00Z",
        notified_at: null,
        contact_name_given: "Mario",
        venue_name_given: "Pizzeria Gino",
        venue_name_match: null,
        venue_name_check: null,
        ...overrides
    };
}

describe("leadToVerify", () => {
    it("niente da verificare con nomi uguali o senza confronto", () => {
        expect(leadToVerify([lead({}), lead({ id: "b", venue_name_match: "same" })])).toBeNull();
    });

    it("prende l'ultimo tornato con un nome diverso non ancora deciso", () => {
        const older = lead({ id: "a", venue_name_match: "typo", received_at: "2026-10-01T10:00:00Z" });
        const newer = lead({ id: "b", venue_name_match: "other", received_at: "2026-10-02T10:00:00Z" });
        expect(leadToVerify([older, newer])?.id).toBe("b");
    });

    it("«Decido dopo» resta da verificare, «È lo stesso locale» no", () => {
        expect(leadToVerify([lead({ venue_name_match: "other", venue_name_check: "later" })])?.id).toBe("l");
        expect(leadToVerify([lead({ venue_name_match: "other", venue_name_check: "same" })])).toBeNull();
    });

    it("«È lo stesso locale» chiude anche le richieste prima", () => {
        const older = lead({ id: "a", venue_name_match: "typo", venue_name_check: "later", received_at: "2026-10-01T10:00:00Z" });
        const newer = lead({ id: "b", venue_name_match: "other", venue_name_check: "same", received_at: "2026-10-02T10:00:00Z" });
        expect(leadToVerify([older, newer])).toBeNull();
    });

    it("una rinomina chiude le richieste entrate prima, non quelle dopo", () => {
        const renamed: CrmEvent = {
            id: "e",
            created_at: "2026-10-02T09:00:00Z",
            venue_id: "v",
            lead_id: null,
            type: "venue_renamed",
            actor_user_id: null,
            payload: {}
        };
        const before = lead({ venue_name_match: "typo", venue_name_check: "later" });
        expect(leadToVerify([before], [renamed])).toBeNull();

        // Un CSV importato dopo la rinomina con una data di invio vecchia resta da decidere.
        const after = lead({
            id: "b",
            venue_name_match: "other",
            received_at: "2026-09-30T10:00:00Z",
            created_at: "2026-10-02T10:00:00Z"
        });
        expect(leadToVerify([before, after], [renamed])?.id).toBe("b");
    });
});
