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
import { readCrea } from "@/pages/Dashboard/Crea/useCreaData";

// Review #473, punto 6: aprire il tunnel non aspetta tutte le coppie menù-prodotto,
// e l'ordine dei contenuti in evidenza che non si legge lascia traccia.

describe("i dati per aprire il tunnel", () => {
    it("non aspettano le coppie menù-prodotto: arrivano dopo, a parte", async () => {
        const raw = await readCrea("t1");
        expect(raw.pairs).toEqual([]);
        expect(listCatalogProductPairs).not.toHaveBeenCalled();
    });

    it("l'ordine in evidenza che non si legge resta vuoto, ma finisce nel log", async () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        expect((await readCrea("t1")).positions).toEqual({});
        expect(warn).toHaveBeenCalledWith("[Crea] ordine dei contenuti in evidenza non letto:", expect.any(Error));
        warn.mockRestore();
    });
});
