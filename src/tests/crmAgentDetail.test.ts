import { describe, expect, it } from "vitest";
import type { CrmAgentDecision, CrmAgentDraftRow, CrmAgentTrust, CrmAiUsageCost } from "@/types/crm";
import { agentDetail, agentUsageSince, monthSpendByRole, spendWeek } from "@/utils/crm/agentDetail";
import type { AgentRow } from "@/utils/crm/agentsOverview";

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
        proposed_text: "Buongiorno",
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
        action: "draft_reviewed",
        reason: "",
        venue_id: "v",
        lead_id: null,
        review_outcome: null,
        decided_by: null,
        decided_at: null,
        payload: {},
        ...p
    };
}

function use(role: CrmAiUsageCost["role"], cost: number, at: string): CrmAiUsageCost {
    return { role, cost_usd: cost, created_at: at };
}

function row(id: AgentRow["id"], role: AgentRow["role"]): AgentRow {
    return {
        id,
        name: id,
        role,
        spendShared: false,
        step: 2,
        status: "Acceso",
        tone: "success",
        today: "",
        approvedShare: null,
        mix: null
    };
}

const venueName = () => "Bar Luna";

describe("agentUsageSince", () => {
    it("a inizio mese parte da sei giorni fa", () => {
        // 5 ottobre: sei giorni prima è il 29 settembre, mezzanotte di Roma (22:00 UTC del 28)
        expect(agentUsageSince(NOW)).toBe("2026-09-28T22:00:00.000Z");
    });
    it("a metà mese parte dal primo del mese", () => {
        expect(agentUsageSince(new Date("2026-10-20T09:00:00Z"))).toBe("2026-09-30T22:00:00.000Z");
    });
});

describe("spendWeek", () => {
    it("sette giorni con oggi in fondo, solo il ruolo chiesto", () => {
        const week = spendWeek(
            [
                use("conversation", 0.2, "2026-10-05T08:00:00Z"),
                use("conversation", 0.1, "2026-10-03T08:00:00Z"),
                use("gea", 5, "2026-10-05T08:00:00Z")
            ],
            "conversation",
            NOW
        );
        expect(week).toHaveLength(7);
        expect(week[6]).toMatchObject({ day: "2026-10-05", label: "oggi", level: 10 });
        expect(week[4]).toMatchObject({ day: "2026-10-03", label: "sab", level: 5 });
        expect(week[0]).toMatchObject({ day: "2026-09-29", label: "mar", usd: 0, level: 0 });
    });
    it("un giorno con poca spesa resta visibile", () => {
        const week = spendWeek([use("gea", 10, "2026-10-05T08:00:00Z"), use("gea", 0.01, "2026-10-04T08:00:00Z")], "gea", NOW);
        expect(week[5].level).toBe(1);
    });
    it("senza ruolo tutto a zero", () => {
        expect(spendWeek([use("gea", 1, "2026-10-05T08:00:00Z")], null, NOW).every(d => d.level === 0)).toBe(true);
    });
});

describe("monthSpendByRole", () => {
    it("conta solo il mese di Roma in corso", () => {
        const out = monthSpendByRole(
            [
                use("reviewer", 1, "2026-10-01T08:00:00Z"),
                use("reviewer", 4, "2026-09-30T08:00:00Z"),
                use("reviewer", 2, "2026-09-30T22:30:00Z")
            ],
            NOW
        );
        expect(out.reviewer).toBe(3);
    });
});

describe("agentDetail", () => {
    const trust: CrmAgentTrust[] = [];

    it("conversazione: bozze sue, in corso e fatte, spesa divisa per bozze", () => {
        const drafts = [
            draft({ kind: "reply", status: "pending" }),
            draft({ kind: "reply", status: "sent", decided_at: "2026-10-05T08:40:00Z" }),
            draft({ kind: "follow_up", status: "sent" }),
            draft({ kind: "reply", status: "sent", created_at: "2026-10-04T08:00:00Z" })
        ];
        const d = agentDetail(row("conversazione", "conversation"), {
            drafts,
            decisions: [],
            trust,
            usage: [use("conversation", 0.3, "2026-10-05T08:00:00Z")],
            venueName,
            now: NOW
        });
        expect(d.kpis.map(k => k.value)).toEqual(["2", "—", "1", "0,20 $"]);
        expect(d.current).toHaveLength(1);
        expect(d.current[0].tag).toBe("Aspetta voi");
        expect(d.done).toHaveLength(1);
        expect(d.done[0]).toMatchObject({ when: "10:40", tag: "Partita" });
        expect(d.sharedNote).toContain("Solleciti e Riattivazione");
        expect(d.perUnit).toBe("0,10 $ a bozza oggi");
    });

    it("solleciti senza bozze oggi: spesa zero", () => {
        const d = agentDetail(row("solleciti", "conversation"), {
            drafts: [],
            decisions: [],
            trust,
            usage: [use("conversation", 0.3, "2026-10-05T08:00:00Z")],
            venueName,
            now: NOW
        });
        expect(d.kpis[3].value).toBe("0,00 $");
        expect(d.perUnit).toBeNull();
    });

    it("revisore: rilette e fermate di oggi dal diario", () => {
        const d = agentDetail(row("revisore", "reviewer"), {
            drafts: [],
            decisions: [
                decision({ review_outcome: "ok" }),
                decision({ review_outcome: "rejected", reason: "prometteva uno sconto" }),
                decision({ review_outcome: "ok", created_at: "2026-10-04T08:00:00Z" })
            ],
            trust,
            usage: [use("reviewer", 0.04, "2026-10-05T08:00:00Z")],
            venueName,
            now: NOW
        });
        expect(d.kpis.map(k => k.value)).toEqual(["2", "1", "1", "0,04 $"]);
        expect(d.done.find(i => i.tag === "Fermata")).toMatchObject({
            text: "Fermata la bozza per Bar Luna",
            sub: "prometteva uno sconto"
        });
        expect(d.perUnit).toBe("0,02 $ a rilettura oggi");
        expect(d.sharedNote).toBeNull();
    });

    it("gea: le azioni di oggi nel diario", () => {
        const d = agentDetail(row("gea", "gea"), {
            drafts: [],
            decisions: [decision({ actor: "gea", reason: "Agenti riattivati", venue_id: null })],
            trust,
            usage: [use("gea", 0.12, "2026-10-05T08:00:00Z"), use("gea", 1, "2026-10-02T08:00:00Z")],
            venueName,
            now: NOW
        });
        expect(d.kpis.map(k => k.value)).toEqual(["1", "0,12 $", "1,12 $", "1,12 $"]);
        expect(d.done[0]).toMatchObject({ text: "Agenti riattivati", tag: "Fatto" });
    });
});
