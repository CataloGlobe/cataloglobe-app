import { describe, expect, it } from "vitest";
import type { CrmAgentDraftRow, CrmAppointmentWithVenue, CrmMessage, CrmVenueListItem } from "@/types/crm";
import {
    agentsTile,
    dayTimeline,
    timelineHours,
    greeting,
    homeAgendaToday,
    homeFigures,
    homeFiguresV3,
    homeHot,
    homeHotRows,
    homeTodos,
    navSignals,
    relativeAgo,
    romeDayLabel,
    romeWeekStart,
    romeWeekStartDate,
    sinceMorning,
    venueWaits,
    waitingForMe,
    weekCallsSet
} from "@/utils/crm/crmHome";

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

describe("navSignals", () => {
    it("Home conta bozze e nuovi, Lead solo i nuovi; l'anello è del più urgente", () => {
        const s = navSignals({
            drafts: [draft({ created_at: "2026-10-05T10:30:00Z" })],
            venues: [venue({ stage: "nuovo", assigned_to: null, created_at: "2026-10-05T12:20:00Z" })],
            now: NOW
        });
        expect(s.home).toEqual({ count: 2, ring: "danger" });
        expect(s.lead).toEqual({ count: 1, ring: "warning" });
    });

    it("niente in attesa: zero e nessun anello", () => {
        expect(navSignals({ drafts: [], venues: [], now: NOW })).toEqual({
            home: { count: 0, ring: null },
            lead: { count: 0, ring: null }
        });
    });
});

function message(p: Partial<CrmMessage>): CrmMessage {
    return {
        id: Math.random().toString(36),
        created_at: "2026-10-05T12:00:00Z",
        venue_id: "v1",
        contact_id: null,
        lead_id: null,
        direction: "in",
        author: "lead",
        kind: "text",
        body: "va bene mercoledì",
        purpose: null,
        status: null,
        status_reason: null,
        sent_at: null,
        appointment_id: null,
        ...p
    } as CrmMessage;
}

describe("Home V3: tempo e testata", () => {
    it("settimana da lunedì a Roma, data per esteso", () => {
        expect(romeWeekStart(NOW)).toBe("2026-10-04T22:00:00.000Z");
        expect(romeWeekStart(new Date("2026-10-11T20:00:00Z"))).toBe("2026-10-04T22:00:00.000Z");
        expect(romeDayLabel(NOW)).toBe("Lunedì 5 ottobre");
        expect(romeWeekStartDate(new Date("2026-10-11T20:00:00Z"))).toBe("2026-10-05");
    });

    it("da quanto: minuti, ore, ieri, giorni", () => {
        expect(relativeAgo("2026-10-05T12:40:00Z", NOW)).toBe("20 min");
        expect(relativeAgo("2026-10-05T08:00:00Z", NOW)).toBe("5 ore");
        expect(relativeAgo("2026-10-04T20:00:00Z", NOW)).toBe("ieri");
        expect(relativeAgo("2026-10-02T20:00:00Z", NOW)).toBe("3 giorni");
    });

    it("aspettano te: i tuoi lead e quelli di nessuno, una volta per locale", () => {
        const venues = [venue({ id: "a", assigned_to: "me" }), venue({ id: "b", assigned_to: null }), venue({ id: "c", assigned_to: "altro" })];
        const todos = homeTodos({
            drafts: [draft({ venue_id: "a" }), draft({ venue_id: "a" }), draft({ venue_id: "c" })],
            venues: [venue({ id: "b", stage: "nuovo", assigned_to: null })],
            callsWithoutOutcome: [],
            now: NOW
        });
        expect(waitingForMe(todos, venues, "me")).toBe(2);
    });
});

describe("Home V3: numeri e riquadri", () => {
    it("da stamattina: nuovi, chi ha risposto, telefonate con chi, messaggi partiti", () => {
        const since = "2026-10-05T07:40:00Z";
        const out = sinceMorning({
            since,
            venues: [venue({ created_at: "2026-10-05T09:00:00Z" }), venue({ created_at: "2026-10-04T09:00:00Z" })],
            messages: [
                message({ venue_id: "a" }),
                message({ venue_id: "a" }),
                message({ venue_id: "b", created_at: "2026-10-05T06:00:00Z" }),
                message({ direction: "out", status: "sent", sent_at: "2026-10-05T10:00:00Z" }),
                message({ direction: "out", status: "queued" })
            ],
            calls: [appointment({ created_at: "2026-10-05T08:00:00Z", created_by: "u2" }), appointment({ created_at: "2026-10-05T08:00:00Z", status: "cancelled" })],
            nameOf: id => (id === "u2" ? "Lorenzo" : null)
        });
        expect(out).toEqual({ newLeads: 1, replied: 1, calls: ["Lorenzo"], sent: 1 });
    });

    it("nuovi della settimana col confronto, in prova da quanti giorni", () => {
        const f = homeFiguresV3(
            [
                venue({ created_at: "2026-10-04T10:00:00Z" }),
                venue({ created_at: "2026-10-03T10:00:00Z" }),
                venue({ created_at: "2026-09-27T10:00:00Z" }),
                venue({ stage: "in_prova", stage_changed_at: "2026-10-01T10:00:00Z" })
            ],
            NOW
        );
        expect(f.newWeek).toBe(2);
        expect(f.newWeekDelta).toBe(1);
        expect(f.trialSinceDays).toBe(4);
    });

    it("caldi: chi ci ha scritto nelle 24 ore, con l'ultima frase", () => {
        const venues = [venue({ id: "a", name: "Bar Luna" }), venue({ id: "b", name: "Trattoria Bice" })];
        const rows = homeHotRows(
            venues,
            [
                message({ venue_id: "a", body: "prima", created_at: "2026-10-05T07:00:00Z" }),
                message({ venue_id: "a", body: "va bene mercoledì alle 11", created_at: "2026-10-05T08:00:00Z" }),
                message({ venue_id: "b", body: "mandatemi un esempio", created_at: "2026-10-04T16:00:00Z" }),
                message({ venue_id: "b", direction: "out", created_at: "2026-10-05T12:00:00Z" })
            ],
            NOW
        );
        expect(rows.map(r => [r.name, r.quote])).toEqual([
            ["Bar Luna", "va bene mercoledì alle 11"],
            ["Trattoria Bice", "mandatemi un esempio"]
        ]);
        expect(homeHotRows(venues, null, NOW)).toEqual([]);
    });

    it("obiettivo: telefonate fissate da lunedì, senza le annullate", () => {
        const week = romeWeekStart(NOW);
        expect(
            weekCallsSet(
                [
                    appointment({ created_at: "2026-10-05T08:00:00Z" }),
                    appointment({ created_at: "2026-10-05T09:00:00Z", status: "cancelled" }),
                    appointment({ created_at: "2026-10-03T09:00:00Z" })
                ],
                week
            )
        ).toBe(1);
    });

    it("agenti: stato, partiti oggi, primi messaggi, bozze in attesa", () => {
        const tile = agentsTile({
            brakeOn: false,
            autonomyOn: false,
            messages: [
                message({ direction: "out", status: "sent", sent_at: "2026-10-05T09:00:00Z", purpose: "first_message" }),
                message({ direction: "out", status: "sent", sent_at: "2026-10-05T10:00:00Z", purpose: "reply" }),
                message({ direction: "out", status: "sent", sent_at: "2026-10-04T10:00:00Z", purpose: "reply" })
            ],
            drafts: [draft({}), draft({ status: "sent" })],
            now: NOW
        });
        expect(tile).toEqual({ state: "in prova", sentToday: 2, firstToday: 1, waiting: 1 });
        expect(agentsTile({ brakeOn: true, autonomyOn: true, messages: [], drafts: [], now: NOW }).state).toBe("in pausa");
    });
});

describe("dayTimeline", () => {
    it("la giornata ora per ora: partiti, nuovi, bozze, telefonate, in programma", () => {
        const events = dayTimeline({
            dayStart: "2026-10-04T22:00:00Z",
            dayEnd: "2026-10-05T22:00:00Z",
            venues: [
                venue({ id: "a", name: "Caffè Centrale" }),
                venue({ id: "p", name: "Pizzeria Uno", created_at: "2026-10-05T10:05:00Z", crm_leads: [{ id: "l", source: "meta_form", received_at: "", ad_name: null }] })
            ],
            messages: [
                message({ id: "s", venue_id: "a", direction: "out", status: "sent", purpose: "follow_up", sent_at: "2026-10-05T07:10:00Z" }),
                message({ id: "q", venue_id: "a", direction: "out", status: "queued", purpose: "call_reminder", created_at: "2026-10-05T14:45:00Z" }),
                message({ id: "old", venue_id: "a", direction: "out", status: "sent", sent_at: "2026-10-04T10:00:00Z" })
            ],
            drafts: [draft({ venue_id: "b", venue_name: "Bar Roma", kind: "reply", created_at: "2026-10-05T13:28:00Z" })],
            appointments: [appointment({ venue_id: "t", venue_name: "Trattoria Esempio", starts_at: "2026-10-05T15:45:00Z", caller_user_id: "u2" })],
            nameOf: id => (id === "u2" ? "Lorenzo" : null)
        });
        expect(events.map(e => [e.hour, `${e.before} ${e.venueName} ${e.after}`.trim(), e.tone])).toEqual([
            [9, "Sollecito partito a Caffè Centrale", "normale"],
            [12, "Lead nuovo dal modulo Meta: Pizzeria Uno", "normale"],
            [15, "Bar Roma ha scritto: la risposta è pronta", "attesa"],
            [16, "Promemoria a Caffè Centrale (in programma)", "programma"],
            [17, "Telefonata con Trattoria Esempio · chiama Lorenzo", "telefonata"]
        ]);
        expect(timelineHours(events)).toEqual([9, 10, 11, 12, 13, 14, 15, 16, 17, 18]);
        expect(timelineHours([{ ...events[0], hour: 7 }])[0]).toBe(7);
    });
});
