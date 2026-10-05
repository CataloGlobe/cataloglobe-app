import { describe, expect, it } from "vitest";
import type { CrmVenueListItem } from "@/types/crm";
import { foldText, searchVenues } from "@/utils/crm/crmSearch";

function venue(name: string, extra: Partial<CrmVenueListItem> = {}): CrmVenueListItem {
    return {
        id: name,
        name,
        city: null,
        last_activity_at: "2026-10-01T10:00:00Z",
        crm_contacts: [],
        crm_leads: [],
        ...extra
    } as CrmVenueListItem;
}

describe("searchVenues", () => {
    const venues = [
        venue("Caffè Roma", { city: "Milano" }),
        venue("Bar Roma", { last_activity_at: "2026-10-04T10:00:00Z" }),
        venue("Osteria del Ponte", { crm_contacts: [{ id: "c", name: "Mario Rossi", phone_e164: null, email: null }] })
    ];

    it("prima chi comincia così, poi chi lo contiene", () => {
        expect(searchVenues(venues, "bar").map(v => v.name)).toEqual(["Bar Roma"]);
        expect(searchVenues(venues, "roma").map(v => v.name)).toEqual(["Bar Roma", "Caffè Roma"]);
    });

    it("senza accenti né maiuscole, anche città e referente", () => {
        expect(searchVenues(venues, "CAFFE").map(v => v.name)).toEqual(["Caffè Roma"]);
        expect(searchVenues(venues, "milano").map(v => v.name)).toEqual(["Caffè Roma"]);
        expect(searchVenues(venues, "rossi").map(v => v.name)).toEqual(["Osteria del Ponte"]);
    });

    it("vuota: nessun risultato", () => {
        expect(searchVenues(venues, "  ")).toEqual([]);
        expect(foldText(" È ")).toBe("e");
    });
});
