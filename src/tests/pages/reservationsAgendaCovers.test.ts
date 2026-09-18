import { describe, expect, it } from "vitest";

import { countsForCovers, coversFor } from "@/pages/Dashboard/Reservations/agendaCovers";
import type { ReservationStatus } from "@/types/reservation";

// FASE 5.2b — il contatore dei coperti del giorno non deve muoversi perché
// gli ospiti arrivano: `seated` e `completed` contano quanto `confirmed`.

describe("countsForCovers", () => {
    const expected: Record<ReservationStatus, boolean> = {
        pending: true,
        confirmed: true,
        seated: true,
        completed: true,
        declined: false,
        cancelled: false,
        no_show: false
    };

    for (const [status, counts] of Object.entries(expected) as [ReservationStatus, boolean][]) {
        it(`${status} → ${counts ? "conta" : "non conta"}`, () => {
            expect(countsForCovers(status)).toBe(counts);
        });
    }
});

describe("coversFor", () => {
    it("somma pending + confirmed + seated + completed, ignora il resto", () => {
        expect(
            coversFor([
                { status: "confirmed", party_size: 4 },
                { status: "confirmed", party_size: 2 },
                { status: "confirmed", party_size: 6 },
                { status: "pending", party_size: 3 },
                { status: "completed", party_size: 2 },
                { status: "cancelled", party_size: 5 },
                { status: "no_show", party_size: 2 },
                { status: "declined", party_size: 9 }
            ])
        ).toBe(17);
    });

    it("«Arrivato» (confirmed → seated) non muove il numero", () => {
        const before = coversFor([
            { status: "confirmed", party_size: 4 },
            { status: "confirmed", party_size: 2 }
        ]);
        const after = coversFor([
            { status: "seated", party_size: 4 },
            { status: "confirmed", party_size: 2 }
        ]);
        expect(after).toBe(before);
    });

    it("lista vuota → 0", () => {
        expect(coversFor([])).toBe(0);
    });
});
