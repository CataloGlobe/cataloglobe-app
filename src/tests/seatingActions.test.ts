import { describe, it, expect } from "vitest";
import {
    seatingActionsFor,
    hasSeatingAction
} from "@/pages/Dashboard/Reservations/seatingActions";
import { statusMeta } from "@/utils/reservationStatusMeta";
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

describe("seatingActionsFor — quali gesti mostrare", () => {
    it("confirmed: si può far sedere, e basta", () => {
        expect(seatingActionsFor({ status: "confirmed", canManageSeatings: true })).toEqual([
            "arrive"
        ]);
    });

    it("seated: chiudere il servizio o annullare l'arrivo", () => {
        expect(seatingActionsFor({ status: "seated", canManageSeatings: true })).toEqual([
            "complete",
            "undo_arrival"
        ]);
    });

    it("completed non ha gesti: è terminale", () => {
        // Riaprire un servizio concluso è un'operazione che non esiste, e un
        // bottone che fallisce è peggio dell'assenza del bottone.
        expect(seatingActionsFor({ status: "completed", canManageSeatings: true })).toEqual([]);
    });

    it("pending non ha 'arrivato'", () => {
        // Non si fa sedere qualcuno la cui richiesta il locale non ha ancora
        // accettato: l'host conferma prima, ed è un gesto che già esiste.
        expect(hasSeatingAction({ status: "pending", canManageSeatings: true }, "arrive")).toBe(
            false
        );
    });

    it.each(["declined", "cancelled", "no_show"] as const)("%s non ha gesti", status => {
        expect(seatingActionsFor({ status, canManageSeatings: true })).toEqual([]);
    });

    it("senza permesso nessuno stato produce gesti", () => {
        // Non disabilitati: proprio non disegnati. Un bottone spento che non
        // si può accendere è rumore, non informazione.
        for (const status of ALL_STATUSES) {
            expect(seatingActionsFor({ status, canManageSeatings: false })).toEqual([]);
        }
    });

    it("'arrivato' e 'servizio concluso' non compaiono mai insieme", () => {
        // Sono due momenti diversi dello stesso ciclo: vederli insieme
        // significherebbe che lo stato non sa dire dove siamo.
        for (const status of ALL_STATUSES) {
            const actions = seatingActionsFor({ status, canManageSeatings: true });
            expect(actions.includes("arrive") && actions.includes("complete")).toBe(false);
        }
    });

    it("'annulla arrivo' esiste solo dove esiste un arrivo da annullare", () => {
        for (const status of ALL_STATUSES) {
            if (status === "seated") continue;
            expect(hasSeatingAction({ status, canManageSeatings: true }, "undo_arrival")).toBe(
                false
            );
        }
    });
});

describe("etichette dei due stati della tavolata", () => {
    it("seated si legge 'Al tavolo'", () => {
        // Non "Seduta": descriverebbe una postura invece di uno stato del
        // servizio.
        expect(statusMeta("seated").label).toBe("Al tavolo");
    });

    it("completed si legge 'Servita'", () => {
        // Non "Completata": è la traduzione del nome della colonna, non una
        // parola che un cameriere direbbe guardando la sala.
        expect(statusMeta("completed").label).toBe("Servita");
        expect(statusMeta("completed").label).not.toBe("Completata");
    });

    it("ogni stato ha un'etichetta diversa dal proprio valore tecnico", () => {
        for (const status of ALL_STATUSES) {
            expect(statusMeta(status).label).not.toBe(status);
        }
    });
});
