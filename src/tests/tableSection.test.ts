import { describe, it, expect } from "vitest";
import {
    tableSectionFor,
    tableWriteTargetFor
} from "@/pages/Dashboard/Reservations/tableSection";
import type { ReservationStatus } from "@/types/reservation";

const ALL_STATUSES: ReservationStatus[] = [
    "pending",
    "confirmed",
    "seated",
    "completed",
    "declined",
    "cancelled",
    "no_show"
];

const SEATING_ID = "11111111-1111-1111-1111-111111111111";

/** Chi può tutto: isola la regola di stato da quella dei permessi. */
const allowed = { canManage: true, canManageSeatings: true };

describe("tableSectionFor — quale tavolo si guarda", () => {
    it("pending e confirmed guardano il piano e lo possono cambiare", () => {
        for (const status of ["pending", "confirmed"] as const) {
            expect(tableSectionFor({ status, ...allowed })).toEqual({
                source: "plan",
                target: "plan",
                note: "plan_live"
            });
        }
    });

    it("seated guarda il fatto e cambia il fatto", () => {
        expect(
            tableSectionFor({ status: "seated", seatingId: SEATING_ID, ...allowed })
        ).toEqual({ source: "seating", target: "seating", note: "seated" });
    });

    it("completed guarda il fatto e non lo cambia: è terminale", () => {
        expect(
            tableSectionFor({ status: "completed", seatingId: SEATING_ID, ...allowed })
        ).toEqual({ source: "seating", target: null, note: "closed" });
    });

    it("declined, cancelled e no_show guardano il piano, al passato", () => {
        // Non hanno tavolata e non possono averne una: `mark_no_show` parte da
        // `confirmed` ed è bloccato su `seated`, `cancel` parte da `confirmed`,
        // `decline` da `pending`. Il piano è tutto ciò che resta da mostrare, e
        // va dichiarato come piano.
        for (const status of ["declined", "cancelled", "no_show"] as const) {
            expect(tableSectionFor({ status, ...allowed })).toEqual({
                source: "plan",
                target: null,
                note: "plan_past"
            });
        }
    });

    it("copre tutti e sette gli stati senza buchi", () => {
        for (const status of ALL_STATUSES) {
            const shape = tableSectionFor({ status, seatingId: SEATING_ID, ...allowed });
            expect(["plan", "seating"]).toContain(shape.source);
        }
    });
});

describe("tableSectionFor — la tavolata che non si trova", () => {
    it("seated senza tavolata: nessun gesto, e NON ripiega sul piano", () => {
        // È la regressione che questa funzione esiste per impedire: scrivere
        // nel piano perché la tavolata non risponde produce due verità.
        expect(
            tableSectionFor({ status: "seated", seatingId: null, ...allowed })
        ).toEqual({ source: "seating", target: null, note: "fact_missing" });
    });

    it("seated con la tavolata ancora in caricamento: nessun gesto", () => {
        expect(
            tableSectionFor({ status: "seated", seatingId: undefined, ...allowed })
        ).toEqual({ source: "seating", target: null, note: "fact_loading" });
    });

    it("completed senza tavolata resta sola lettura, con la nota giusta", () => {
        expect(
            tableSectionFor({ status: "completed", seatingId: null, ...allowed })
        ).toEqual({ source: "seating", target: null, note: "fact_missing" });
    });
});

describe("tableSectionFor — permessi", () => {
    it("senza reservations.manage il piano si guarda e basta", () => {
        expect(
            tableSectionFor({
                status: "confirmed",
                canManage: false,
                canManageSeatings: true
            })
        ).toEqual({ source: "plan", target: null, note: "plan_live" });
    });

    it("senza seatings.manage il fatto si guarda e basta", () => {
        // Il permesso sul piano non apre la tavolata: sono due gesti diversi
        // su due tabelle diverse.
        expect(
            tableSectionFor({
                status: "seated",
                seatingId: SEATING_ID,
                canManage: true,
                canManageSeatings: false
            })
        ).toEqual({ source: "seating", target: null, note: "seated" });
    });

    it("il permesso sui tavoli non sblocca il piano di una prenotazione seduta", () => {
        expect(
            tableWriteTargetFor({
                status: "seated",
                seatingId: SEATING_ID,
                canManage: true,
                canManageSeatings: false
            })
        ).toBeNull();
    });

    it("nessun permesso: mai un gesto, in nessuno stato", () => {
        for (const status of ALL_STATUSES) {
            expect(
                tableWriteTargetFor({
                    status,
                    seatingId: SEATING_ID,
                    canManage: false,
                    canManageSeatings: false
                })
            ).toBeNull();
        }
    });
});

describe("tableWriteTargetFor — la destinazione della scrittura", () => {
    it("è la stessa del bottone, per costruzione", () => {
        for (const status of ALL_STATUSES) {
            const input = { status, seatingId: SEATING_ID, ...allowed };
            expect(tableWriteTargetFor(input)).toBe(tableSectionFor(input).target);
        }
    });

    it("scrive nella tavolata solo su seated, nel piano solo prima del servizio", () => {
        const targets = ALL_STATUSES.map(status =>
            tableWriteTargetFor({ status, seatingId: SEATING_ID, ...allowed })
        );
        expect(targets).toEqual([
            "plan", // pending
            "plan", // confirmed
            "seating", // seated
            null, // completed
            null, // declined
            null, // cancelled
            null // no_show
        ]);
    });
});
