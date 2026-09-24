import { describe, expect, it } from "vitest";
import { deriveScheduleStatus } from "@/utils/scheduleStatus";

const now = new Date("2026-06-01T12:00:00.000Z");

const base = {
    enabled: true,
    endAt: null,
    isConfigDraft: false,
    isZeroReach: false,
    isActiveNow: true,
    now
};

describe("deriveScheduleStatus", () => {
    it("disabled + config draft -> draft", () => {
        expect(
            deriveScheduleStatus({ ...base, enabled: false, isConfigDraft: true })
        ).toBe("draft");
    });

    it("disabled, config complete -> disabled", () => {
        expect(
            deriveScheduleStatus({ ...base, enabled: false, isConfigDraft: false })
        ).toBe("disabled");
    });

    it("enabled + zero reach -> draft, even if config is not a draft", () => {
        expect(
            deriveScheduleStatus({ ...base, isZeroReach: true, isConfigDraft: false })
        ).toBe("draft");
    });

    it("enabled, zero reach wins over expired (checked first)", () => {
        expect(
            deriveScheduleStatus({
                ...base,
                isZeroReach: true,
                endAt: "2020-01-01T00:00:00.000Z"
            })
        ).toBe("draft");
    });

    it("expired when end_at is in the past", () => {
        expect(
            deriveScheduleStatus({ ...base, endAt: "2020-01-01T00:00:00.000Z" })
        ).toBe("expired");
    });

    it("end_at exactly now counts as expired (<=)", () => {
        expect(
            deriveScheduleStatus({ ...base, endAt: now.toISOString() })
        ).toBe("expired");
    });

    it("active when isActiveNow, even if another rule overrides it (§34.4: «Adesso» is the window)", () => {
        expect(deriveScheduleStatus({ ...base, isActiveNow: true })).toBe("active");
    });

    it("scheduled when not currently active (future window)", () => {
        expect(deriveScheduleStatus({ ...base, isActiveNow: false })).toBe("scheduled");
    });

    it("defaults now to the real clock when not passed", () => {
        expect(
            deriveScheduleStatus({
                enabled: true,
                endAt: null,
                isConfigDraft: false,
                isZeroReach: false,
                isActiveNow: true
            })
        ).toBe("active");
    });
});
