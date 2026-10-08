import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { todayIsoDate } from "../utils/dateLocal";

/**
 * «Oggi» delle prenotazioni è il giorno di Roma, non quello del dispositivo
 * (T19): un gestore con il telefono su un altro fuso vede lo stesso giorno
 * del locale. Il confine resta la mezzanotte, non un'ora.
 */
describe("todayIsoDate — the Rome day, whatever the device timezone", () => {
    const originalTz = process.env.TZ;

    beforeAll(() => {
        // Un dispositivo a New York: 6 ore dietro Roma.
        process.env.TZ = "America/New_York";
    });

    afterAll(() => {
        process.env.TZ = originalTz;
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("just after midnight in Rome it is already the next day", () => {
        vi.useFakeTimers();
        // 00:30 dell'8 ottobre a Roma, 18:30 del 7 a New York.
        vi.setSystemTime(new Date("2026-10-07T22:30:00Z"));
        expect(todayIsoDate()).toBe("2026-10-08");
    });

    it("just before midnight in Rome it is still the same day", () => {
        vi.useFakeTimers();
        // 23:30 del 7 ottobre a Roma.
        vi.setSystemTime(new Date("2026-10-07T21:30:00Z"));
        expect(todayIsoDate()).toBe("2026-10-07");
    });

    it("across the switch to winter time (25 October)", () => {
        vi.useFakeTimers();
        // 00:30 del 26 ottobre a Roma (+1), 19:30 del 25 a New York.
        vi.setSystemTime(new Date("2026-10-25T23:30:00Z"));
        expect(todayIsoDate()).toBe("2026-10-26");
    });
});
