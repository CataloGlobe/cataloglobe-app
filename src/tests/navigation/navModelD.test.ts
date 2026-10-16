import { afterEach, describe, expect, it, vi } from "vitest";
import { isItemActive } from "@/components/layout/AppSidebar/isItemActive";

// La sezione «Sede» nella D (Visual Redesign 2, PR 11a): il modello si legge
// all'avvio, quindi si ricarica con la D accesa.
async function modelsD() {
    vi.resetModules();
    vi.stubEnv("VITE_BACKOFFICE_D", "true");
    return (await import("@/utils/navModel")).NAV_MODELS;
}

afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
});

describe("NAV_MODELS nella D — Sede con Scheda, Sale e tavoli, Tutte le sedi", () => {
    it("più sedi: «Sede» con tre parti, e la Sala esce da Servizio", async () => {
        const m = await modelsD();
        const shape = m.azienda.groups.map(g => [g.title, g.entries.map(e => e.label)]);
        expect(shape.at(-1)).toEqual(["Sede", ["Scheda", "Sale e tavoli", "Tutte le sedi"]]);
        expect(shape.find(([t]) => t === "Servizio")?.[1]).toEqual(["In servizio", "Prenotazioni", "Storico"]);
        expect(m.sede.groups.at(-1)?.title).toBe("Sede");
    });

    it("Servizio come nella copia: i numeri su In servizio e Prenotazioni, «Cosa vedono» tiene accesa In servizio", async () => {
        const m = await modelsD();
        const servizio = m.sede.groups.find(g => g.key === "servizio")!;
        expect(servizio.entries.map(e => [e.key, e.signal])).toEqual([
            ["servizio", "servizio"],
            ["prenotazioni", "pendingReservations"],
            ["storico", undefined]
        ]);
        expect(servizio.entries[0].matchSegments).toEqual(["comande", "cosa-vedono"]);
    });

    it("una sede sola: «Il locale» con Scheda e Sale e tavoli", async () => {
        const m = await modelsD();
        const last = m.unica.groups.at(-1)!;
        expect([last.title, last.seat, last.entries.map(e => e.label)]).toEqual(["Il locale", "none", ["Scheda", "Sale e tavoli"]]);
    });

    it("«In servizio» non si accende sulla Sala", () => {
        const item = { to: "/business/b/locations/a/servizio", label: "In servizio", icon: null, exceptSearch: "modo=sala" };
        expect(isItemActive(item, "/business/b/locations/a/servizio", "")).toBe(true);
        expect(isItemActive(item, "/business/b/locations/a/servizio", "?modo=sala")).toBe(false);
    });
});
