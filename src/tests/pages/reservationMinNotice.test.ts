import { describe, expect, it } from "vitest";

import {
    buildHorizonDays,
    getReservationPeriodsForDate,
    hasBookableDays,
    RESERVATION_HORIZON_DAYS,
    RESERVATION_MIN_NOTICE_MINUTES
} from "@/pages/ReservationPage/utils/reservationSlots";
import { noticeExceedsHorizon } from "@/pages/Operativita/Attivita/tabs/reservationNoticeHorizon";
import type {
    OpeningHoursEntry,
    UpcomingClosure
} from "@/pages/ReservationPage/availability";

// FASE 4.3 — il picker onora il preavviso minimo online: uno slot il cui
// istante e' al piu' `now + preavviso` e' `past`, lo stesso stato degli orari
// gia' trascorsi. Il server rifiuta gli stessi slot con TOO_SOON.

const NO_CLOSURES: UpcomingClosure[] = [];
// "2026-01-05" e' un lunedi' (day_of_week=0). Orario locale, come il picker.
const MONDAY_ISO = "2026-01-05";
const TUESDAY_ISO = "2026-01-06";

function hourRow(dayOfWeek: number, opensAt: string, closesAt: string, closesNextDay = false): OpeningHoursEntry {
    return { day_of_week: dayOfWeek, slot_index: 0, opens_at: opensAt, closes_at: closesAt, is_closed: false, closes_next_day: closesNextDay };
}

/** Map time → state for the day, at `now`, with the given notice. */
function states(isoDate: string, hours: OpeningHoursEntry[], now: Date, minNoticeMinutes?: number): Record<string, string> {
    const periods = getReservationPeriodsForDate(isoDate, hours, NO_CLOSURES, now, 30, undefined, minNoticeMinutes);
    const out: Record<string, string> = {};
    for (const p of periods) for (const s of p.slots) out[s.time] = s.state;
    return out;
}

const EVENING = [hourRow(0, "18:00", "22:00"), hourRow(1, "18:00", "22:00")];

describe("min notice in the public picker", () => {
    it("with notice 120 and now 18:00, slots up to 20:00 are past and 20:30 is the first available", () => {
        const now = new Date("2026-01-05T18:00:00");
        const s = states(MONDAY_ISO, EVENING, now, 120);
        expect(s["18:00"]).toBe("past");
        expect(s["19:00"]).toBe("past"); // fra 60 minuti: bloccato dal preavviso
        expect(s["19:30"]).toBe("past");
        expect(s["20:00"]).toBe("past"); // esatto confine: non selezionabile (<=), come oggi per `now`
        expect(s["20:30"]).toBe("available");
        expect(s["21:30"]).toBe("available");
    });

    it("with notice 0 the rule is exactly the old one: today's elapsed slots are past, the rest available", () => {
        const now = new Date("2026-01-05T19:10:00");
        const withZero = states(MONDAY_ISO, EVENING, now, 0);
        const withDefault = states(MONDAY_ISO, EVENING, now);
        expect(withZero).toEqual(withDefault);
        expect(withZero["19:00"]).toBe("past");
        expect(withZero["19:30"]).toBe("available");
        expect(RESERVATION_MIN_NOTICE_MINUTES).toBe(0);
    });

    it("notice 0 leaves a future day untouched", () => {
        const now = new Date("2026-01-05T19:10:00");
        const s = states(TUESDAY_ISO, EVENING, now, 0);
        expect(Object.values(s).every(v => v === "available")).toBe(true);
    });

    it("a notice that crosses midnight blocks the next day's early slots too", () => {
        // now 21:00 Monday, notice 24h → cutoff Tuesday 21:00
        const now = new Date("2026-01-05T21:00:00");
        const s = states(TUESDAY_ISO, EVENING, now, 24 * 60);
        expect(s["18:00"]).toBe("past");
        expect(s["21:00"]).toBe("past");
        expect(s["21:30"]).toBe("available");
    });

    it("past wins over soldout on a notice-blocked slot", () => {
        const now = new Date("2026-01-05T18:00:00");
        const periods = getReservationPeriodsForDate(MONDAY_ISO, EVENING, NO_CLOSURES, now, 30, new Set(["19:00", "21:00"]), 120);
        const flat = Object.fromEntries(periods.flatMap(p => p.slots.map(s => [s.time, s.state])));
        expect(flat["19:00"]).toBe("past");
        expect(flat["21:00"]).toBe("soldout");
    });
});

// L'orizzonte e' un parametro letto dal payload, non la costante: con 3 giorni
// il calendario si ferma a oggi+2 (oggi compreso), qualunque sia il default.

describe("horizon comes from the payload value, not the constant", () => {
    const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6].map(d => hourRow(d, "18:00", "22:00"));

    it("buildHorizonDays with 3 covers today, today+1, today+2 only", () => {
        const days = buildHorizonDays(EVERY_DAY, NO_CLOSURES, 3, MONDAY_ISO);
        expect(days.map(d => d.iso)).toEqual(["2026-01-05", "2026-01-06", "2026-01-07"]);
        expect(RESERVATION_HORIZON_DAYS).toBe(90);
    });

    it("hasBookableDays honours a short horizon: only Sunday open, horizon 3 from Monday → nothing bookable", () => {
        const sundayOnly = [hourRow(6, "18:00", "22:00")];
        expect(hasBookableDays(sundayOnly, NO_CLOSURES, 3, MONDAY_ISO)).toBe(false);
        expect(hasBookableDays(sundayOnly, NO_CLOSURES, 7, MONDAY_ISO)).toBe(true);
    });
});

describe("notice-over-horizon warning", () => {
    it("warns when the notice is longer than the whole horizon (7 days vs 3)", () => {
        expect(noticeExceedsHorizon(7 * 24 * 60, 3)).toBe(true);
    });

    it("does not warn at the boundary or below (3 days vs 3, 120 min vs 1 day)", () => {
        expect(noticeExceedsHorizon(3 * 24 * 60, 3)).toBe(false);
        expect(noticeExceedsHorizon(120, 1)).toBe(false);
        expect(noticeExceedsHorizon(0, 90)).toBe(false);
    });

    it("never warns on a non-numeric draft", () => {
        expect(noticeExceedsHorizon(Number.NaN, 3)).toBe(false);
        expect(noticeExceedsHorizon(120, Number.NaN)).toBe(false);
    });
});
