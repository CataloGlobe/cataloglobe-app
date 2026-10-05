import { describe, expect, it } from "vitest";
import type { CrmVenueListItem } from "@/types/crm";
import { foldText, searchActions, searchLeads, searchVenues } from "@/utils/crm/crmSearch";

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

describe("searchLeads", () => {
    const venues = [
        venue("Bar Roma", { stage: "in_conversazione", assigned_to: "me", last_activity_at: "2026-10-05T09:00:00Z" }),
        venue("Pizzeria Uno", { stage: "nuovo", assigned_to: null, last_activity_at: "2026-10-05T10:00:00Z" }),
        venue("Bar Luna", { stage: "in_conversazione", assigned_to: "me", last_activity_at: "2026-10-04T10:00:00Z" }),
        venue("Osteria Persa", { stage: "perso", assigned_to: "me", last_activity_at: "2026-10-05T11:00:00Z" }),
        venue("Trattoria", { stage: "demo_fatta", assigned_to: "altro", last_activity_at: "2026-10-03T10:00:00Z" })
    ];
    const base = { userId: "me", waiting: new Set(["Pizzeria Uno"]) };

    it("vuoto in Tutto: gli ultimi tre aperti, i chiusi no", () => {
        expect(searchLeads(venues, { ...base, query: "", scope: "tutto" }).map(v => v.name)).toEqual([
            "Pizzeria Uno",
            "Bar Roma",
            "Bar Luna"
        ]);
    });

    it("Seguiti da me e Aspettano risposta filtrano, anche col testo", () => {
        expect(searchLeads(venues, { ...base, query: "", scope: "miei" }).map(v => v.name)).toEqual(["Bar Roma", "Bar Luna"]);
        expect(searchLeads(venues, { ...base, query: "", scope: "aspettano" }).map(v => v.name)).toEqual(["Pizzeria Uno"]);
        expect(searchLeads(venues, { ...base, query: "bar", scope: "miei" }).map(v => v.name)).toEqual(["Bar Roma", "Bar Luna"]);
        expect(searchLeads(venues, { ...base, query: "bar", scope: "aspettano" })).toEqual([]);
    });

    it("senza utente, Seguiti da me è vuoto", () => {
        expect(searchLeads(venues, { ...base, userId: null, query: "", scope: "miei" })).toEqual([]);
    });

    it("col testo trova anche i chiusi", () => {
        expect(searchLeads(venues, { ...base, query: "persa", scope: "tutto" }).map(v => v.name)).toEqual(["Osteria Persa"]);
    });
});

describe("searchActions", () => {
    it("vuoto: le prime tre; col testo: quelle che lo contengono; solo in Tutto", () => {
        expect(searchActions("", "tutto").map(a => a.id)).toEqual(["aggiungi", "agenda", "riepilogo"]);
        expect(searchActions("pausa", "tutto").map(a => a.id)).toEqual(["pausa"]);
        expect(searchActions("", "miei")).toEqual([]);
    });
});
