import { describe, it, expect } from "vitest";
import {
    OCCUPYING_STATUSES,
    reservationWindowsOverlap,
    detectReservationTableConflicts,
    type ConflictReservation,
    type ConflictAssignment
} from "@/utils/reservationTableConflicts";

const ACT = "act-1";

function res(
    id: string,
    date: string,
    time: string,
    status: ConflictReservation["status"] = "confirmed",
    activity = ACT
): ConflictReservation {
    return { id, activity_id: activity, reservation_date: date, reservation_time: time, status };
}

function asg(
    reservationId: string,
    tableId: string,
    opts: { deleted?: boolean; missing?: boolean; activity?: string } = {}
): ConflictAssignment {
    return {
        reservation_id: reservationId,
        table_id: tableId,
        activity_id: opts.activity ?? ACT,
        table: opts.missing
            ? null
            : { deleted_at: opts.deleted ? "2026-09-01T00:00:00Z" : null }
    };
}

const DUR = new Map([[ACT, 120]]);

describe("OCCUPYING_STATUSES", () => {
    it("mirrors the SQL engine: pending, confirmed, seated", () => {
        expect([...OCCUPYING_STATUSES].sort()).toEqual(["confirmed", "pending", "seated"]);
    });
});

describe("reservationWindowsOverlap", () => {
    const a = { reservation_date: "2026-09-10", reservation_time: "20:00:00" };

    it("half-open: [20:00, 22:00) does not touch [22:00, 00:00)", () => {
        expect(reservationWindowsOverlap(a, { reservation_date: "2026-09-10", reservation_time: "22:00:00" }, 120)).toBe(false);
    });

    it("overlaps when the other starts one minute before the end", () => {
        expect(reservationWindowsOverlap(a, { reservation_date: "2026-09-10", reservation_time: "21:59:00" }, 120)).toBe(true);
    });

    it("overlaps when the other ends one minute after the start", () => {
        expect(reservationWindowsOverlap(a, { reservation_date: "2026-09-10", reservation_time: "18:01:00" }, 120)).toBe(true);
    });

    it("does not overlap when the other ends exactly at the start", () => {
        expect(reservationWindowsOverlap(a, { reservation_date: "2026-09-10", reservation_time: "18:00:00" }, 120)).toBe(false);
    });

    it("crosses midnight: 23:30 on D overlaps 00:30 on D+1", () => {
        const late = { reservation_date: "2026-09-10", reservation_time: "23:30:00" };
        const next = { reservation_date: "2026-09-11", reservation_time: "00:30:00" };
        expect(reservationWindowsOverlap(late, next, 120)).toBe(true);
        expect(reservationWindowsOverlap(next, late, 120)).toBe(true);
    });

    it("ignores rows outside the D-1..D+1 band even with absurd durations", () => {
        const far = { reservation_date: "2026-09-13", reservation_time: "20:00:00" };
        expect(reservationWindowsOverlap(a, far, 100000)).toBe(false);
    });

    it("is symmetric", () => {
        const b = { reservation_date: "2026-09-10", reservation_time: "21:00:00" };
        expect(reservationWindowsOverlap(a, b, 120)).toBe(reservationWindowsOverlap(b, a, 120));
    });

    it("returns false on malformed input", () => {
        expect(reservationWindowsOverlap(a, { reservation_date: "bad", reservation_time: "20:00" }, 120)).toBe(false);
        expect(reservationWindowsOverlap(a, a, 0)).toBe(false);
    });
});

describe("detectReservationTableConflicts", () => {
    it("returns an empty map when nothing overlaps", () => {
        const reservations = [res("r1", "2026-09-10", "19:00:00"), res("r2", "2026-09-10", "21:00:00")];
        const assignments = [asg("r1", "t1"), asg("r2", "t1")];
        const out = detectReservationTableConflicts(reservations, assignments, DUR);
        expect(out.size).toBe(0);
    });

    it("flags both reservations sharing a table with overlapping windows", () => {
        const reservations = [res("r1", "2026-09-10", "20:00:00"), res("r2", "2026-09-10", "21:00:00")];
        const assignments = [asg("r1", "t1"), asg("r2", "t1")];
        const out = detectReservationTableConflicts(reservations, assignments, DUR);
        expect(out.get("r1")).toEqual([{ kind: "overlap", table_id: "t1", other_reservation_ids: ["r2"] }]);
        expect(out.get("r2")).toEqual([{ kind: "overlap", table_id: "t1", other_reservation_ids: ["r1"] }]);
    });

    it("ignores non-occupying statuses on both sides", () => {
        const reservations = [
            res("r1", "2026-09-10", "20:00:00", "cancelled"),
            res("r2", "2026-09-10", "21:00:00"),
            res("r3", "2026-09-10", "20:30:00", "no_show")
        ];
        const assignments = [asg("r1", "t1"), asg("r2", "t1"), asg("r3", "t1")];
        expect(detectReservationTableConflicts(reservations, assignments, DUR).size).toBe(0);
    });

    it("counts seated as occupying", () => {
        const reservations = [res("r1", "2026-09-10", "20:00:00", "seated"), res("r2", "2026-09-10", "21:00:00", "pending")];
        const assignments = [asg("r1", "t1"), asg("r2", "t1")];
        expect(detectReservationTableConflicts(reservations, assignments, DUR).size).toBe(2);
    });

    it("reports a conflict on one table only for a two-table reservation", () => {
        const reservations = [res("r1", "2026-09-10", "20:00:00"), res("r2", "2026-09-10", "20:30:00")];
        const assignments = [asg("r1", "t1"), asg("r1", "t2"), asg("r2", "t2")];
        const out = detectReservationTableConflicts(reservations, assignments, DUR);
        expect(out.get("r1")).toEqual([{ kind: "overlap", table_id: "t2", other_reservation_ids: ["r2"] }]);
    });

    it("flags a soft-deleted or unreadable table regardless of status", () => {
        const reservations = [res("r1", "2026-09-10", "20:00:00"), res("r2", "2026-09-11", "20:00:00", "pending")];
        const assignments = [asg("r1", "t1", { deleted: true }), asg("r2", "t9", { missing: true })];
        const out = detectReservationTableConflicts(reservations, assignments, DUR);
        expect(out.get("r1")).toEqual([{ kind: "table_deleted", table_id: "t1" }]);
        expect(out.get("r2")).toEqual([{ kind: "table_deleted", table_id: "t9" }]);
    });

    it("does not flag a deleted table on a non-occupying reservation", () => {
        const reservations = [res("r1", "2026-09-10", "20:00:00", "cancelled")];
        const assignments = [asg("r1", "t1", { deleted: true })];
        expect(detectReservationTableConflicts(reservations, assignments, DUR).size).toBe(0);
    });

    it("uses the activity duration, falling back to 120", () => {
        const reservations = [
            res("r1", "2026-09-10", "20:00:00", "confirmed", "act-short"),
            res("r2", "2026-09-10", "20:45:00", "confirmed", "act-short"),
            res("r3", "2026-09-10", "20:00:00", "confirmed", "act-unknown"),
            res("r4", "2026-09-10", "21:30:00", "confirmed", "act-unknown")
        ];
        const assignments = [
            asg("r1", "t1", { activity: "act-short" }),
            asg("r2", "t1", { activity: "act-short" }),
            asg("r3", "t2", { activity: "act-unknown" }),
            asg("r4", "t2", { activity: "act-unknown" })
        ];
        const out = detectReservationTableConflicts(reservations, assignments, new Map([["act-short", 30]]));
        expect(out.has("r1")).toBe(false);
        expect(out.has("r3")).toBe(true);
    });

    it("lists every other reservation on the same table, sorted by id", () => {
        const reservations = [
            res("r1", "2026-09-10", "20:00:00"),
            res("r2", "2026-09-10", "20:10:00"),
            res("r3", "2026-09-10", "20:20:00")
        ];
        const assignments = [asg("r1", "t1"), asg("r2", "t1"), asg("r3", "t1")];
        const out = detectReservationTableConflicts(reservations, assignments, DUR);
        expect(out.get("r1")?.[0]).toEqual({ kind: "overlap", table_id: "t1", other_reservation_ids: ["r2", "r3"] });
    });

    it("ignores assignments whose reservation is not in the list", () => {
        const reservations = [res("r1", "2026-09-10", "20:00:00")];
        const assignments = [asg("r1", "t1"), asg("ghost", "t1")];
        expect(detectReservationTableConflicts(reservations, assignments, DUR).size).toBe(0);
    });
});
