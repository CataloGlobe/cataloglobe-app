import { describe, expect, it } from "vitest";
import type { CrmAppointmentWithVenue, CrmMessage, CrmQueuedMessage, CrmVenueListItem } from "@/types/crm";
import {
    agendaDayItems,
    agendaWeek,
    agendaWeekItems,
    dayBounds,
    nowLineIndex,
    parseAgendaView,
    tomorrowLine,
    weekMonthLabel,
    weekStartKey
} from "@/utils/crm/agendaDay";

// Lunedì 5 ottobre 2026, 15:40 di Roma
const NOW = new Date("2026-10-05T13:40:00Z");
const DAY = dayBounds("2026-10-05");

function call(p: Partial<CrmAppointmentWithVenue>): CrmAppointmentWithVenue {
    return {
        id: Math.random().toString(36),
        created_at: "2026-10-01T08:00:00Z",
        venue_id: "v1",
        lead_id: null,
        contact_id: null,
        starts_at: "2026-10-05T15:45:00Z",
        ends_at: "2026-10-05T15:55:00Z",
        time_set_at: "2026-10-01T08:00:00Z",
        caller_user_id: "u1",
        created_by: null,
        status: "confirmed",
        status_reason: null,
        note: null,
        google_sync: "none",
        google_error: null,
        reminder_queued_at: null,
        venue_name: "Trattoria Esempio",
        venue_city: "Milano",
        ...p
    } as CrmAppointmentWithVenue;
}

function sentMessage(p: Partial<CrmMessage>): CrmMessage {
    return {
        id: Math.random().toString(36),
        created_at: "2026-10-05T07:10:00Z",
        venue_id: "v2",
        contact_id: null,
        lead_id: null,
        direction: "out",
        author: "agent",
        kind: "text",
        body: "Ciao",
        purpose: "follow_up",
        status: "sent",
        status_reason: null,
        sent_at: "2026-10-05T07:10:00Z",
        appointment_id: null,
        ...p
    } as CrmMessage;
}

const venues = [
    { id: "v1", name: "Trattoria Esempio", crm_contacts: [{ id: "c1", name: "Anna", phone_e164: "+393331112222", email: null }] },
    { id: "v2", name: "Caffè Centrale", crm_contacts: [] }
] as unknown as CrmVenueListItem[];

describe("agenda: settimana", () => {
    it("parte dal lunedì e mette il puntino dove c'è una telefonata", () => {
        expect(weekStartKey("2026-10-08")).toBe("2026-10-05");
        expect(weekStartKey("2026-10-05")).toBe("2026-10-05");
        expect(weekStartKey("2026-10-11")).toBe("2026-10-05");
        const week = agendaWeek("2026-10-05", "2026-10-05", [
            call({}),
            call({ starts_at: "2026-10-07T08:00:00Z" }),
            call({ starts_at: "2026-10-09T08:00:00Z", status: "cancelled" })
        ]);
        expect(week.map(d => `${d.weekday}${d.day}`)).toEqual(["lun5", "mar6", "mer7", "gio8", "ven9", "sab10", "dom11"]);
        expect(week.filter(d => d.hasCalls).map(d => d.day)).toEqual([5, 7]);
        expect(week[0].isToday).toBe(true);
    });

    it("dice il mese, o i due mesi a cavallo", () => {
        expect(weekMonthLabel("2026-10-05")).toBe("ottobre");
        expect(weekMonthLabel("2026-09-28")).toBe("settembre-ottobre");
    });

    it("il giorno di Roma va da mezzanotte a mezzanotte, anche col cambio d'ora", () => {
        expect(DAY).toEqual({ start: "2026-10-04T22:00:00.000Z", end: "2026-10-05T22:00:00.000Z" });
        expect(dayBounds("2026-10-25")).toEqual({ start: "2026-10-24T22:00:00.000Z", end: "2026-10-25T23:00:00.000Z" });
    });
});

describe("agenda: giornata", () => {
    const queued: CrmQueuedMessage[] = [
        {
            id: "q1",
            created_at: "2026-10-05T06:00:00Z",
            send_after: "2026-10-05T14:45:00Z",
            venue_id: "v1",
            venue_name: "Trattoria Esempio",
            purpose: "call_soon",
            body: null
        },
        {
            id: "q2",
            created_at: "2026-10-05T06:00:00Z",
            send_after: "2026-10-06T07:00:00Z",
            venue_id: "v2",
            venue_name: "Caffè Centrale",
            purpose: "follow_up",
            body: null
        }
    ];
    const items = agendaDayItems({
        dayStart: DAY.start,
        dayEnd: DAY.end,
        now: NOW,
        venues,
        sent: [sentMessage({}), sentMessage({ direction: "in", status: null }), sentMessage({ status: "failed" })],
        queued,
        appointments: [call({}), call({ starts_at: "2026-10-05T06:00:00Z", status: "no_show" }), call({ status: "cancelled" })],
        nameOf: id => (id === "u1" ? "Lorenzo" : null)
    });

    it("mette in ordine d'ora partiti, in coda del giorno e telefonate", () => {
        expect(items.map(i => `${i.time} ${i.kind}`)).toEqual(["08:00 telefonata", "09:10 partito", "16:45 programma", "17:45 telefonata"]);
        expect(items[1].before).toBe("Sollecito partito a");
        expect(items[1].venueName).toBe("Caffè Centrale");
    });

    it("la telefonata da fare ha chi chiama, il numero e i bottoni; quella passata l'esito", () => {
        const open = items[3];
        expect(open.detail).toBe("Telefonata · chiama Lorenzo");
        expect(open.phone).toBe("+393331112222");
        expect(open.appointment).not.toBeNull();
        expect(open.past).toBe(false);
        expect(items[0].detail).toBe("Telefonata · chiama Lorenzo · non ha risposto");
        expect(items[0].appointment).toBeNull();
        expect(items[0].past).toBe(true);
        expect(items[2].detail).toBe("parte da solo");
    });

    it("la riga di adesso cade prima della prima cosa ancora da fare, solo oggi", () => {
        expect(nowLineIndex(items, DAY.start, DAY.end, NOW)).toBe(2);
        const tomorrow = dayBounds("2026-10-06");
        expect(nowLineIndex(items, tomorrow.start, tomorrow.end, NOW)).toBeNull();
    });

    it("un messaggio in coda già scaduto si mostra adesso", () => {
        const late = agendaDayItems({
            dayStart: DAY.start,
            dayEnd: DAY.end,
            now: NOW,
            venues,
            sent: [],
            queued: [{ ...queued[0], send_after: "2026-10-05T10:00:00Z" }],
            appointments: [],
            nameOf: () => null
        });
        expect(late[0].time).toBe("15:40");
        expect(nowLineIndex(late, DAY.start, DAY.end, NOW)).toBe(0);
    });
});

describe("agenda: domani", () => {
    it("dice la prima telefonata di domani, o nessuna", () => {
        expect(tomorrowLine([], "2026-10-06")).toBe("Domani: nessuna telefonata.");
        expect(tomorrowLine([call({ starts_at: "2026-10-06T16:00:00Z", venue_name: "San Pietro" })], "2026-10-06")).toBe(
            "Domani: telefonata con San Pietro alle 18:00."
        );
        expect(
            tomorrowLine(
                [call({ starts_at: "2026-10-06T16:00:00Z" }), call({ starts_at: "2026-10-06T07:30:00Z", venue_name: "Bar Luna" })],
                "2026-10-06"
            )
        ).toBe("Domani: 2 telefonate, la prima con Bar Luna alle 09:30.");
    });
});

describe("vista giorno o settimana (R3/R4)", () => {
    it("al telefono sempre il giorno, poi ?vista=, poi l'ultima scelta, poi la settimana", () => {
        expect(parseAgendaView("settimana", "settimana", true)).toBe("giorno");
        expect(parseAgendaView("giorno", "settimana", false)).toBe("giorno");
        expect(parseAgendaView(null, "giorno", false)).toBe("giorno");
        expect(parseAgendaView("boh", null, false)).toBe("settimana");
    });

    it("ogni telefonata nel suo giorno della settimana", () => {
        const week = agendaWeekItems({
            weekStart: "2026-10-05",
            now: NOW,
            venues: [],
            sent: [],
            queued: [],
            appointments: [call({ id: "lun" }), call({ id: "mer", starts_at: "2026-10-07T08:00:00Z" }), call({ id: "x", status: "cancelled" })],
            nameOf: () => null
        });
        expect(week.map(d => d.key)).toEqual(["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10", "2026-10-11"]);
        expect(week.map(d => d.items.length)).toEqual([1, 0, 1, 0, 0, 0, 0]);
    });
});
