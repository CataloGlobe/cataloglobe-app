import { describe, expect, it } from "vitest";
import type { CrmAgentDecision, CrmAgentDraftRow, CrmMessage } from "@/types/crm";
import { arrivedToday, giroItems, GIRO_ITEMS_LIMIT, type GiroSources } from "@/utils/crm/giroSteps";

// Lunedì 5 ottobre 2026, 11:00 di Roma
const NOW = new Date("2026-10-05T09:00:00Z");

let seq = 0;
const id = () => `id-${seq++}`;

function draft(p: Partial<CrmAgentDraftRow>): CrmAgentDraftRow {
    return {
        id: id(),
        created_at: "2026-10-05T08:00:00Z",
        venue_id: "v1",
        venue_name: "Bar Roma",
        kind: "reply",
        status: "pending",
        reason: null,
        proposed_text: "Ciao, con due sedi sono 59 € al mese.",
        final_text: null,
        decided_at: null,
        ...p
    };
}

function message(p: Partial<CrmMessage>): CrmMessage {
    return {
        id: id(),
        created_at: "2026-10-05T07:30:00Z",
        venue_id: "v1",
        contact_id: null,
        lead_id: null,
        direction: "in",
        author: "lead",
        kind: "text",
        body: "Quanto costa?",
        purpose: null,
        status: null,
        status_reason: null,
        sent_at: null,
        appointment_id: null,
        ...p
    };
}

function decision(p: Partial<CrmAgentDecision>): CrmAgentDecision {
    return {
        id: id(),
        created_at: "2026-10-05T08:30:00Z",
        actor: "reviewer",
        actor_user_id: null,
        action: "draft_reviewed",
        reason: "",
        venue_id: "v1",
        lead_id: null,
        review_outcome: "ok",
        decided_by: null,
        decided_at: null,
        payload: {},
        ...p
    };
}

function sources(p: Partial<GiroSources>): GiroSources {
    return { messages: [], drafts: [], decisions: [], venueName: v => (v === "v1" ? "Bar Roma" : "Bar Luna"), now: NOW, ...p };
}

describe("giroItems", () => {
    it("passo 1: solo i messaggi arrivati oggi, i più recenti prima, con lo stato della risposta", () => {
        const items = giroItems(
            1,
            sources({
                messages: [
                    message({ created_at: "2026-10-04T15:00:00Z", body: "ieri" }),
                    message({ created_at: "2026-10-05T07:30:00Z", body: "prima" }),
                    message({ created_at: "2026-10-05T08:40:00Z", venue_id: "v2", body: "dopo" }),
                    message({ direction: "out", author: "agent", body: "nostro" })
                ],
                drafts: [draft({ created_at: "2026-10-05T07:31:00Z" })]
            })
        );
        expect(items.map(i => i.text)).toEqual(["dopo", "prima"]);
        expect(items[0]).toMatchObject({ venueName: "Bar Luna", tag: "da rispondere" });
        expect(items[1]).toMatchObject({ venueName: "Bar Roma", tag: "bozza pronta", tone: "brand", when: "09:30" });
    });

    it("passo 1: un vocale si dice per tipo", () => {
        const [item] = giroItems(1, sources({ messages: [message({ kind: "voice", body: null })] }));
        expect(item.text).toBe("Messaggio vocale");
    });

    it("passo 2: le bozze di oggi con il loro esito", () => {
        const items = giroItems(2, sources({ drafts: [draft({ status: "edited" }), draft({ created_at: "2026-10-04T08:00:00Z" })] }));
        expect(items).toHaveLength(1);
        expect(items[0]).toMatchObject({ tag: "corretta e partita", tone: "success" });
    });

    it("passo 3: le riletture, quella fermata col perché", () => {
        const items = giroItems(
            3,
            sources({
                decisions: [
                    decision({
                        review_outcome: "rejected",
                        reason: "Promette uno sconto che non esiste",
                        created_at: "2026-10-05T08:50:00Z"
                    }),
                    decision({}),
                    decision({ review_outcome: null })
                ]
            })
        );
        expect(items).toHaveLength(2);
        expect(items[0]).toMatchObject({ tag: "fermata", tone: "danger", text: "Promette uno sconto che non esiste" });
        expect(items[1]).toMatchObject({ tag: "passa", tone: "success" });
    });

    it("passo 4: le bozze in attesa, la più vecchia prima, anche di ieri, con la bozza da mandare", () => {
        const old = draft({ created_at: "2026-10-03T08:00:00Z", venue_name: "Bar Luna" });
        const items = giroItems(4, sources({ drafts: [draft({ created_at: "2026-10-05T08:50:00Z" }), old, draft({ status: "sent" })] }));
        expect(items.map(i => i.venueName)).toEqual(["Bar Luna", "Bar Roma"]);
        expect(items[0].draftId).toBe(old.id);
        expect(items[0].tone).toBe("danger");
        expect(items[1]).toMatchObject({ when: "10 min", tone: "neutral" });
    });

    it("passo 5: i messaggi partiti oggi, chi li ha mandati", () => {
        const items = giroItems(
            5,
            sources({
                messages: [
                    message({
                        direction: "out",
                        author: "agent",
                        status: "sent",
                        sent_at: "2026-10-05T08:15:00Z",
                        purpose: "follow_up",
                        body: "Ci risentiamo?"
                    }),
                    message({ direction: "out", author: "person", status: "queued", sent_at: null }),
                    message({
                        direction: "out",
                        author: "person",
                        status: "sent",
                        sent_at: "2026-10-05T08:45:00Z",
                        purpose: "reply",
                        body: "Certo"
                    })
                ]
            })
        );
        expect(items.map(i => i.tag)).toEqual(["da voi", "dall'agente"]);
        expect(items[1].text).toBe("Sollecito: Ci risentiamo?");
    });

    it("al massimo cinque righe", () => {
        const drafts = Array.from({ length: 8 }, () => draft({}));
        expect(giroItems(4, sources({ drafts }))).toHaveLength(GIRO_ITEMS_LIMIT);
    });
});

describe("arrivedToday", () => {
    it("conta solo i messaggi in arrivo di oggi", () => {
        expect(arrivedToday([message({}), message({ created_at: "2026-10-04T08:00:00Z" }), message({ direction: "out" })], NOW)).toBe(1);
    });
});
