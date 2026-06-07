import { describe, it, expect } from "vitest";
import {
    canAccept,
    peakConcurrent,
    type CapacityReservation
} from "@/utils/reservationCapacity";

const ACTIVITY = "act-1";

function row(
    id: string,
    date: string,
    time: string,
    party: number,
    status: CapacityReservation["status"] = "confirmed",
    activity = ACTIVITY
): CapacityReservation {
    return {
        id,
        activity_id: activity,
        reservation_date: date,
        reservation_time: time,
        party_size: party,
        status
    };
}

describe("peakConcurrent", () => {
    it("returns 0 when no rows overlap the window", () => {
        const rows = [row("r1", "2026-06-10", "12:00", 4)];
        const candidate = {
            activity_id: ACTIVITY,
            reservation_date: "2026-06-10",
            reservation_time: "20:00",
            party_size: 2
        };
        // 12:00 + 120 = 14:00 → doesn't reach the 20:00 window.
        expect(peakConcurrent(rows, candidate, 120)).toBe(0);
    });

    it("sums party sizes of overlapping reservations (peak, not sum)", () => {
        const rows = [
            row("r1", "2026-06-10", "19:00", 2), // [19:00, 21:00)
            row("r2", "2026-06-10", "19:30", 4), // [19:30, 21:30)
            row("r3", "2026-06-10", "22:30", 6)  // [22:30, 24:30) — outside
        ];
        const candidate = {
            activity_id: ACTIVITY,
            reservation_date: "2026-06-10",
            reservation_time: "20:00",
            party_size: 0
        };
        // window [20:00, 22:00). At 20:00 both r1 (2) + r2 (4) are seated → 6.
        // r1 leaves at 21:00 → 4. r3 outside.
        expect(peakConcurrent(rows, candidate, 120)).toBe(6);
    });

    it("ignores declined and cancelled rows", () => {
        const rows = [
            row("r1", "2026-06-10", "19:00", 10, "declined"),
            row("r2", "2026-06-10", "19:30", 10, "cancelled"),
            row("r3", "2026-06-10", "19:30", 4,  "pending"),
            row("r4", "2026-06-10", "19:30", 4,  "confirmed")
        ];
        const candidate = {
            activity_id: ACTIVITY,
            reservation_date: "2026-06-10",
            reservation_time: "20:00",
            party_size: 0
        };
        // Only r3 + r4 contribute → 8.
        expect(peakConcurrent(rows, candidate, 120)).toBe(8);
    });

    it("counts pending + confirmed (NOT only confirmed)", () => {
        const rows = [
            row("r1", "2026-06-10", "19:30", 3, "pending"),
            row("r2", "2026-06-10", "19:30", 5, "confirmed")
        ];
        const candidate = {
            activity_id: ACTIVITY,
            reservation_date: "2026-06-10",
            reservation_time: "20:00",
            party_size: 0
        };
        expect(peakConcurrent(rows, candidate, 120)).toBe(8);
    });

    it("handles overlap across midnight via D-1/D/D+1 axis", () => {
        // Yesterday's 23:00 booking with 120min duration runs 23:00 → 01:00.
        const rows = [row("r1", "2026-06-09", "23:00", 4)];
        const candidate = {
            activity_id: ACTIVITY,
            reservation_date: "2026-06-10",
            reservation_time: "00:30",
            party_size: 0
        };
        // candidate window [00:30, 02:30) of D=06-10. r1 runs until 01:00,
        // so it overlaps the window opening → peak = 4.
        expect(peakConcurrent(rows, candidate, 120)).toBe(4);
    });

    it("treats intervals as half-open: 19→21 does NOT collide with 21→23", () => {
        const rows = [row("r1", "2026-06-10", "19:00", 4)];
        const candidate = {
            activity_id: ACTIVITY,
            reservation_date: "2026-06-10",
            reservation_time: "21:00",
            party_size: 0
        };
        // 19:00 + 120 = 21:00 (departure). Candidate starts at 21:00.
        // Half-open → departure fires first, peak in [21:00, 23:00) = 0.
        expect(peakConcurrent(rows, candidate, 120)).toBe(0);
    });

    it("self-excludes a candidate already present (edit case)", () => {
        const rows = [
            row("editing", "2026-06-10", "20:00", 4),
            row("r2", "2026-06-10", "20:00", 3)
        ];
        const candidate = {
            id: "editing",
            activity_id: ACTIVITY,
            reservation_date: "2026-06-10",
            reservation_time: "20:00",
            party_size: 4
        };
        // peakConcurrent does NOT add the candidate; excludeId removes the
        // existing row with that id so the caller can re-add it via canAccept.
        expect(peakConcurrent(rows, candidate, 120, { excludeId: "editing" }))
            .toBe(3);
    });

    it("ignores rows from other activities", () => {
        const rows = [
            row("r1", "2026-06-10", "20:00", 99, "confirmed", "OTHER")
        ];
        const candidate = {
            activity_id: ACTIVITY,
            reservation_date: "2026-06-10",
            reservation_time: "20:00",
            party_size: 0
        };
        expect(peakConcurrent(rows, candidate, 120)).toBe(0);
    });
});

describe("canAccept", () => {
    it("returns ok=true with peakWithCandidate when capacity is null (unlimited)", () => {
        const rows = [row("r1", "2026-06-10", "19:30", 50)];
        const candidate = {
            activity_id: ACTIVITY,
            reservation_date: "2026-06-10",
            reservation_time: "20:00",
            party_size: 4
        };
        const res = canAccept({ capacity: null, durationMin: 120 }, rows, candidate);
        expect(res.ok).toBe(true);
        expect(res.peakWithCandidate).toBe(54);
        expect(res.reason).toBeUndefined();
    });

    it("returns ok=true when peak <= capacity", () => {
        const rows = [row("r1", "2026-06-10", "19:30", 6)];
        const candidate = {
            activity_id: ACTIVITY,
            reservation_date: "2026-06-10",
            reservation_time: "20:00",
            party_size: 4
        };
        const res = canAccept({ capacity: 10, durationMin: 120 }, rows, candidate);
        expect(res.ok).toBe(true);
        expect(res.peakWithCandidate).toBe(10);
    });

    it("returns ok=false with reason over_capacity when peak > capacity", () => {
        const rows = [
            row("r1", "2026-06-10", "19:30", 8),
            row("r2", "2026-06-10", "19:45", 4)
        ];
        const candidate = {
            activity_id: ACTIVITY,
            reservation_date: "2026-06-10",
            reservation_time: "20:00",
            party_size: 2
        };
        const res = canAccept({ capacity: 10, durationMin: 120 }, rows, candidate);
        expect(res.ok).toBe(false);
        expect(res.peakWithCandidate).toBe(14);
        expect(res.reason).toBe("over_capacity");
    });

    it("self-excludes by id when re-checking an edited reservation", () => {
        const rows = [
            row("editing", "2026-06-10", "20:00", 4),
            row("r2", "2026-06-10", "20:00", 4)
        ];
        const candidate = {
            id: "editing",
            activity_id: ACTIVITY,
            reservation_date: "2026-06-10",
            reservation_time: "20:00",
            party_size: 4
        };
        // Without self-exclude this would double-count → peak=12. With:
        // existing row "editing" is filtered out, candidate (4) + r2 (4) = 8.
        const res = canAccept({ capacity: 10, durationMin: 120 }, rows, candidate);
        expect(res.ok).toBe(true);
        expect(res.peakWithCandidate).toBe(8);
    });
});
