import { describe, expect, it } from "vitest";
import type { CrmAgentDecision, CrmAgentDraftRow, CrmAgentTrialSettings, CrmAgentTrust } from "@/types/crm";
import { agentRows, giroToday, isRomeToday } from "@/utils/crm/agentsOverview";

// Lunedì 5 ottobre 2026, 11:00 di Roma
const NOW = new Date("2026-10-05T09:00:00Z");

function draft(p: Partial<CrmAgentDraftRow>): CrmAgentDraftRow {
    return {
        id: Math.random().toString(36),
        created_at: "2026-10-05T08:00:00Z",
        venue_id: "v",
        venue_name: "Bar Roma",
        kind: "reply",
        status: "pending",
        reason: null,
        proposed_text: null,
        final_text: null,
        decided_at: null,
        ...p
    };
}

function decision(p: Partial<CrmAgentDecision>): CrmAgentDecision {
    return {
        id: Math.random().toString(36),
        created_at: "2026-10-05T08:30:00Z",
        actor: "reviewer",
        actor_user_id: null,
        action: "draft_created",
        reason: "",
        venue_id: null,
        lead_id: null,
        review_outcome: null,
        decided_by: null,
        decided_at: null,
        payload: {},
        ...p
    };
}

const SETTINGS: CrmAgentTrialSettings = {
    agent_replies_on: true,
    agent_followups_on: false,
    agent_reactivation_message: null,
    agent_reactivation_days: 90,
    agent_autonomy_on: false
};

const TRUST: CrmAgentTrust[] = [
    {
        kind: "reply",
        approved_in_row: 3,
        since: null,
        total_approved: 7,
        total_edited: 2,
        total_discarded: 1,
        required_in_row: 5,
        autonomous: false,
        total_auto: 0
    }
];

describe("isRomeToday", () => {
    it("la mezzanotte è quella di Roma", () => {
        expect(isRomeToday("2026-10-04T22:30:00Z", NOW)).toBe(true); // 00:30 del 5 a Roma
        expect(isRomeToday("2026-10-04T21:30:00Z", NOW)).toBe(false);
    });
});

describe("giroToday", () => {
    const drafts = [
        draft({ status: "pending", created_at: "2026-10-05T08:15:00Z" }),
        draft({ status: "sent", decided_at: "2026-10-05T08:40:00Z" }),
        draft({ status: "edited", decided_at: "2026-10-05T08:50:00Z", kind: "follow_up" }),
        draft({ status: "sent", created_at: "2026-10-04T10:00:00Z", decided_at: "2026-10-04T10:05:00Z" })
    ];
    const decisions = [
        decision({ review_outcome: "ok" }),
        decision({ review_outcome: "rejected" }),
        decision({ action: "draft_auto_sent", actor: "agent" }),
        decision({ review_outcome: "ok", created_at: "2026-10-04T10:00:00Z" })
    ];

    it("conta solo oggi", () => {
        const g = giroToday(drafts, decisions, NOW);
        expect(g.written).toBe(3);
        expect(g.reviewed).toBe(2);
        expect(g.stopped).toBe(1);
        expect(g.sent).toBe(3);
        expect(g.waiting).toBe(1);
    });

    it("l'attesa più vecchia nel formato unico e col suo colore", () => {
        const g = giroToday(drafts, decisions, NOW);
        expect(g.oldestWait).toBe("45 min");
        expect(g.oldestLevel).toBe("arancio");
    });

    it("nessuna bozza in attesa: niente attesa", () => {
        const g = giroToday([], [], NOW);
        expect(g.oldestWait).toBeNull();
        expect(g.oldestLevel).toBe("normale");
    });
});

describe("agentRows", () => {
    it("stato in prova col contatore, spento, quota delle inviate così", () => {
        const giro = giroToday([draft({})], [decision({ review_outcome: "ok" })], NOW);
        const rows = agentRows({ settings: SETTINGS, trust: TRUST, drafts: [draft({})], giro, now: NOW });
        const conv = rows.find(r => r.id === "conversazione")!;
        expect(conv.status).toBe("In prova · 3 di 5");
        expect(conv.tone).toBe("warning");
        expect(conv.today).toBe("1 bozza");
        expect(conv.approvedShare).toBeCloseTo(0.7);
        expect(rows.find(r => r.id === "solleciti")!.status).toBe("Spento");
        expect(rows.find(r => r.id === "riattivazione")!.status).toBe("Spenta");
        expect(rows.find(r => r.id === "revisore")!.today).toBe("1 riletta, 0 fermate");
    });

    it("fuori dalla prova solo con l'autonomia accesa", () => {
        const trust = [{ ...TRUST[0], autonomous: true }];
        const giro = giroToday([], [], NOW);
        const off = agentRows({ settings: SETTINGS, trust, drafts: [], giro, now: NOW });
        expect(off[0].status).toBe("In prova · 3 di 5");
        const on = agentRows({ settings: { ...SETTINGS, agent_autonomy_on: true }, trust, drafts: [], giro, now: NOW });
        expect(on[0].status).toBe("Fuori dalla prova");
    });
});
