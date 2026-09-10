import { describe, expect, it } from "vitest";

import {
    getReservationPeriodsForDate,
    SLOT_STEP_MIN
} from "@/pages/ReservationPage/utils/reservationSlots";
import type {
    OpeningHoursEntry,
    UpcomingClosure
} from "@/pages/ReservationPage/availability";

// `now` fisso nel passato: nessuna data dei fixture (2026) coincide con
// `nowIso`, quindi nessuno slot risulta "past" — i test leggono solo la
// GRIGLIA generata, non lo stato.
const FIXED_NOW = new Date("2020-01-01T00:00:00");
const NO_CLOSURES: UpcomingClosure[] = [];

// "2026-01-05" è un lunedì (day_of_week=0 nella convenzione activity_hours).
const MONDAY_ISO = "2026-01-05";
const TUESDAY_ISO = "2026-01-06";

function hourRow(
    dayOfWeek: number,
    opensAt: string,
    closesAt: string,
    closesNextDay = false
): OpeningHoursEntry {
    return {
        day_of_week: dayOfWeek,
        slot_index: 0,
        opens_at: opensAt,
        closes_at: closesAt,
        is_closed: false,
        closes_next_day: closesNextDay
    };
}

function flatTimes(
    isoDate: string,
    hours: OpeningHoursEntry[],
    stepMinutes: number
): string[] {
    const periods = getReservationPeriodsForDate(
        isoDate,
        hours,
        NO_CLOSURES,
        FIXED_NOW,
        stepMinutes
    );
    return periods.flatMap(p => p.slots.map(s => s.time));
}

describe("generateDaySlots (via getReservationPeriodsForDate)", () => {
    it("passo 15 su una finestra pulita", () => {
        const hours = [hourRow(0, "19:00", "21:00")];
        expect(flatTimes(MONDAY_ISO, hours, 15)).toEqual([
            "19:00", "19:15", "19:30", "19:45",
            "20:00", "20:15", "20:30", "20:45"
        ]);
    });

    it("passo 30 su una finestra pulita", () => {
        const hours = [hourRow(0, "19:00", "21:00")];
        expect(flatTimes(MONDAY_ISO, hours, 30)).toEqual([
            "19:00", "19:30", "20:00", "20:30"
        ]);
    });

    it("passo 60 su una finestra pulita", () => {
        const hours = [hourRow(0, "19:00", "21:00")];
        expect(flatTimes(MONDAY_ISO, hours, 60)).toEqual(["19:00", "20:00"]);
    });

    it("finestra non divisibile per il passo: tronca, non supera closes_at", () => {
        const hours = [hourRow(0, "19:00", "23:20")];
        const times = flatTimes(MONDAY_ISO, hours, 30);
        expect(times[times.length - 1]).toBe("23:00");
        expect(times).not.toContain("23:30");
    });

    it("servizi separati nella stessa giornata restano due finestre distinte", () => {
        const hours = [
            hourRow(0, "12:00", "14:00"),
            hourRow(0, "19:00", "21:00")
        ];
        const times = flatTimes(MONDAY_ISO, hours, 30);
        expect(times).toEqual([
            "12:00", "12:30", "13:00", "13:30",
            "19:00", "19:30", "20:00", "20:30"
        ]);
        // Nessun merge: niente tra la fine del pranzo e l'inizio della cena.
        expect(times).not.toContain("14:00");
        expect(times).not.toContain("18:30");
    });

    it("closes_next_day=true: coda oltre mezzanotte sul giorno D+1, non su D", () => {
        const hours = [hourRow(0, "22:00", "02:00", true)];

        const dayOf = flatTimes(MONDAY_ISO, hours, 30);
        expect(dayOf).toEqual(["22:00", "22:30", "23:00", "23:30"]);
        expect(dayOf.some(t => t < "22:00")).toBe(false);

        const dayAfter = flatTimes(TUESDAY_ISO, hours, 30);
        expect(dayAfter).toEqual(["00:00", "00:30", "01:00", "01:30"]);
    });

    it("SLOT_STEP_MIN resta 15 (passo del picker admin)", () => {
        expect(SLOT_STEP_MIN).toBe(15);
    });
});
