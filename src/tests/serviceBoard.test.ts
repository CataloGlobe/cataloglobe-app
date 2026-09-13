import { describe, it, expect } from "vitest";
import {
    LATE_GRACE_MINUTES,
    composeServiceBoard,
    detectSeatingTableConflicts,
    isLateArrival,
    seatingDisplayName
} from "@/pages/Dashboard/Reservations/serviceBoard";
import type { V2Reservation } from "@/types/reservation";
import type { SeatingWithState } from "@/types/seating";

const TODAY = "2026-09-12";
const TENANT = "t1";
const ACTIVITY = "a1";

function reservation(over: Partial<V2Reservation> & { id: string }): V2Reservation {
    return {
        tenant_id: TENANT,
        activity_id: ACTIVITY,
        reservation_date: TODAY,
        reservation_time: "20:00:00",
        party_size: 2,
        customer_name: `Cliente ${over.id}`,
        customer_email: "",
        customer_phone: "",
        customer_phone_e164: null,
        notes: null,
        guest_id: null,
        customer_language: null,
        status: "confirmed",
        ...over
    } as V2Reservation;
}

function seating(
    over: Partial<SeatingWithState> & { id: string }
): SeatingWithState {
    return {
        tenant_id: TENANT,
        activity_id: ACTIVITY,
        status: "open",
        party_size: 2,
        opened_at: "2026-09-12T18:00:00.000Z",
        closed_at: null,
        closed_reason: null,
        opened_by_user_id: null,
        tables: [],
        reservations: [],
        ...over
    };
}

function table(table_id: string, label = `Tavolo ${table_id}`) {
    return { table_id, label, zone_name: null, deleted_at: null };
}

function linked(reservation_id: string, customer_name: string) {
    return {
        reservation_id,
        customer_name,
        reservation_time: "20:00:00",
        party_size: 2,
        status: "seated" as const
    };
}

// 20:30 locale di oggi.
const NOW = new Date(2026, 8, 12, 20, 30);

describe("isLateArrival — quando un'attesa è in ritardo", () => {
    it("entro la tolleranza non è in ritardo", () => {
        // 20:30 con prenotazione alle 20:20: dieci minuti sono la normalità.
        expect(isLateArrival({ reservation_time: "20:20:00" }, NOW)).toBe(false);
    });

    it("esattamente alla soglia non è ancora in ritardo", () => {
        expect(isLateArrival({ reservation_time: "20:15:00" }, NOW)).toBe(false);
    });

    it("oltre la tolleranza è in ritardo", () => {
        expect(isLateArrival({ reservation_time: "20:14:00" }, NOW)).toBe(true);
    });

    it("prima dell'orario non è in ritardo", () => {
        expect(isLateArrival({ reservation_time: "21:00:00" }, NOW)).toBe(false);
    });

    it("la soglia è di 15 minuti", () => {
        expect(LATE_GRACE_MINUTES).toBe(15);
    });

    it("un orario rotto non è mai in ritardo", () => {
        expect(isLateArrival({ reservation_time: "boh" }, NOW)).toBe(false);
    });
});

describe("detectSeatingTableConflicts — un tavolo in due tavolate aperte", () => {
    it("lo stesso tavolo in due aperte: segnalato su entrambe, con l'altra", () => {
        const a = seating({ id: "s-a", tables: [table("4")] });
        const b = seating({ id: "s-b", tables: [table("4"), table("5")] });
        const conflicts = detectSeatingTableConflicts([a, b]);

        expect(conflicts.get("s-a")).toEqual([
            { table_id: "4", label: "Tavolo 4", other_seating_ids: ["s-b"] }
        ]);
        expect(conflicts.get("s-b")).toEqual([
            { table_id: "4", label: "Tavolo 4", other_seating_ids: ["s-a"] }
        ]);
    });

    it("tavoli diversi: nessun conflitto", () => {
        const a = seating({ id: "s-a", tables: [table("4")] });
        const b = seating({ id: "s-b", tables: [table("5")] });
        expect(detectSeatingTableConflicts([a, b]).size).toBe(0);
    });

    it("una tavolata chiusa non occupa: il suo tavolo riusato non è un conflitto", () => {
        const done = seating({
            id: "s-done",
            status: "closed",
            closed_at: "2026-09-12T19:00:00.000Z",
            tables: [table("4")]
        });
        const now = seating({ id: "s-now", tables: [table("4")] });
        expect(detectSeatingTableConflicts([done, now]).size).toBe(0);
    });

    it("tre tavolate sullo stesso tavolo: ciascuna vede le altre due", () => {
        const s = ["s-1", "s-2", "s-3"].map(id => seating({ id, tables: [table("9")] }));
        const conflicts = detectSeatingTableConflicts(s);
        expect(conflicts.get("s-2")?.[0].other_seating_ids).toEqual(["s-1", "s-3"]);
    });
});

describe("composeServiceBoard — i tre gruppi", () => {
    it("in sala: le aperte dalla più vecchia; concluse: le chiuse dall'ultima", () => {
        const late = seating({ id: "s-late", opened_at: "2026-09-12T19:00:00.000Z" });
        const early = seating({ id: "s-early", opened_at: "2026-09-12T18:00:00.000Z" });
        const closedFirst = seating({
            id: "s-c1",
            status: "closed",
            closed_at: "2026-09-12T17:00:00.000Z"
        });
        const closedLast = seating({
            id: "s-c2",
            status: "closed",
            closed_at: "2026-09-12T17:30:00.000Z"
        });

        const board = composeServiceBoard({
            seatings: [late, closedFirst, early, closedLast],
            reservations: [],
            today: TODAY,
            now: NOW
        });

        expect(board.inRoom.map(s => s.id)).toEqual(["s-early", "s-late"]);
        expect(board.closed.map(s => s.id)).toEqual(["s-c2", "s-c1"]);
    });

    it("in arrivo: solo le confirmed di oggi, in ordine di orario, col ritardo", () => {
        const board = composeServiceBoard({
            seatings: [],
            reservations: [
                reservation({ id: "r-21", reservation_time: "21:00:00" }),
                reservation({ id: "r-20", reservation_time: "20:00:00" }),
                reservation({ id: "r-pending", status: "pending" }),
                reservation({ id: "r-seated", status: "seated" }),
                reservation({ id: "r-tomorrow", reservation_date: "2026-09-13" }),
                reservation({ id: "r-cancelled", status: "cancelled" })
            ],
            today: TODAY,
            now: NOW
        });

        expect(board.arriving.map(a => a.reservation.id)).toEqual(["r-20", "r-21"]);
        // 20:30 ora: le 20:00 sono oltre i 15', le 21:00 no.
        expect(board.arriving.map(a => a.late)).toEqual([true, false]);
    });

    it("chi è in una tavolata aperta non è 'in arrivo', anche se la lista lo dice ancora confirmed", () => {
        // Il caso visto dal vivo: l'evento su `seatings` è arrivato, quello su
        // `reservations` no. Stessa prenotazione in due gruppi insieme, con
        // "In ritardo" sotto a "appena seduta". L'esclusione legge la
        // tavolata, non lo stato.
        const seatedButStale = reservation({
            id: "r-x",
            status: "confirmed",
            reservation_time: "19:00:00"
        });
        const open = seating({ id: "s-x", reservations: [linked("r-x", "Rossi")] });
        const board = composeServiceBoard({
            seatings: [open],
            reservations: [seatedButStale],
            today: TODAY,
            now: NOW
        });
        expect(board.inRoom.map(s => s.id)).toEqual(["s-x"]);
        expect(board.arriving).toEqual([]);
    });

    it("una tavolata CHIUSA non toglie niente da 'in arrivo'", () => {
        // Chiusa = servizio finito: se la lista dice ancora `confirmed` è un
        // dato stale da un'altra parte, non un motivo per nascondere la riga.
        const r = reservation({ id: "r-y", status: "confirmed" });
        const done = seating({
            id: "s-y",
            status: "closed",
            closed_at: "2026-09-12T19:00:00.000Z",
            reservations: [linked("r-y", "Bianchi")]
        });
        const board = composeServiceBoard({
            seatings: [done],
            reservations: [r],
            today: TODAY,
            now: NOW
        });
        expect(board.arriving.map(a => a.reservation.id)).toEqual(["r-y"]);
    });

    it("la tavolata senza prenotazione sta in sala come le altre", () => {
        // È un walk-in, non un caso di bordo: `reservations = []` è
        // un'informazione, e la riga c'è.
        const walkin = seating({ id: "s-walkin", tables: [table("2")] });
        const board = composeServiceBoard({
            seatings: [walkin],
            reservations: [],
            today: TODAY,
            now: NOW
        });
        expect(board.inRoom).toHaveLength(1);
        expect(board.inRoom[0].reservations).toEqual([]);
        expect(seatingDisplayName(walkin)).toBe("una tavolata senza prenotazione");
    });

    it("la tavolata con più prenotazioni è UNA riga, con tutti i nomi", () => {
        const big = seating({
            id: "s-big",
            reservations: [linked("r-1", "Rossi"), linked("r-2", "Bianchi")]
        });
        const board = composeServiceBoard({
            seatings: [big],
            reservations: [],
            today: TODAY,
            now: NOW
        });
        expect(board.inRoom).toHaveLength(1);
        expect(seatingDisplayName(big)).toBe("Rossi e Bianchi");
        expect(
            seatingDisplayName(
                seating({
                    id: "x",
                    reservations: [linked("1", "A"), linked("2", "B"), linked("3", "C")]
                })
            )
        ).toBe("A, B e C");
    });

    it("i conflitti sono calcolati solo sulle aperte, e arrivano col board", () => {
        const a = seating({ id: "s-a", tables: [table("4")] });
        const b = seating({ id: "s-b", tables: [table("4")] });
        const c = seating({
            id: "s-c",
            status: "closed",
            closed_at: "2026-09-12T19:00:00.000Z",
            tables: [table("4")]
        });
        const board = composeServiceBoard({
            seatings: [a, b, c],
            reservations: [],
            today: TODAY,
            now: NOW
        });
        expect([...board.conflicts.keys()].sort()).toEqual(["s-a", "s-b"]);
    });
});
