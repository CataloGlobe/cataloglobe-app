import { describe, expect, it } from "vitest";
import type { CrmEvent, CrmMessage } from "@/types/crm";
import { chatItems, chatTime, leadBrief, nextStepDue, nextStepOverdue, QUICK_REPLIES } from "@/utils/crm/leadDetail";

// Lunedì 5 ottobre 2026, 15:00 di Roma.
const NOW = new Date("2026-10-05T13:00:00Z");

function message(over: Partial<CrmMessage>): CrmMessage {
    return {
        id: "m1",
        created_at: "2026-10-05T11:40:00Z",
        venue_id: "v",
        contact_id: null,
        lead_id: null,
        direction: "in",
        author: "lead",
        kind: "text",
        body: "ciao",
        purpose: null,
        status: null,
        status_reason: null,
        sent_at: null,
        appointment_id: null,
        ...over
    };
}

function event(over: Partial<CrmEvent>): CrmEvent {
    return {
        id: "e1",
        created_at: "2026-10-05T10:00:00Z",
        venue_id: "v",
        lead_id: null,
        type: "stage_changed",
        actor_user_id: null,
        payload: { from: "nuovo", to: "contattato" },
        ...over
    } as CrmEvent;
}

describe("chatTime", () => {
    it("oggi, ieri, giorno della settimana, poi la data", () => {
        expect(chatTime("2026-10-05T11:40:00Z", NOW)).toBe("oggi 13:40");
        expect(chatTime("2026-10-04T08:10:00Z", NOW)).toBe("ieri 10:10");
        expect(chatTime("2026-10-02T08:44:00Z", NOW)).toBe("ven 10:44");
        expect(chatTime("2026-09-20T08:44:00Z", NOW)).toBe("20 set 10:44");
    });
});

describe("chatItems", () => {
    it("mette messaggi ed eventi in ordine e lascia fuori le note", () => {
        const items = chatItems(
            [message({ id: "a", created_at: "2026-10-05T11:00:00Z" }), message({ id: "b", created_at: "2026-10-05T09:00:00Z" })],
            [event({ id: "x" }), event({ id: "n", type: "note", payload: { text: "ciao" } })],
            () => "Ale",
            t => (t === "stage_changed" ? "Cambio di fase" : t)
        );
        expect(items.map(i => i.key)).toEqual(["m-b", "e-x", "m-a"]);
        expect(items[1]).toMatchObject({ kind: "event", text: "Cambio di fase: Nuovo → Contattato" });
    });

    it("usa l'ora di invio quando c'è", () => {
        const items = chatItems(
            [message({ id: "a", created_at: "2026-10-05T08:00:00Z", sent_at: "2026-10-05T12:00:00Z" }), message({ id: "b", created_at: "2026-10-05T11:00:00Z" })],
            [],
            () => "",
            t => t
        );
        expect(items.map(i => i.key)).toEqual(["m-b", "m-a"]);
    });
});

describe("leadBrief", () => {
    const venue = { city: "Milano", stage: "in_conversazione" as const, agent_hold_at: null };
    it("dice dove, cosa vuole, a che punto e il prossimo passo", () => {
        expect(
            leadBrief({
                venue,
                leads: [{ interests: ["Menù con QR", "Ordini al tavolo"], source: "meta_form" }],
                messages: [message({ direction: "in" })],
                draft: { kind: "reply" },
                nextStep: { step: "Fissare la telefonata" }
            })
        ).toBe("A Milano. Vuole menù con QR, ordini al tavolo. Ha scritto: la risposta dell'agente è pronta. Prossimo passo: fissare la telefonata.");
    });

    it("senza bozza guarda l'ultimo messaggio valido", () => {
        const base = { venue: { ...venue, city: null }, leads: [], draft: null, nextStep: null };
        expect(leadBrief({ ...base, messages: [] })).toBe("Nessun messaggio ancora.");
        expect(leadBrief({ ...base, messages: [message({ direction: "in" })] })).toBe("Ha scritto per ultimo: tocca a noi.");
        expect(
            leadBrief({ ...base, messages: [message({ direction: "out", status: "sent" }), message({ direction: "in", status: null }), message({ direction: "out", status: "failed" })] })
        ).toBe("Ha scritto per ultimo: tocca a noi.");
        expect(leadBrief({ ...base, messages: [message({ direction: "out", status: "sent" })] })).toBe("Aspettiamo la sua risposta.");
    });

    it("dice quando lo gestisce una persona", () => {
        expect(
            leadBrief({ venue: { ...venue, city: null, agent_hold_at: "2026-10-05T10:00:00Z" }, leads: [], messages: [], draft: null, nextStep: null })
        ).toBe("Nessun messaggio ancora. Lo gestisce una persona, l'agente non scrive.");
    });
});

describe("prossimo passo", () => {
    it("scadenza in parole", () => {
        expect(nextStepDue("2026-10-05", NOW)).toBe("entro oggi");
        expect(nextStepDue("2026-10-06", NOW)).toBe("entro domani");
        expect(nextStepDue("2026-10-08", NOW)).toBe("entro gio 8 ott");
        expect(nextStepDue("2026-10-04", NOW)).toBe("scaduto");
    });

    it("scaduto solo prima di oggi", () => {
        expect(nextStepOverdue({ due_on: "2026-10-04" }, NOW)).toBe(true);
        expect(nextStepOverdue({ due_on: "2026-10-05" }, NOW)).toBe(false);
        expect(nextStepOverdue({ due_on: null }, NOW)).toBe(false);
        expect(nextStepOverdue(null, NOW)).toBe(false);
    });
});

it("le risposte pronte stanno sotto i 1000 caratteri della bozza", () => {
    expect(QUICK_REPLIES.length).toBe(3);
    for (const r of QUICK_REPLIES) expect(r.text.length).toBeLessThan(1000);
});
