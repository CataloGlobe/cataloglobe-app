import { describe, expect, it } from "vitest";
import {
    DEFAULT_CALL_WINDOWS,
    briefAt,
    callReminderAt,
    fillCallPlaceholders,
    formatCallDay,
    formatCallTime,
    isInsideCallWindows,
    overlapsOf,
    parseCallWindows,
    plannedReminderAt,
    romeDayKey,
    romeParts,
    romeWallClock,
    suggestCallSlots
} from "./crmCallSlots";

const iso = (d: Date) => d.toISOString();

describe("romeWallClock", () => {
    it("ora solare (+1) e ora legale (+2)", () => {
        expect(iso(romeWallClock(2026, 1, 15, 9, 0))).toBe("2026-01-15T08:00:00.000Z");
        expect(iso(romeWallClock(2026, 7, 15, 9, 0))).toBe("2026-07-15T07:00:00.000Z");
    });

    it("il giorno del cambio dell'ora", () => {
        // 29/3/2026: alle 2 si va alle 3.
        expect(iso(romeWallClock(2026, 3, 29, 9, 0))).toBe("2026-03-29T07:00:00.000Z");
        expect(iso(romeWallClock(2026, 3, 28, 9, 0))).toBe("2026-03-28T08:00:00.000Z");
        // 25/10/2026: alle 3 si torna alle 2.
        expect(iso(romeWallClock(2026, 10, 25, 17, 30))).toBe("2026-10-25T16:30:00.000Z");
        expect(iso(romeWallClock(2026, 10, 24, 17, 30))).toBe("2026-10-24T15:30:00.000Z");
    });

    it("l'ora che non esiste scivola avanti", () => {
        const d = romeWallClock(2026, 3, 29, 2, 30);
        expect(romeParts(d).hour).toBe(3);
    });

    it("romeParts dà il giorno della settimana ISO", () => {
        expect(romeParts(new Date("2026-10-05T08:00:00Z")).weekday).toBe(1); // lunedì
        expect(romeParts(new Date("2026-10-04T08:00:00Z")).weekday).toBe(7); // domenica
        // 23:30 UTC di domenica è già lunedì a Roma.
        expect(romeDayKey(new Date("2026-10-04T23:30:00Z"))).toBe("2026-10-05");
    });
});

describe("parseCallWindows", () => {
    it("accetta le fasce predefinite", () => {
        expect(parseCallWindows(DEFAULT_CALL_WINDOWS)).toEqual(DEFAULT_CALL_WINDOWS);
    });

    it("ordina i giorni", () => {
        expect(parseCallWindows([{ days: [5, 1], start: "09:00", end: "10:00" }])?.[0].days).toEqual([1, 5]);
    });

    it.each([
        ["non un array", { days: [1], start: "09:00", end: "10:00" }],
        ["giorno fuori", [{ days: [0], start: "09:00", end: "10:00" }]],
        ["giorni doppi", [{ days: [1, 1], start: "09:00", end: "10:00" }]],
        ["senza giorni", [{ days: [], start: "09:00", end: "10:00" }]],
        ["ora storta", [{ days: [1], start: "9:00", end: "10:00" }]],
        ["fine prima dell'inizio", [{ days: [1], start: "11:00", end: "10:00" }]],
        ["vuota uguale", [{ days: [1], start: "10:00", end: "10:00" }]],
        ["giorno decimale", [{ days: [1.5], start: "09:00", end: "10:00" }]]
    ])("rifiuta: %s", (_label, value) => {
        expect(parseCallWindows(value)).toBeNull();
    });

    it("rifiuta più di 12 fasce", () => {
        const many = Array.from({ length: 13 }, () => ({ days: [1], start: "09:00", end: "10:00" }));
        expect(parseCallWindows(many)).toBeNull();
    });
});

describe("isInsideCallWindows", () => {
    // Lunedì 5 ottobre 2026 (ora legale, +2).
    const at = (h: number, m: number) => romeWallClock(2026, 10, 5, h, m);

    it("dentro e sul bordo", () => {
        expect(isInsideCallWindows(at(9, 0), 10, DEFAULT_CALL_WINDOWS)).toBe(true);
        expect(isInsideCallWindows(at(10, 50), 10, DEFAULT_CALL_WINDOWS)).toBe(true);
        expect(isInsideCallWindows(at(18, 20), 10, DEFAULT_CALL_WINDOWS)).toBe(true);
    });

    it("fuori, o a cavallo della fine", () => {
        expect(isInsideCallWindows(at(10, 55), 10, DEFAULT_CALL_WINDOWS)).toBe(false);
        expect(isInsideCallWindows(at(12, 0), 10, DEFAULT_CALL_WINDOWS)).toBe(false);
        expect(isInsideCallWindows(at(8, 55), 10, DEFAULT_CALL_WINDOWS)).toBe(false);
    });

    it("il sabato no", () => {
        expect(isInsideCallWindows(romeWallClock(2026, 10, 10, 9, 30), 10, DEFAULT_CALL_WINDOWS)).toBe(false);
    });
});

describe("overlapsOf", () => {
    const busy = [
        { start: new Date("2026-10-05T07:00:00Z"), end: new Date("2026-10-05T07:30:00Z"), label: "Dentista" }
    ];
    it("accavallo sì, contatto no", () => {
        expect(overlapsOf(new Date("2026-10-05T07:20:00Z"), new Date("2026-10-05T07:40:00Z"), busy)).toHaveLength(1);
        expect(overlapsOf(new Date("2026-10-05T07:30:00Z"), new Date("2026-10-05T07:40:00Z"), busy)).toHaveLength(0);
        expect(overlapsOf(new Date("2026-10-05T06:50:00Z"), new Date("2026-10-05T07:00:00Z"), busy)).toHaveLength(0);
        expect(overlapsOf(new Date("2026-10-05T06:00:00Z"), new Date("2026-10-05T09:00:00Z"), busy)).toHaveLength(1);
    });
});

describe("suggestCallSlots", () => {
    const base = {
        windows: DEFAULT_CALL_WINDOWS,
        durationMinutes: 10,
        minNoticeMinutes: 60,
        busy: [] as { start: Date; end: Date; label: string }[]
    };

    it("lunedì alle 8: dalle 9 a passi di 15", () => {
        const now = romeWallClock(2026, 10, 5, 8, 0);
        const slots = suggestCallSlots({ ...base, now, limit: 3 });
        expect(slots.map(formatCallTime)).toEqual(["09:00", "09:15", "09:30"]);
    });

    it("rispetta il preavviso", () => {
        const now = romeWallClock(2026, 10, 5, 9, 40);
        const slots = suggestCallSlots({ ...base, now, limit: 2 });
        expect(slots.map(formatCallTime)).toEqual(["10:45", "17:30"]);
    });

    it("salta gli impegni", () => {
        const now = romeWallClock(2026, 10, 5, 7, 0);
        const busy = [{ start: romeWallClock(2026, 10, 5, 9, 0), end: romeWallClock(2026, 10, 5, 9, 20), label: "x" }];
        const slots = suggestCallSlots({ ...base, now, busy, limit: 2 });
        expect(slots.map(formatCallTime)).toEqual(["09:30", "09:45"]);
    });

    it("venerdì sera passa a lunedì, saltando il fine settimana", () => {
        const now = romeWallClock(2026, 10, 9, 19, 0);
        const [first] = suggestCallSlots({ ...base, now, limit: 1 });
        expect(romeDayKey(first)).toBe("2026-10-12");
        expect(formatCallTime(first)).toBe("09:00");
    });

    it("niente fasce, niente orari", () => {
        const now = romeWallClock(2026, 10, 5, 8, 0);
        expect(suggestCallSlots({ ...base, windows: [], now })).toEqual([]);
    });

    it("la durata deve stare nella fascia", () => {
        const now = romeWallClock(2026, 10, 5, 12, 0);
        const slots = suggestCallSlots({ ...base, durationMinutes: 60, now, limit: 5 });
        // 17:30-18:30 regge solo una telefonata da un'ora che parte alle 17:30.
        expect(slots.map(s => `${romeDayKey(s)} ${formatCallTime(s)}`)[0]).toBe("2026-10-05 17:30");
        expect(slots.map(formatCallTime)).not.toContain("17:45");
    });

    it("nel giorno del cambio dell'ora gli orari restano da parete", () => {
        const now = romeWallClock(2026, 10, 23, 19, 0); // venerdì
        const windows = [{ days: [7], start: "09:00", end: "09:30" }];
        const slots = suggestCallSlots({ ...base, windows, now, limit: 2 });
        expect(slots.map(s => `${romeDayKey(s)} ${formatCallTime(s)}`)).toEqual(["2026-10-25 09:00", "2026-10-25 09:15"]);
    });
});

describe("promemoria e brief", () => {
    it("il giorno prima alle 18 di Roma", () => {
        const starts = romeWallClock(2026, 10, 8, 17, 45);
        expect(iso(callReminderAt(starts))).toBe("2026-10-07T16:00:00.000Z");
    });

    it("a cavallo del cambio dell'ora", () => {
        // Telefonata lunedì 26/10 (ora solare): promemoria domenica 25 alle 18 (+1).
        const starts = romeWallClock(2026, 10, 26, 9, 0);
        expect(iso(callReminderAt(starts))).toBe("2026-10-25T17:00:00.000Z");
    });

    it("fissata dopo le 18 del giorno prima: niente promemoria", () => {
        const starts = romeWallClock(2026, 10, 8, 9, 0);
        expect(plannedReminderAt(starts, romeWallClock(2026, 10, 7, 18, 30))).toBeNull();
        expect(plannedReminderAt(starts, romeWallClock(2026, 10, 8, 7, 0))).toBeNull();
        expect(plannedReminderAt(starts, romeWallClock(2026, 10, 7, 17, 59))).not.toBeNull();
    });

    it("brief un'ora prima", () => {
        const starts = new Date("2026-10-08T15:45:00Z");
        expect(iso(briefAt(starts))).toBe("2026-10-08T14:45:00.000Z");
    });
});

describe("testi", () => {
    it("giorno e ora in italiano", () => {
        const at = romeWallClock(2026, 10, 8, 17, 45);
        expect(formatCallDay(at)).toBe("giovedì 8");
        expect(formatCallTime(at)).toBe("17:45");
        expect(formatCallTime(romeWallClock(2026, 10, 8, 9, 5))).toBe("09:05");
    });

    it("riempie {giorno} e {ora}, lascia il resto", () => {
        const at = romeWallClock(2026, 10, 8, 17, 45);
        expect(fillCallPlaceholders("Perfetto {nome}, ti chiamo {giorno} alle {ora}. {ora}!", at)).toBe(
            "Perfetto {nome}, ti chiamo giovedì 8 alle 17:45. 17:45!"
        );
    });
});
