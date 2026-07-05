import { describe, it, expect } from "vitest";
import { isActivityOpen, type HourRow, type ClosureRow } from "./openingHours";

const H = (d: number, o: string, c: string, next = false): HourRow => ({
  day_of_week: d, opens_at: o, closes_at: c, closes_next_day: next, is_closed: false, slot_index: 0,
});
const P = (isoDate: string, prevIsoDate: string, dow: number, prevDow: number, minutes: number) =>
  ({ isoDate, prevIsoDate, dow, prevDow, minutes });

describe("isActivityOpen", () => {
  it("no hours configured => open (unrestricted)", () => {
    expect(isActivityOpen(P("2026-07-03", "2026-07-02", 4, 3, 600), [], [])).toBe(true);
  });
  it("inside a normal daytime slot => open", () => {
    expect(isActivityOpen(P("2026-07-03", "2026-07-02", 4, 3, 780), [H(4, "12:00", "15:00")], [])).toBe(true);
  });
  it("outside all slots of a configured day => closed", () => {
    expect(isActivityOpen(P("2026-07-03", "2026-07-02", 4, 3, 960), [H(4, "12:00", "15:00")], [])).toBe(false);
  });
  it("overnight slot on same day after opening => open (no upper bound)", () => {
    expect(isActivityOpen(P("2026-07-03", "2026-07-02", 4, 3, 1410), [H(4, "19:00", "02:00", true)], [])).toBe(true);
  });
  it("overnight tail from previous day after midnight => open", () => {
    expect(isActivityOpen(P("2026-07-03", "2026-07-02", 4, 3, 30), [H(3, "19:00", "02:00", true)], [])).toBe(true);
  });
  it("after overnight tail closes => closed", () => {
    expect(isActivityOpen(P("2026-07-03", "2026-07-02", 4, 3, 150), [H(3, "19:00", "02:00", true)], [])).toBe(false);
  });
  it("closure (is_closed) covering today overrides weekday hours => closed", () => {
    const clo: ClosureRow = { closure_date: "2026-07-03", end_date: null, is_closed: true, slots: null };
    expect(isActivityOpen(P("2026-07-03", "2026-07-02", 4, 3, 780), [H(4, "12:00", "15:00")], [clo])).toBe(false);
  });
  it("closure on today suppresses yesterday's overnight tail", () => {
    // Thu(dow3) 19:00-02:00 overnight. Friday is a full-day closure.
    // At Fri 00:30 the tail would normally spill in, but Friday's closure suppresses it.
    const clo: ClosureRow = { closure_date: "2026-07-03", end_date: null, is_closed: true, slots: null };
    expect(isActivityOpen(P("2026-07-03", "2026-07-02", 4, 3, 30), [H(3, "19:00", "02:00", true)], [clo])).toBe(false);
  });
  it("closure with override slots opens on the override window", () => {
    const clo: ClosureRow = {
      closure_date: "2026-07-01", end_date: "2026-07-05", is_closed: false,
      slots: [{ opens_at: "18:00", closes_at: "22:00", closes_next_day: false }],
    };
    expect(isActivityOpen(P("2026-07-03", "2026-07-02", 4, 3, 1200), [H(4, "12:00", "15:00")], [clo])).toBe(true);
    expect(isActivityOpen(P("2026-07-03", "2026-07-02", 4, 3, 780), [H(4, "12:00", "15:00")], [clo])).toBe(false);
  });
});
