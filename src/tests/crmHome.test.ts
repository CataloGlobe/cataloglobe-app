import { describe, expect, it } from "vitest";
import type { CrmAgentDraftRow, CrmAppointmentWithVenue, CrmVenueListItem } from "@/types/crm";
import { greeting, homeAgendaToday, homeFigures, homeHot, homeTodos, venueWaits } from "@/utils/crm/crmHome";

// Lunedì 5 ottobre 2026, 15:00 di Roma
const NOW = new Date("2026-10-05T13:00:00Z");

function venue(p: Partial<CrmVenueListItem>): CrmVenueListItem {
    return {
        id: Math.random().toString(36),
        created_at: "2026-09-20T10:00:00Z",
        updated_at: "2026-09-20T10:00:00Z",
        name: "Bar Roma",
        name_pending: false,
        name_to_verify: null,
        city: null,
        stage: "contattato",
        lost_kind: null,
        lost_reason: null,
        assigned_to: "u1",
        tenant_id: null,
        link_source: null,
        referred_by: null,
        stage_changed_at: "2026-09-20T10:00:00Z",
        first_contacted_at: null,
        last_activity_at: "2026-09-20T10:00:00Z",
        account_state: null,
        trial_kind: null,
        trial_ends_at: null,
        stage_locked_at: null,
        stage_locked_by: null,
        stage_lock_note: null,
        agent_hold_at: null,
        agent_hold_by: null,
        crm_contacts: [],
        crm_leads: [],
        ...p
    };
}

function draft(p: Partial<CrmAgentDraftRow>): CrmAgentDraftRow {
    return {
        id: Math.random().toString(36),
        created_at: "2026-10-05T12:50:00Z",
        venue_id: "v1",
        venue_name: "Caffè Centrale",
        kind: "follow_up",
        status: "pending",
        reason: null,
        proposed_text: "Ciao, ci sei?",
        final_text: null,
        decided_at: null,
        ...p
    };
}

function appointment(p: Partial<CrmAppointmentWithVenue>): CrmAppointmentWithVenue {
    return {
        id: Math.random().toString(36),
        created_at: "2026-10-01T10:00:00Z",
        venue_id: "v1",
        lead_id: null,
        contact_id: null,
        starts_at: "2026-10-05T15:45:00Z",
        ends_at: "2026-10-05T16:00:00Z",
        time_set_at: "2026-10-01T10:00:00Z",
        caller_user_id: "u1",
        created_by: null,
        status: "confirmed",
        status_reason: null,
        note: null,
        google_sync: "none",
        google_error: null,
        reminder_queued_at: null,
        venue_name: "Trattoria Esempio",
        venue_city: null,
        ...p
    } as CrmAppointmentWithVenue;
}

describe("homeTodos", () => {
    it("il più urgente in cima: rosso, poi arancio, poi il resto", () => {
        const todos = homeTodos({
            drafts: [
                draft({ venue_name: "Caffè Centrale" }), // 10 min
                draft({ venue_name: "Bar Roma", kind: "reply", created_at: "2026-10-05T10:30:00Z" }) // 2 ore e mezza
            ],
            venues: [venue({ name: "Pizzeria Uno", stage: "nuovo", assigned_to: null, created_at: "2026-10-05T12:20:00Z" })],
            callsWithoutOutcome: [appointment({ venue_name: "Osteria del Ponte" })],
            now: NOW
        });
        expect(todos.map(t => t.venueName)).toEqual(["Bar Roma", "Pizzeria Uno", "Caffè Centrale", "Osteria del Ponte"]);
        expect(todos[0]).toMatchObject({ level: "rosso", wait: "2 ore", text: "ha scritto: la risposta è pronta" });
        expect(todos[1]).toMatchObject({ level: "arancio", wait: "40 min" });
        expect(todos[3]).toMatchObject({ kind: "outcome", wait: null });
    });

    it("le bozze decise e i nuovi già assegnati non ci sono", () => {
        const todos = homeTodos({
            drafts: [draft({ status: "sent" })],
            venues: [venue({ stage: "nuovo", assigned_to: "u1" })],
            callsWithoutOutcome: [],
            now: NOW
        });
        expect(todos).toEqual([]);
    });
});

describe("homeFigures e homeHot", () => {
    const venues = [
        venue({ created_at: "2026-10-03T10:00:00Z", stage: "in_conversazione", last_activity_at: "2026-10-05T08:00:00Z", name: "Bar Luna" }),
        venue({ stage: "in_prova" }),
        venue({ stage: "cliente_pagante" }),
        venue({ stage: "telefonata_fissata", last_activity_at: "2026-10-05T12:00:00Z", name: "Trattoria Bice" }),
        venue({ stage: "in_conversazione", last_activity_at: "2026-10-03T12:00:00Z", name: "Fermo" })
    ];

    it("numeri in riga", () => {
        expect(homeFigures(venues, NOW)).toEqual({ newWeek: 1, talking: 2, trial: 1, paying: 1 });
    });

    it("caldi: ultime 24 ore, il più recente in cima", () => {
        expect(homeHot(venues, NOW).map(v => v.name)).toEqual(["Trattoria Bice", "Bar Luna"]);
    });
});

describe("homeAgendaToday e greeting", () => {
    it("solo oggi a Roma, senza annullati, in ordine", () => {
        const list = homeAgendaToday(
            [
                appointment({ starts_at: "2026-10-05T16:00:00Z", venue_name: "B" }),
                appointment({ starts_at: "2026-10-05T08:00:00Z", venue_name: "A" }),
                appointment({ starts_at: "2026-10-05T09:00:00Z", status: "cancelled", venue_name: "X" }),
                appointment({ starts_at: "2026-10-06T08:00:00Z", venue_name: "Domani" })
            ],
            NOW
        );
        expect(list.map(a => a.venue_name)).toEqual(["A", "B"]);
    });

    it("saluto secondo l'ora di Roma", () => {
        expect(greeting(new Date("2026-10-05T07:00:00Z"))).toBe("Buongiorno");
        expect(greeting(NOW)).toBe("Buon pomeriggio");
        expect(greeting(new Date("2026-10-05T17:30:00Z"))).toBe("Buonasera");
    });
});

describe("venueWaits", () => {
    it("per ogni locale la cosa più urgente, col suo colore", () => {
        const waits = venueWaits({
            drafts: [
                draft({ venue_id: "a", created_at: "2026-10-05T12:50:00Z" }),
                draft({ venue_id: "a", kind: "reply", created_at: "2026-10-05T10:30:00Z" })
            ],
            venues: [venue({ id: "b", stage: "nuovo", assigned_to: null, created_at: "2026-10-05T12:20:00Z" }), venue({ id: "c" })],
            now: NOW
        });
        expect(waits.get("a")).toEqual({ level: "rosso", wait: "2 ore", text: "ha scritto: la risposta è pronta" });
        expect(waits.get("b")).toMatchObject({ level: "arancio", wait: "40 min" });
        expect(waits.has("c")).toBe(false);
    });
});
