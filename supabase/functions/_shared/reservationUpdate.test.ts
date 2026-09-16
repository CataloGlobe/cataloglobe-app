import { describe, it, expect } from "vitest";
import {
    decideMoveNotification,
    isReservationMoved,
    NO_CUSTOMER_EXPECTED_STATUSES,
    type ReservationMoveSnapshot
} from "./reservationUpdate.ts";

const BEFORE: ReservationMoveSnapshot = {
    reservation_date: "2026-09-22",
    reservation_time: "20:00:00",
    status: "confirmed",
    customer_email: "ospite@example.com"
};

describe("isReservationMoved", () => {
    it("cambia la data → spostata", () => {
        expect(isReservationMoved(BEFORE, { ...BEFORE, reservation_date: "2026-09-23" })).toBe(true);
    });
    it("cambia l'ora → spostata", () => {
        expect(isReservationMoved(BEFORE, { ...BEFORE, reservation_time: "22:00" })).toBe(true);
    });
    it("20:00 e 20:00:00 sono la stessa ora: Postgres rende i secondi, il form no", () => {
        expect(isReservationMoved(BEFORE, { ...BEFORE, reservation_time: "20:00" })).toBe(false);
    });
});

describe("decideMoveNotification — la regola della mail", () => {
    it("data o ora cambiate, cliente atteso, email presente → parte", () => {
        expect(decideMoveNotification(BEFORE, { ...BEFORE, reservation_time: "22:00:00" })).toEqual({ notify: true });
    });

    it("coperti, nome, telefono, note: niente cambia nel calendario → nessuna mail", () => {
        // La funzione vede solo data/ora/stato/email: un salvataggio che
        // tocca il resto arriva qui identico.
        expect(decideMoveNotification(BEFORE, { ...BEFORE })).toEqual({ notify: false, reason: "not_moved" });
    });

    it("senza customer_email non parte niente, e non è un errore", () => {
        for (const email of [null, "", "   "]) {
            expect(
                decideMoveNotification(BEFORE, { ...BEFORE, reservation_time: "22:00", customer_email: email })
            ).toEqual({ notify: false, reason: "no_email" });
        }
    });

    it("stato che non prevede il cliente (cancelled, declined, no_show) → nessuna mail", () => {
        expect(NO_CUSTOMER_EXPECTED_STATUSES).toEqual(["cancelled", "declined", "no_show"]);
        for (const status of NO_CUSTOMER_EXPECTED_STATUSES) {
            expect(
                decideMoveNotification(BEFORE, { ...BEFORE, reservation_date: "2026-09-30", status })
            ).toEqual({ notify: false, reason: "no_customer_expected" });
        }
    });

    it("pending, confirmed, seated, completed: il cliente è (o era) atteso → parte", () => {
        for (const status of ["pending", "confirmed", "seated", "completed"]) {
            expect(
                decideMoveNotification(BEFORE, { ...BEFORE, reservation_date: "2026-09-30", status })
            ).toEqual({ notify: true });
        }
    });

    it("l'email aggiunta nello stesso salvataggio che sposta è un indirizzo a cui scrivere", () => {
        expect(
            decideMoveNotification(
                { ...BEFORE, customer_email: null },
                { ...BEFORE, reservation_time: "21:00", customer_email: "nuova@example.com" }
            )
        ).toEqual({ notify: true });
    });
});
