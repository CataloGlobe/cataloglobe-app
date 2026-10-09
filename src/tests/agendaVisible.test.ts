import { describe, expect, it } from "vitest";
import { agendaVisible } from "@/pages/Dashboard/Reservations/agendaVisible";
import type { V2Reservation } from "@/types/reservation";

function res(id: string, reservation_date: string, reservation_time: string, status: V2Reservation["status"] = "confirmed"): V2Reservation {
    return { id, reservation_date, reservation_time, status } as V2Reservation;
}

const WEEK = { from: "2026-10-05", to: "2026-10-11" };

describe("agendaVisible", () => {
    const items = [
        res("dopo", "2026-10-12", "20:00"),
        res("mar-sera", "2026-10-06", "21:00"),
        res("prima", "2026-10-04", "20:00"),
        res("annullata", "2026-10-06", "19:00", "cancelled"),
        res("mar-presto", "2026-10-06", "12:30"),
        res("rifiutata", "2026-10-07", "20:00", "declined"),
        res("non-venuto", "2026-10-08", "20:00", "no_show")
    ];

    it("solo la settimana mostrata, per giorno e ora, senza annullate e rifiutate", () => {
        expect(agendaVisible(items, WEEK, false).map(r => r.id)).toEqual(["mar-presto", "mar-sera", "non-venuto"]);
    });

    it("col filtro acceso annullate e rifiutate tornano al loro posto", () => {
        expect(agendaVisible(items, WEEK, true).map(r => r.id)).toEqual([
            "mar-presto",
            "annullata",
            "mar-sera",
            "rifiutata",
            "non-venuto"
        ]);
    });
});
