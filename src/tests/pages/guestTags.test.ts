import { describe, expect, it } from "vitest";

import { mergeGuestTags } from "@/pages/Dashboard/Guests/guestTags";
import type { V2ReservationGuestNote } from "@/types/reservationGuest";

// FASE 5.3 — i tag sono per sede; l'elenco rubrica è dell'azienda e mostra
// l'unione delle sedi che chi guarda può leggere.

function note(guest_id: string, activity_id: string, tags: string[]): V2ReservationGuestNote {
    return {
        id: `${guest_id}-${activity_id}`,
        tenant_id: "t1",
        activity_id,
        guest_id,
        notes: null,
        tags,
        created_at: "2026-09-17T00:00:00Z",
        updated_at: "2026-09-17T00:00:00Z"
    };
}

describe("mergeGuestTags", () => {
    it("unione per ospite fra le sedi, senza doppioni, nell'ordine in cui compaiono", () => {
        const out = mergeGuestTags([
            note("g1", "a1", ["abituale", "VIP"]),
            note("g1", "a2", ["VIP", "tavolo tranquillo"]),
            note("g2", "a1", ["abituale"])
        ]);
        expect(out.get("g1")).toEqual(["abituale", "VIP", "tavolo tranquillo"]);
        expect(out.get("g2")).toEqual(["abituale"]);
    });

    it("una riga con sola nota e nessun tag non produce una voce", () => {
        const out = mergeGuestTags([note("g1", "a1", [])]);
        expect(out.has("g1")).toBe(false);
        expect(mergeGuestTags([]).size).toBe(0);
    });
});
