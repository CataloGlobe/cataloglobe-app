import { describe, expect, it } from "vitest";
import { leadAnswerRows } from "@/utils/crm/leadAnswers";
import type { CrmLead } from "@/types/crm";

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
        notified_at: null,
        contact_name_given: null,
        venue_name_given: null,
        venue_name_match: null,
        venue_name_check: null,
        ...overrides
    };
}

describe("leadAnswerRows", () => {
    it("landing: cosa ha scritto, niente campi tecnici", () => {
        const rows = leadAnswerRows(
            lead({
                contact_name_given: "Mario Rossi",
                venue_name_given: "Pizzeria Gino",
                interests: ["menu", "prenotazioni"],
                form_answers: {
                    variant: "b",
                    landing_path: "/b",
                    utm_source: "facebook",
                    referrer: "https://x",
                    email: "mario@example.com"
                }
            })
        );
        expect(rows).toEqual([
            { label: "Nome", value: "Mario Rossi" },
            { label: "Locale", value: "Pizzeria Gino" },
            { label: "Email", value: "mario@example.com" },
            { label: "Interessi", value: "menu, prenotazioni" }
        ]);
    });

    it("modulo Meta senza locale lo dice, le altre risposte restano", () => {
        const rows = leadAnswerRows(
            lead({
                source: "meta_form",
                contact_name_given: "Anna",
                form_answers: { quanti_coperti_hai: "80", vuota: " " }
            })
        );
        expect(rows).toEqual([
            { label: "Nome", value: "Anna" },
            { label: "Locale", value: "Il modulo Meta non lo chiede" },
            { label: "Quanti coperti hai", value: "80" }
        ]);
    });

    it("telefono scritto male in evidenza", () => {
        const rows = leadAnswerRows(lead({ form_answers: { phone_raw: "333 12" } }));
        expect(rows).toEqual([{ label: "Telefono scritto (non valido)", value: "333 12" }]);
    });

    it("dati vecchi senza nome né locale: solo quello che c'è", () => {
        expect(leadAnswerRows(lead({ source: "manuale" }))).toEqual([]);
    });
});
