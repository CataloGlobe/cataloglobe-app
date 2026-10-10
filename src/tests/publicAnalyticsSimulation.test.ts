import { describe, expect, it } from "vitest";
import { isSimulatedVisit } from "@/services/analytics/publicAnalytics";

describe("isSimulatedVisit", () => {
    it("visita normale: si traccia", () => {
        expect(isSimulatedVisit("", false)).toBe(false);
        expect(isSimulatedVisit("?utm_source=qr", false)).toBe(false);
    });

    it("?simulate= e ?preview=: non si traccia", () => {
        expect(isSimulatedVisit("?simulate=2026-12-24T20:00", false)).toBe(true);
        expect(isSimulatedVisit("?preview=mobile", false)).toBe(true);
        expect(isSimulatedVisit("?utm_source=qr&preview=tablet", false)).toBe(true);
    });

    it("dentro l'iframe del DeviceFrame: non si traccia", () => {
        expect(isSimulatedVisit("", true)).toBe(true);
    });
});
