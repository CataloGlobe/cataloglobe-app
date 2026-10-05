import { describe, expect, it } from "vitest";
import type { CrmAppointmentWithVenue, CrmVenueListItem } from "@/types/crm";
import {
    boardVenues,
    cardMeta,
    contactLine,
    dayAndTime,
    formatDuration,
    initials,
    leadSummary,
    matchesView,
    nextAppointments,
    parseLeadView,
    PIPELINE_STAGES,
    searchLeads,
    trackIndex,
    viewCounts,
    waitSentence
} from "@/utils/crm/leadViews";

// Lunedì 5 ottobre 2026, 15:00 di Roma
const NOW = new Date("2026-10-05T13:00:00Z");
const CTX = { userId: "u1", now: NOW };

function venue(p: Partial<CrmVenueListItem>): CrmVenueListItem {
    return {
        id: Math.random().toString(36),
        created_at: "2026-10-01T10:00:00Z",
        updated_at: "2026-10-01T10:00:00Z",
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
        stage_changed_at: "2026-10-01T10:00:00Z",
        first_contacted_at: null,
        last_activity_at: "2026-10-05T12:00:00Z",
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

function appt(p: Partial<CrmAppointmentWithVenue>): CrmAppointmentWithVenue {
    return {
        id: Math.random().toString(36),
        created_at: "2026-10-02T10:00:00Z",
        venue_id: "v1",
        lead_id: null,
        contact_id: null,
        starts_at: "2026-10-05T15:45:00Z",
        ends_at: "2026-10-05T16:00:00Z",
        time_set_at: "2026-10-02T10:00:00Z",
        caller_user_id: "u1",
        created_by: null,
        status: "confirmed",
        status_reason: null,
        note: null,
        google_sync: "none",
        google_error: null,
        reminder_queued_at: null,
        soon_queued_for: null,
        brief_sent_at: null,
        outcome_at: null,
        outcome_by: null,
        venue_name: "Bar Roma",
        venue_city: null,
        ...p
    };
}

describe("viste", () => {
    it("legge ?vista= e torna a Da lavorare per i valori vecchi", () => {
        expect(parseLeadView("riepilogo")).toBe("riepilogo");
        expect(parseLeadView("pipeline")).toBe("da-lavorare");
        expect(parseLeadView(null)).toBe("da-lavorare");
    });

    it("conta ogni vista", () => {
        const venues = [
            venue({ stage: "nuovo", assigned_to: null }),
            venue({ stage: "in_conversazione", assigned_to: "u2" }),
            venue({ stage: "telefonata_fissata" }),
            venue({ stage: "contattato", last_activity_at: "2026-09-30T10:00:00Z" }),
            venue({ stage: "cliente_pagante" }),
            venue({ stage: "perso", last_activity_at: "2026-09-01T10:00:00Z" })
        ];
        const c = viewCounts(venues, CTX);
        expect(c["da-lavorare"]).toBe(4);
        expect(c["senza-nessuno"]).toBe(1);
        expect(c["in-conversazione"]).toBe(1);
        expect(c.telefonate).toBe(1);
        expect(c.fermi).toBe(1);
        expect(c.miei).toBe(2);
        expect(c.paganti).toBe(1);
        expect(c.persi).toBe(1);
        expect(c.tutti).toBe(6);
    });

    it("Miei è vuota senza utente", () => {
        expect(matchesView(venue({}), "miei", { userId: null, now: NOW })).toBe(false);
    });
});

describe("binario e ricerca", () => {
    it("nove fasi senza Perso", () => {
        expect(PIPELINE_STAGES).toHaveLength(9);
        expect(trackIndex("nuovo")).toBe(0);
        expect(trackIndex("cliente_pagante")).toBe(8);
        expect(trackIndex("perso")).toBeNull();
    });

    it("cerca per nome senza accenti, città, persona e numero", () => {
        const venues = [
            venue({ name: "Caffè Né", city: "Monza" }),
            venue({ name: "Osteria", crm_contacts: [{ id: "c", name: "Marta", phone_e164: "+39 333 1234567", email: null }] })
        ];
        expect(searchLeads(venues, "caffe ne")).toHaveLength(1);
        expect(searchLeads(venues, "monza")).toHaveLength(1);
        expect(searchLeads(venues, "marta")).toHaveLength(1);
        expect(searchLeads(venues, "1234")).toHaveLength(1);
        expect(searchLeads(venues, "  ")).toHaveLength(2);
    });

    it("iniziali", () => {
        expect(initials("Alex Delia")).toBe("AD");
        expect(initials("Lorenzo")).toBe("LO");
        expect(initials(null)).toBe("");
    });
});

describe("ultimo contatto", () => {
    it("giorno e ora", () => {
        expect(dayAndTime("2026-10-05T15:45:00Z", NOW)).toBe("oggi 17:45");
        expect(dayAndTime("2026-10-06T09:00:00Z", NOW)).toBe("domani 11:00");
        expect(dayAndTime("2026-10-08T16:00:00Z", NOW)).toBe("giovedì 18:00");
    });

    it("l'attesa vince su tutto", () => {
        const line = contactLine({
            venue: venue({ stage: "nuovo" }),
            wait: { level: "arancio", wait: "40 min", text: "è nuovo e nessuno lo segue" },
            next: undefined,
            now: NOW
        });
        expect(line).toEqual({ text: "40 min fa, nessuno lo segue", warn: true });
    });

    it("telefonata o demo in arrivo", () => {
        expect(contactLine({ venue: venue({ stage: "telefonata_fissata" }), wait: undefined, next: appt({}), now: NOW }).text).toBe(
            "Telefonata oggi 17:45"
        );
        expect(contactLine({ venue: venue({ stage: "demo_fissata" }), wait: undefined, next: appt({}), now: NOW }).text).toBe(
            "Demo oggi 17:45"
        );
    });

    it("giorno della prova", () => {
        const v = venue({ stage: "in_prova", stage_changed_at: "2026-09-26T10:00:00Z", trial_ends_at: "2026-10-26T10:00:00Z" });
        expect(contactLine({ venue: v, wait: undefined, next: undefined, now: NOW }).text).toBe("Prova giorno 10 di 30");
    });

    it("fermo da più di tre giorni", () => {
        const v = venue({ stage: "contattato", last_activity_at: "2026-10-01T10:00:00Z" });
        expect(contactLine({ venue: v, wait: undefined, next: undefined, now: NOW })).toEqual({
            text: "4 giorni fa, nessuna risposta",
            warn: true
        });
        expect(contactLine({ venue: venue({}), wait: undefined, next: undefined, now: NOW })).toEqual({ text: "1 ora fa", warn: false });
    });

    it("prossimo appuntamento: il primo da fare, non annullato", () => {
        const map = nextAppointments(
            [
                appt({ id: "past", starts_at: "2026-10-05T10:00:00Z" }),
                appt({ id: "x", status: "cancelled", starts_at: "2026-10-05T14:00:00Z" }),
                appt({ id: "late", starts_at: "2026-10-07T10:00:00Z" }),
                appt({ id: "next", starts_at: "2026-10-06T10:00:00Z" })
            ],
            NOW
        );
        expect(map.get("v1")?.id).toBe("next");
    });
});

describe("riepilogo", () => {
    it("arrivati, risposte, clienti e il punto dove si fermano", () => {
        const venues = [
            venue({ id: "a", stage: "nuovo" }),
            venue({ id: "b", stage: "contattato", first_contacted_at: "2026-10-01T10:20:00Z" }),
            venue({ id: "c", stage: "in_conversazione", first_contacted_at: "2026-10-01T10:10:00Z" }),
            venue({ id: "d", stage: "in_conversazione", first_contacted_at: "2026-10-01T10:30:00Z" }),
            venue({ id: "e", stage: "telefonata_fissata", first_contacted_at: "2026-10-01T10:15:00Z" }),
            venue({ id: "f", stage: "cliente_pagante", stage_changed_at: "2026-10-04T10:00:00Z", crm_leads: [] }),
            venue({ id: "g", stage: "perso", first_contacted_at: "2026-10-01T11:00:00Z" }),
            venue({ id: "old", created_at: "2026-08-01T10:00:00Z" })
        ];
        const s = leadSummary({
            venues,
            appointments: [appt({ venue_id: "e", created_at: "2026-10-03T10:00:00Z" })],
            period: "7",
            now: NOW
        });
        expect(s.arrived).toBe(7);
        expect(s.repliedPct).toBe(Math.round((4 / 7) * 100));
        expect(s.clients).toBe(1);
        expect(s.daysToPay).toBe(3);
        expect(s.funnel[0].reached).toBe(7);
        expect(s.funnel[1]).toMatchObject({ stage: "contattato", reached: 6, note: "1 mai raggiunti" });
        expect(s.funnel[2]).toMatchObject({ stage: "in_conversazione", reached: 4, note: "2 si fermano qui", worst: true });
        expect(s.firstReplyMinutes).toBe(20);
        expect(s.daysToCall).toBe(2);
    });

    it("niente arrivi, niente percentuali", () => {
        const s = leadSummary({ venues: [], appointments: [], period: "30", now: NOW });
        expect(s.repliedPct).toBeNull();
        expect(s.daysToPay).toBeNull();
        expect(s.funnel.every(r => r.note === null)).toBe(true);
    });

    it("durate", () => {
        expect(formatDuration(18)).toBe("18 min");
        expect(formatDuration(180)).toBe("3 ore");
        expect(formatDuration(60 * 48)).toBe("2 giorni");
    });
});

describe("carte e telefono", () => {
    it("riga piccola della carta", () => {
        expect(cardMeta({ venue: venue({}), wait: undefined, next: appt({ starts_at: "2026-10-08T16:00:00Z" }), now: NOW }).text).toBe(
            "gio 18:00"
        );
        expect(cardMeta({ venue: venue({ last_activity_at: "2026-10-03T10:00:00Z" }), wait: undefined, next: undefined, now: NOW })).toEqual({
            text: "2 gg",
            warn: false
        });
        expect(
            cardMeta({ venue: venue({ stage: "cliente_pagante", stage_changed_at: "2026-08-10T10:00:00Z" }), wait: undefined, next: undefined, now: NOW })
                .text
        ).toBe("da agosto");
    });

    it("frase dell'attesa", () => {
        expect(waitSentence("è nuovo e nessuno lo segue")).toBe("Nuovo, nessuno lo segue");
        expect(waitSentence("sollecito pronto")).toBe("Sollecito pronto");
    });

    it("le colonne tengono i paganti in Da lavorare, mai i persi", () => {
        const venues = [venue({ stage: "cliente_pagante" }), venue({ stage: "perso" }), venue({ stage: "nuovo" })];
        expect(boardVenues(venues, "da-lavorare", CTX)).toHaveLength(2);
        expect(boardVenues(venues, "tutti", CTX)).toHaveLength(2);
    });
});
