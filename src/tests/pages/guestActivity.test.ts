import { describe, expect, it } from "vitest";

import { isLost, isNew, isRegular, summarizeGuestVisits } from "@/pages/Dashboard/Guests/guestActivity";
import type { GuestVisitMark } from "@/services/supabase/reservationGuests";
import type { ReservationGuestSummary } from "@/types/reservationGuest";

// Clienti A (D154): i pallini dei 12 mesi, le sedi, chi è abituale e chi non torna.

const TODAY = new Date(2026, 9, 9); // 9 ottobre 2026

function mark(guest_id: string, reservation_date: string, status = "completed", activity_id = "c"): GuestVisitMark {
    return { guest_id, activity_id, activity_name: activity_id === "c" ? "Centro" : "Porto", reservation_date, status };
}

function guest(first_visit_date: string | null, visible_no_shows = 0): ReservationGuestSummary {
    return {
        id: "g",
        tenant_id: "t",
        phone_e164: "+393330000000",
        display_name: "Giulia",
        email: null,
        created_at: "",
        updated_at: "",
        visible_visits: 1,
        visible_no_shows,
        first_visit_date,
        last_visit_date: null,
        visible_activities: 1
    };
}

describe("summarizeGuestVisits", () => {
    it("segna i mesi dal più vecchio a questo, le assenze a parte, il futuro no", () => {
        const s = summarizeGuestVisits(
            [
                mark("g", "2026-10-02"),
                mark("g", "2026-09-20", "no_show"),
                mark("g", "2025-11-15"),
                mark("g", "2025-10-30"), // tredici mesi fa: fuori
                mark("g", "2026-10-20", "confirmed"), // futura: non conta
                mark("g", "2026-08-01", "cancelled")
            ],
            TODAY
        ).get("g")!;
        expect(s.months).toEqual([1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 1]);
        expect(s.visits12).toBe(2);
        expect(s.came).toBe(3);
        expect(s.lastCame).toBe("2026-10-02");
    });

    it("le sedi dalla più frequentata", () => {
        const s = summarizeGuestVisits(
            [mark("g", "2026-10-01", "completed", "p"), mark("g", "2026-09-01"), mark("g", "2026-08-01")],
            TODAY
        ).get("g")!;
        expect(s.sedi.map(x => x.name)).toEqual(["Centro", "Porto"]);
    });
});

describe("filtri", () => {
    it("abituale per etichetta o per sei visite nell'anno", () => {
        expect(isRegular(undefined, ["Abituale"])).toBe(true);
        const six = summarizeGuestVisits(
            ["2026-10-01", "2026-09-01", "2026-08-01", "2026-07-01", "2026-06-01", "2026-05-01"].map(d => mark("g", d)),
            TODAY
        ).get("g");
        expect(isRegular(six, [])).toBe(true);
        expect(isRegular(undefined, [])).toBe(false);
    });

    it("non torna: almeno quattro visite, l'ultima più di 90 giorni fa", () => {
        const lost = summarizeGuestVisits(
            ["2026-06-01", "2026-05-01", "2026-04-01", "2026-03-01"].map(d => mark("g", d)),
            TODAY
        ).get("g");
        expect(isLost(lost, TODAY)).toBe(true);
        const back = summarizeGuestVisits(
            ["2026-09-01", "2026-05-01", "2026-04-01", "2026-03-01"].map(d => mark("g", d)),
            TODAY
        ).get("g");
        expect(isLost(back, TODAY)).toBe(false);
    });

    it("nuovo: la prima visita negli ultimi 30 giorni", () => {
        expect(isNew(guest("2026-09-20"), TODAY)).toBe(true);
        expect(isNew(guest("2026-08-01"), TODAY)).toBe(false);
        expect(isNew(guest(null), TODAY)).toBe(false);
    });
});
