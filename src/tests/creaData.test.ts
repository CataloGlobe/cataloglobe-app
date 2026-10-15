import { describe, expect, it, vi } from "vitest";

vi.mock("@/services/supabase/client", () => ({ supabase: {} }));
vi.mock("@/pages/Dashboard/Programming/calendar/calendarFlags", async orig => ({ ...(await orig<object>()), NEW_MODEL: { evid: true } }));
vi.mock("@/services/supabase/layoutScheduling", () => ({
    listLayoutRules: vi.fn(async () => []),
    listLayoutRuleOptions: vi.fn(async () => ({ activities: [], activityGroups: [], catalogs: [], products: [], featuredContents: [] }))
}));
vi.mock("@/services/supabase/products", () => ({ listBaseProductsForPickerWithCategory: vi.fn(async () => []) }));
vi.mock("@/services/supabase/styles", () => ({ listStyles: vi.fn(async () => []) }));
vi.mock("@/services/supabase/activity-groups", () => ({ listActivityIdsByGroup: vi.fn(async () => ({})) }));
// le coppie menù-prodotto non rispondono mai: il tunnel si apre lo stesso
vi.mock("@/services/supabase/catalogs", () => ({ listCatalogProductPairs: vi.fn(() => new Promise(() => {})) }));
vi.mock("@/services/supabase/featuredContents", () => ({ listFeaturedContentPositions: vi.fn(async () => Promise.reject(new Error("rete"))) }));

import { listCatalogProductPairs } from "@/services/supabase/catalogs";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readCrea } from "@/pages/Dashboard/Crea/useCreaData";
import { StoriaTema } from "@/pages/Dashboard/Crea/StoriaTema";
import { newTunnel } from "@/pages/Dashboard/Crea/creaModel";
import type { DraftLookups, PickProduct } from "@/pages/Dashboard/Programming/calendar/calendarDraft";

// Review #473, punto 6: aprire il tunnel non aspetta tutte le coppie menù-prodotto,
// e l'ordine dei contenuti in evidenza che non si legge lascia traccia.

describe("i dati per aprire il tunnel", () => {
    it("non aspettano le coppie menù-prodotto: arrivano dopo, a parte", async () => {
        const raw = await readCrea("t1");
        expect(raw.pairs).toBeNull();
        expect(listCatalogProductPairs).not.toHaveBeenCalled();
    });

    it("l'ordine in evidenza che non si legge resta vuoto, ma finisce nel log", async () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        expect((await readCrea("t1")).positions).toEqual({});
        expect(warn).toHaveBeenCalledWith("[Crea] ordine dei contenuti in evidenza non letto:", expect.any(Error));
        warn.mockRestore();
    });
});

describe("la storia di un prodotto: in quali menù sta", () => {
    const ALL = { all: true, activityIds: [], groupIds: [] };
    const L = { catalogs: new Map([["m1", "Pranzo"]]), multi: false } as unknown as DraftLookups;
    const pick = [{ id: "p1", name: "Carbonara", category: null, listPrice: 12, formats: [] }] as unknown as PickProduct[];
    const show = (menusOf: Map<string, string[]>, menusReady: boolean) =>
        renderToStaticMarkup(h(StoriaTema, { t: { ...newTunnel("storia", ALL), about: "prod" }, u: () => {}, L, pick, menusOf, menusReady, sedi: [], business: "Bistrot" }));

    it("finché i menù non sono arrivati non dice «In nessun menù»", () => {
        const html = show(new Map(), false);
        expect(html).not.toContain("In nessun menù");
        expect(html).toContain("12,00");
    });

    it("arrivati, dice dove sta o che non sta in nessuno", () => {
        expect(show(new Map([["p1", ["m1"]]]), true)).toContain("Pranzo · ");
        expect(show(new Map(), true)).toContain("In nessun menù · ");
    });
});
