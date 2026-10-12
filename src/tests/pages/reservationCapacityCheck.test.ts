import { describe, it, expect, vi, beforeEach } from "vitest";

// Avvisi di capienza e pacing del back office: i numeri arrivano dal server
// (`get_reservation_capacity_check`), i testi sono gli stessi del calcolo in
// memoria che fa da ripiego.
const rpc = vi.fn();

vi.mock("@/services/supabase/client", () => ({
    supabase: {
        rpc: (...args: unknown[]) => rpc(...args)
    }
}));

import { getReservationCapacityCheck } from "@/services/supabase/reservations";
import { overCapacityMessage, pacingMessage } from "@/pages/Dashboard/Reservations/capacityWarnings";

const ROW = {
    capacity: 40,
    duration_minutes: 120,
    peak_with_candidate: 44,
    pacing_slot_minutes: 15,
    pacing_max_covers: 10,
    pacing_max_bookings: null,
    pacing_bucket_covers: 8,
    pacing_bucket_bookings: 2
};

describe("getReservationCapacityCheck", () => {
    beforeEach(() => rpc.mockReset());

    it("passa i parametri alla RPC, con l'ora in HH:MM:SS", async () => {
        rpc.mockResolvedValue({ data: [ROW], error: null });
        await getReservationCapacityCheck({
            activityId: "a1",
            date: "2026-10-20",
            time: "20:30",
            partySize: 4,
            excludeReservationId: "r1"
        });
        expect(rpc).toHaveBeenCalledWith("get_reservation_capacity_check", {
            p_activity_id: "a1",
            p_reservation_date: "2026-10-20",
            p_reservation_time: "20:30:00",
            p_party_size: 4,
            p_exclude_reservation_id: "r1"
        });
    });

    it("senza prenotazione da escludere non manda il parametro", async () => {
        rpc.mockResolvedValue({ data: [ROW], error: null });
        await getReservationCapacityCheck({ activityId: "a1", date: "2026-10-20", time: "20:30:00", partySize: 2 });
        const args = rpc.mock.calls[0][1] as Record<string, unknown>;
        expect(args).not.toHaveProperty("p_exclude_reservation_id");
        expect(args.p_reservation_time).toBe("20:30:00");
    });

    it("traduce la riga in camelCase", async () => {
        rpc.mockResolvedValue({ data: [ROW], error: null });
        const check = await getReservationCapacityCheck({
            activityId: "a1",
            date: "2026-10-20",
            time: "20:30",
            partySize: 4
        });
        expect(check).toEqual({
            capacity: 40,
            durationMinutes: 120,
            peakWithCandidate: 44,
            pacingSlotMinutes: 15,
            pacingMaxCovers: 10,
            pacingMaxBookings: null,
            pacingBucketCovers: 8,
            pacingBucketBookings: 2
        });
    });

    it("un errore della RPC arriva a chi chiama (che torna al calcolo in memoria)", async () => {
        rpc.mockResolvedValue({ data: null, error: { code: "42501", message: "sede non autorizzata" } });
        await expect(
            getReservationCapacityCheck({ activityId: "a1", date: "2026-10-20", time: "20:30", partySize: 4 })
        ).rejects.toMatchObject({ code: "42501" });
    });

    it("risposta vuota = errore", async () => {
        rpc.mockResolvedValue({ data: [], error: null });
        await expect(
            getReservationCapacityCheck({ activityId: "a1", date: "2026-10-20", time: "20:30", partySize: 4 })
        ).rejects.toMatchObject({ code: "SERVER_ERROR" });
    });
});

describe("overCapacityMessage", () => {
    it("tace senza capienza o sotto la capienza", () => {
        expect(overCapacityMessage(50, null)).toBeNull();
        expect(overCapacityMessage(40, 40)).toBeNull();
    });

    it("dice il picco e la capienza quando si sfora", () => {
        expect(overCapacityMessage(44, 40)).toBe(
            "Questa prenotazione porta a 44 coperti su 40 di capienza. Puoi salvarla lo stesso."
        );
    });
});

describe("pacingMessage", () => {
    const base = {
        timeMinutes: 20 * 60 + 40,
        slotMinutes: 15,
        maxCovers: 10,
        maxBookings: 3,
        bucketCovers: 0,
        bucketBookings: 0,
        partySize: 2
    };

    it("tace senza limiti o dentro i limiti", () => {
        expect(pacingMessage({ ...base, maxCovers: null, maxBookings: null })).toBeNull();
        expect(pacingMessage({ ...base, bucketCovers: 8, bucketBookings: 2 })).toBeNull();
    });

    it("dice la fascia e di quanto si sfora, per persone e prenotazioni", () => {
        expect(pacingMessage({ ...base, bucketCovers: 9, bucketBookings: 3 })).toBe(
            "Nella fascia 20:30–20:45 questa prenotazione porta a 11 persone contro un limite di 10 (1 in più) e 4 prenotazioni contro un limite di 3 (1 in più). Puoi salvarla lo stesso: il limite vale solo per le prenotazioni online."
        );
    });

    it("passo non valido: niente avviso", () => {
        expect(pacingMessage({ ...base, slotMinutes: 0, bucketCovers: 20 })).toBeNull();
    });
});
