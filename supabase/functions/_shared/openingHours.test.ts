import { describe, it, expect } from "vitest";
import {
  isActivityOpenNow,
  isReservationTimeBookable,
  type HourRow,
  type ClosureRow,
  type ReservationBookabilityInput,
} from "./openingHours";

const H = (d: number, o: string, c: string, next = false): HourRow => ({
  day_of_week: d, opens_at: o, closes_at: c, closes_next_day: next, is_closed: false, slot_index: 0,
});
const P = (isoDate: string, prevIsoDate: string, dow: number, prevDow: number, minutes: number) =>
  ({ isoDate, prevIsoDate, dow, prevDow, minutes });

describe("isActivityOpenNow", () => {
  it("no hours configured => open (unrestricted)", () => {
    expect(isActivityOpenNow(P("2026-07-03", "2026-07-02", 4, 3, 600), [], [])).toBe(true);
  });
  it("inside a normal daytime slot => open", () => {
    expect(isActivityOpenNow(P("2026-07-03", "2026-07-02", 4, 3, 780), [H(4, "12:00", "15:00")], [])).toBe(true);
  });
  it("outside all slots of a configured day => closed", () => {
    expect(isActivityOpenNow(P("2026-07-03", "2026-07-02", 4, 3, 960), [H(4, "12:00", "15:00")], [])).toBe(false);
  });
  it("overnight slot on same day after opening => open (no upper bound)", () => {
    expect(isActivityOpenNow(P("2026-07-03", "2026-07-02", 4, 3, 1410), [H(4, "19:00", "02:00", true)], [])).toBe(true);
  });
  it("overnight tail from previous day after midnight => open", () => {
    expect(isActivityOpenNow(P("2026-07-03", "2026-07-02", 4, 3, 30), [H(3, "19:00", "02:00", true)], [])).toBe(true);
  });
  it("after overnight tail closes => closed", () => {
    expect(isActivityOpenNow(P("2026-07-03", "2026-07-02", 4, 3, 150), [H(3, "19:00", "02:00", true)], [])).toBe(false);
  });
  it("closure (is_closed) covering today overrides weekday hours => closed", () => {
    const clo: ClosureRow = { closure_date: "2026-07-03", end_date: null, is_closed: true, slots: null };
    expect(isActivityOpenNow(P("2026-07-03", "2026-07-02", 4, 3, 780), [H(4, "12:00", "15:00")], [clo])).toBe(false);
  });
  it("closure on today suppresses yesterday's overnight tail", () => {
    // Thu(dow3) 19:00-02:00 overnight. Friday is a full-day closure.
    // At Fri 00:30 the tail would normally spill in, but Friday's closure suppresses it.
    const clo: ClosureRow = { closure_date: "2026-07-03", end_date: null, is_closed: true, slots: null };
    expect(isActivityOpenNow(P("2026-07-03", "2026-07-02", 4, 3, 30), [H(3, "19:00", "02:00", true)], [clo])).toBe(false);
  });
  it("closure with override slots opens on the override window", () => {
    const clo: ClosureRow = {
      closure_date: "2026-07-01", end_date: "2026-07-05", is_closed: false,
      slots: [{ opens_at: "18:00", closes_at: "22:00", closes_next_day: false }],
    };
    expect(isActivityOpenNow(P("2026-07-03", "2026-07-02", 4, 3, 1200), [H(4, "12:00", "15:00")], [clo])).toBe(true);
    expect(isActivityOpenNow(P("2026-07-03", "2026-07-02", 4, 3, 780), [H(4, "12:00", "15:00")], [clo])).toBe(false);
  });
});

// ── isReservationTimeBookable ─────────────────────────────────────────────
// Sede di riferimento: lun–dom 12:00–15:00 e 19:00–23:00, giovedì chiuso,
// venerdì sera fino alle 02:00 del sabato. `now` fisso: martedì 15/9/2026
// alle 10:00 ora italiana (CEST).

const WEEK: HourRow[] = [
  ...[0, 1, 2, 5, 6].flatMap((d) => [
    { ...H(d, "12:00", "15:00"), slot_index: 0 },
    { ...H(d, "19:00", "23:00"), slot_index: 1 },
  ]),
  { day_of_week: 3, opens_at: null, closes_at: null, closes_next_day: false, is_closed: true, slot_index: 0 },
  { ...H(4, "12:00", "15:00"), slot_index: 0 },
  { ...H(4, "19:00", "02:00", true), slot_index: 1 },
];
const NOW = new Date("2026-09-15T10:00:00+02:00"); // martedì

function ask(over: Partial<ReservationBookabilityInput>) {
  return isReservationTimeBookable({
    hours: WEEK, closures: [], reservationDate: "2026-09-15", reservationTime: "13:00",
    slotMinutes: 15, minNoticeMinutes: 0, horizonDays: 90, now: NOW, ...over,
  });
}
const fails = (r: ReturnType<typeof ask>) => (r.ok ? null : r.reason);

describe("isReservationTimeBookable", () => {
  it("baseline: martedì 13:00 su una sede configurata → prenotabile", () => {
    expect(ask({})).toEqual({ ok: true });
  });

  it("sede senza orari → VENUE_NOT_BOOKABLE, prima di ogni altro controllo", () => {
    expect(fails(ask({ hours: [] }))).toBe("VENUE_NOT_BOOKABLE");
    expect(fails(ask({ hours: [], reservationDate: "2027-09-15" }))).toBe("VENUE_NOT_BOOKABLE");
  });

  it("giorno chiuso (is_closed) → VENUE_CLOSED", () => {
    expect(fails(ask({ reservationDate: "2026-09-17" }))).toBe("VENUE_CLOSED"); // giovedì
  });

  it("chiusura straordinaria piena → VENUE_CLOSED anche in un giorno normalmente aperto", () => {
    const clo: ClosureRow = { closure_date: "2026-09-16", end_date: null, is_closed: true, slots: null };
    expect(fails(ask({ closures: [clo], reservationDate: "2026-09-16" }))).toBe("VENUE_CLOSED");
  });

  it("chiusura straordinaria a range (inclusivo) → VENUE_CLOSED su tutto il range", () => {
    const clo: ClosureRow = { closure_date: "2026-09-16", end_date: "2026-09-18", is_closed: true, slots: null };
    expect(fails(ask({ closures: [clo], reservationDate: "2026-09-18" }))).toBe("VENUE_CLOSED");
    expect(ask({ closures: [clo], reservationDate: "2026-09-19" })).toEqual({ ok: true }); // sabato, fuori range
  });

  it("chiusura parziale: le sue fasce sostituiscono quelle del giorno", () => {
    const clo: ClosureRow = {
      closure_date: "2026-09-16", end_date: null, is_closed: false,
      slots: [{ opens_at: "18:00", closes_at: "20:00", closes_next_day: false }],
    };
    expect(fails(ask({ closures: [clo], reservationDate: "2026-09-16", reservationTime: "13:00" }))).toBe("VENUE_CLOSED");
    expect(ask({ closures: [clo], reservationDate: "2026-09-16", reservationTime: "18:30" })).toEqual({ ok: true });
  });

  it("coda notturna: venerdì 19:00–02:00 rende prenotabile sabato 01:00, non le 02:00", () => {
    expect(ask({ reservationDate: "2026-09-19", reservationTime: "01:00" })).toEqual({ ok: true });
    expect(ask({ reservationDate: "2026-09-19", reservationTime: "01:45" })).toEqual({ ok: true });
    expect(fails(ask({ reservationDate: "2026-09-19", reservationTime: "02:00" }))).toBe("VENUE_CLOSED");
    // Sul venerdì stesso la fascia serale va fino a mezzanotte.
    expect(ask({ reservationDate: "2026-09-18", reservationTime: "23:45" })).toEqual({ ok: true });
  });

  it("una chiusura sul giorno dopo sopprime la coda notturna", () => {
    const clo: ClosureRow = { closure_date: "2026-09-19", end_date: null, is_closed: true, slots: null };
    expect(fails(ask({ closures: [clo], reservationDate: "2026-09-19", reservationTime: "01:00" }))).toBe("VENUE_CLOSED");
  });

  it("orario esatto di chiusura RIFIUTATO: l'ultimo slot è 22:45, le 23:00 non esistono", () => {
    expect(ask({ reservationTime: "22:45" })).toEqual({ ok: true });
    expect(fails(ask({ reservationTime: "23:00" }))).toBe("VENUE_CLOSED");
    expect(fails(ask({ reservationTime: "15:00" }))).toBe("VENUE_CLOSED");
  });

  it("fuori dalle fasce ma nel giorno aperto → VENUE_CLOSED", () => {
    expect(fails(ask({ reservationTime: "05:00" }))).toBe("VENUE_CLOSED");
    expect(fails(ask({ reservationTime: "16:30" }))).toBe("VENUE_CLOSED");
  });

  it("dentro la fascia ma non sulla griglia → TIME_NOT_ON_GRID", () => {
    expect(fails(ask({ reservationTime: "13:07" }))).toBe("TIME_NOT_ON_GRID");
    expect(fails(ask({ reservationTime: "13:15", slotMinutes: 30 }))).toBe("TIME_NOT_ON_GRID");
    expect(ask({ reservationTime: "13:30", slotMinutes: 30 })).toEqual({ ok: true });
    expect(ask({ reservationTime: "13:00:00" })).toEqual({ ok: true }); // forma Postgres
  });

  it("la griglia parte dall'apertura della fascia, non da mezzanotte", () => {
    const hours: HourRow[] = [H(1, "12:10", "15:00")];
    expect(ask({ hours, reservationTime: "12:10" })).toEqual({ ok: true });
    expect(ask({ hours, reservationTime: "12:25" })).toEqual({ ok: true });
    expect(fails(ask({ hours, reservationTime: "12:15" }))).toBe("TIME_NOT_ON_GRID");
  });

  it("preavviso 0: un orario appena passato → TOO_SOON, l'istante esatto passa", () => {
    const now = new Date("2026-09-15T13:30:00+02:00");
    expect(fails(ask({ now, reservationTime: "13:15" }))).toBe("TOO_SOON");
    expect(ask({ now, reservationTime: "13:30" })).toEqual({ ok: true });
    expect(ask({ now, reservationTime: "13:45" })).toEqual({ ok: true });
  });

  it("preavviso 120: prenotare fra 60 minuti → TOO_SOON, fra 135 passa", () => {
    const now = new Date("2026-09-15T12:00:00+02:00");
    expect(fails(ask({ now, minNoticeMinutes: 120, reservationTime: "13:00" }))).toBe("TOO_SOON");
    expect(ask({ now, minNoticeMinutes: 120, reservationTime: "14:15" })).toEqual({ ok: true });
  });

  it("il bug della mezzanotte: alle 00:30 italiane «ieri sera» è passato, non «oggi in UTC»", () => {
    // 00:30 CEST del 16/9 = 22:30 UTC del 15/9. Il vecchio confronto fra date
    // UTC accettava il 15/9; il confronto fra istanti no.
    const now = new Date("2026-09-16T00:30:00+02:00");
    expect(fails(ask({ now, reservationDate: "2026-09-15", reservationTime: "22:00" }))).toBe("TOO_SOON");
  });

  it("orizzonte: oggi + 89 passa, oggi + 90 → BEYOND_HORIZON", () => {
    expect(ask({ reservationDate: "2026-12-13" })).toEqual({ ok: true });            // domenica, +89
    expect(fails(ask({ reservationDate: "2026-12-14" }))).toBe("BEYOND_HORIZON");    // lunedì, +90
    expect(ask({ reservationDate: "2026-12-14", horizonDays: 91 })).toEqual({ ok: true });
    expect(fails(ask({ reservationDate: "2026-09-16", horizonDays: 1 }))).toBe("BEYOND_HORIZON");
  });

  it("l'orizzonte si conta in giorni di calendario italiani, non in ore UTC", () => {
    // 23:30 CEST del 15/9 = 21:30 UTC: «oggi» a Roma è ancora il 15.
    const now = new Date("2026-09-15T23:30:00+02:00");
    expect(fails(ask({ now, reservationDate: "2026-12-14", reservationTime: "13:00" }))).toBe("BEYOND_HORIZON");
    expect(ask({ now, reservationDate: "2026-12-13", reservationTime: "13:00" })).toEqual({ ok: true });
  });

  it("data o ora malformate → VENUE_CLOSED, mai prenotabile", () => {
    expect(fails(ask({ reservationDate: "15/09/2026" }))).toBe("VENUE_CLOSED");
    expect(fails(ask({ reservationTime: "1pm" }))).toBe("VENUE_CLOSED");
  });
});

describe("la divergenza voluta sulla sede senza orari", () => {
  it("ordini: aperto; prenotazioni: non prenotabile", () => {
    expect(isActivityOpenNow(P("2026-09-15", "2026-09-14", 1, 0, 600), [], [])).toBe(true);
    expect(fails(ask({ hours: [] }))).toBe("VENUE_NOT_BOOKABLE");
  });
});
