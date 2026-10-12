import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/services/supabase/catalogs", () => ({
    createCatalog: vi.fn(async () => ({ id: "cat1" })),
    createCategory: vi.fn(async () => ({ id: "sec1" })),
    updateCatalog: vi.fn(),
    addProductToCategory: vi.fn(async () => undefined),
    deleteCategory: vi.fn(),
    removeProductFromCategory: vi.fn(),
    updateCategory: vi.fn(),
    updateProductSortOrder: vi.fn()
}));
vi.mock("@/services/supabase/products", () => ({ createProduct: vi.fn(), updateProduct: vi.fn() }));
vi.mock("@/services/supabase/productOptions", () => ({ createPrimaryPriceFormat: vi.fn() }));
vi.mock("@/services/supabase/styles", () => ({ createStyle: vi.fn(async () => ({ id: "st1" })), updateStyle: vi.fn() }));
vi.mock("@/services/supabase/featuredContents", () => ({
    createFeaturedContent: vi.fn(async () => ({ id: "ev1" })),
    listFeaturedContentProducts: vi.fn(async () => []),
    syncFeaturedContentProducts: vi.fn(async () => undefined),
    updateFeaturedContent: vi.fn(async () => undefined),
    updateFeaturedContentProductNote: vi.fn(async () => undefined)
}));
vi.mock("@/services/supabase/featuredScheduling", () => ({
    createFeaturedRuleDraft: vi.fn(async () => "regola-ev"),
    updateFeaturedRule: vi.fn(async () => undefined)
}));
vi.mock("@/services/supabase/scheduleTargets", () => ({ updateScheduleTargets: vi.fn(async () => undefined) }));
vi.mock("@/services/supabase/layoutScheduling", () => ({
    createRuleDraft: vi.fn(async () => "regola"),
    deleteLayoutRule: vi.fn(async () => undefined),
    updateRule: vi.fn(async () => undefined),
    listLayoutRules: vi.fn(async () => [])
}));
vi.mock("@/services/supabase/stories", () => ({
    createStory: vi.fn(async () => ({ id: "storia1" })),
    updateStory: vi.fn(async () => undefined)
}));
vi.mock("@/services/supabase/upload", () => ({ uploadFeaturedContentImage: vi.fn(), uploadStoryImage: vi.fn() }));
vi.mock("@/utils/compressImage", () => ({ compressImage: vi.fn(), COMPRESS_PROFILES: {} }));

import { addProductToCategory, createCatalog, createCategory, deleteCategory, removeProductFromCategory, updateCatalog, updateCategory } from "@/services/supabase/catalogs";
import { createProduct, updateProduct } from "@/services/supabase/products";
import { createStyle, updateStyle } from "@/services/supabase/styles";
import { createRuleDraft, listLayoutRules } from "@/services/supabase/layoutScheduling";
import { createFeaturedContent, updateFeaturedContent } from "@/services/supabase/featuredContents";
import { createFeaturedRuleDraft, updateFeaturedRule } from "@/services/supabase/featuredScheduling";
import { createStory, updateStory } from "@/services/supabase/stories";
import { newTunnel, type Dish, type Section } from "@/pages/Dashboard/Crea/creaModel";
import { saveTunnel, type SaveCtx } from "@/pages/Dashboard/Crea/creaSave";
import type { DraftLookups } from "@/pages/Dashboard/Programming/calendar/calendarDraft";

// Review #360.2: se un passo del salvataggio fallisce, «Riprova» riparte da
// quello che c'è già invece di ricreare tutto (menù, categorie e piatti doppi).

const ALL = { all: true, activityIds: [], groupIds: [] };
const L: DraftLookups = { products: new Map(), catalogs: new Map(), styles: new Map(), featured: new Map(), sedi: new Map(), groups: new Map(), multi: false };
const ctx = (o: Partial<SaveCtx> = {}): SaveCtx => ({ tenantId: "t1", L, live: false, pair: null, blockFiles: {}, done: new Map(), ...o });

beforeEach(() => vi.resetAllMocks());

describe("salvare il tunnel: riprovare dopo un errore (#360.2)", () => {
    it("menù: il secondo piatto fallisce; riprovando menù, categoria e primo piatto non si ricreano", async () => {
        vi.mocked(createCatalog).mockResolvedValue({ id: "cat1" } as never);
        vi.mocked(createCategory).mockResolvedValue({ id: "sec1" } as never);
        vi.mocked(createProduct)
            .mockResolvedValueOnce({ id: "p1" } as never)
            .mockRejectedValueOnce(new Error("rete"))
            .mockResolvedValueOnce({ id: "p2" } as never);
        const t = newTunnel("menu", ALL);
        t.name = "Pranzo";
        t.sections = [{ key: "s", name: "Primi", dishes: [{ key: "a", productId: null, name: "Carbonara", price: 12 }, { key: "b", productId: null, name: "Gricia", price: 11 }], subs: [] }];
        const c = ctx();
        await expect(saveTunnel(t, c)).rejects.toThrow("rete");
        const saved = await saveTunnel(t, c);
        expect(saved).toMatchObject({ id: "cat1", productIds: ["p1", "p2"] });
        expect(createCatalog).toHaveBeenCalledTimes(1);
        expect(createCategory).toHaveBeenCalledTimes(1);
        expect(createProduct).toHaveBeenCalledTimes(3);
        expect(vi.mocked(addProductToCategory).mock.calls.map(x => x[3])).toEqual(["p1", "p2"]);
    });

    it("senza memoria dei passi (com'era) il menù nascerebbe due volte", async () => {
        vi.mocked(createCatalog).mockResolvedValue({ id: "cat1" } as never);
        vi.mocked(createCategory).mockRejectedValueOnce(new Error("rete")).mockResolvedValue({ id: "sec1" } as never);
        vi.mocked(createProduct).mockResolvedValue({ id: "p1" } as never);
        const t = newTunnel("menu", ALL);
        t.sections = [{ key: "s", name: "Primi", dishes: [{ key: "a", productId: null, name: "Carbonara", price: 12 }], subs: [] }];
        const c = ctx({ done: undefined });
        await expect(saveTunnel(t, c)).rejects.toThrow();
        await saveTunnel(t, c);
        expect(createCatalog).toHaveBeenCalledTimes(2);
    });

    it("menù letto da una foto (D180): la regola fallisce; riprovando menù, categorie e piatti non si riscrivono", async () => {
        vi.mocked(createCatalog).mockResolvedValue({ id: "cat1" } as never);
        vi.mocked(createCategory).mockResolvedValueOnce({ id: "sec1" } as never).mockResolvedValueOnce({ id: "sec2" } as never);
        vi.mocked(createProduct).mockResolvedValue({ id: "p1" } as never);
        vi.mocked(listLayoutRules).mockRejectedValueOnce(new Error("rete")).mockResolvedValue([] as never);
        const t = newTunnel("menu", ALL);
        t.name = "Carta";
        t.sections = [{ key: "s", name: "Pizze", dishes: [], subs: [{ key: "r", name: "Rosse", dishes: [{ key: "a", productId: null, name: "Bufalina", price: 10, imp: true }], subs: [] }] }];
        const c = ctx({ live: true, pair: "stile1" });
        await expect(saveTunnel(t, c)).rejects.toThrow();
        const saved = await saveTunnel(t, c);
        expect(saved.id).toBe("cat1");
        expect(createCatalog).toHaveBeenCalledTimes(1);
        expect(vi.mocked(createCategory).mock.calls.map(x => [x[2], x[3], x[4]])).toEqual([["Pizze", 1, null], ["Rosse", 2, "sec1"]]);
        expect(createProduct).toHaveBeenCalledTimes(1);
        expect(addProductToCategory).toHaveBeenCalledTimes(1);
    });

    it("storia: se l'ultima scrittura fallisce, riprovando la storia è la stessa", async () => {
        vi.mocked(createStory).mockResolvedValue({ id: "storia1" } as never);
        vi.mocked(updateStory).mockRejectedValueOnce(new Error("rete")).mockResolvedValue(undefined as never);
        const t = newTunnel("storia", ALL);
        t.title = "La nostra pasta";
        const c = ctx();
        await expect(saveTunnel(t, c)).rejects.toThrow();
        t.title = "La nostra pasta fresca";
        expect(await saveTunnel(t, c)).toMatchObject({ id: "storia1", name: "La nostra pasta fresca" });
        expect(createStory).toHaveBeenCalledTimes(1);
        expect(vi.mocked(updateStory).mock.calls[1][2]).toMatchObject({ title: "La nostra pasta fresca" });
    });

    it("in evidenza: la regola fallisce; riprovando il contenuto è lo stesso e la regola una sola", async () => {
        vi.mocked(createFeaturedContent).mockResolvedValue({ id: "ev1" } as never);
        vi.mocked(createFeaturedRuleDraft).mockResolvedValue("regola-ev" as never);
        vi.mocked(updateFeaturedRule).mockRejectedValueOnce(new Error("rete")).mockResolvedValue(undefined as never);
        const t = newTunnel("evid", ALL);
        t.evType = "annuncio";
        t.title = "Serata jazz";
        const c = ctx({ live: true });
        await expect(saveTunnel(t, c)).rejects.toThrow();
        expect(await saveTunnel(t, c)).toMatchObject({ id: "ev1", live: true, ruleId: "regola-ev" });
        expect(createFeaturedContent).toHaveBeenCalledTimes(1);
        expect(updateFeaturedContent).toHaveBeenCalledTimes(1);
        expect(createFeaturedRuleDraft).toHaveBeenCalledTimes(1);
        expect(updateFeaturedRule).toHaveBeenCalledTimes(2);
    });
});

// Review dei tunnel, gruppo B: quello che è già scritto si riconosce dal suo id
// tenuto in memoria; cambiato sullo schermo prima di «Riprova», si aggiorna.
describe("salvare il tunnel: «Riprova» dopo aver cambiato qualcosa", () => {
    const dish = (key: string, name: string): Dish => ({ key, productId: null, name, price: 10 });
    const sec = (key: string, name: string, dishes: Dish[]): Section => ({ key, name, dishes, subs: [] });
    // ogni nuova categoria, prodotto e collegamento ha il suo id; `failLink` fa fallire quel collegamento una volta
    function ids(failLink = 0) {
        let n = 0, p = 0, l = 0;
        vi.mocked(createCatalog).mockResolvedValue({ id: "cat1" } as never);
        vi.mocked(createCategory).mockImplementation(async () => ({ id: "sec" + ++n }) as never);
        vi.mocked(createProduct).mockImplementation(async () => ({ id: "p" + ++p }) as never);
        vi.mocked(addProductToCategory).mockImplementation(async () => {
            if (++l === failLink) throw new Error("rete");
            return { id: "l" + l } as never;
        });
    }

    it("menù, categoria e piatto rinominati: niente nomi vecchi, niente secondo menù", async () => {
        ids(2);
        const t = newTunnel("menu", ALL);
        t.name = "Pranzo";
        t.sections = [sec("s", "Primi", [dish("a", "Carbonara"), dish("b", "Gricia")])];
        const c = ctx();
        await expect(saveTunnel(t, c)).rejects.toThrow("rete");
        t.name = "Pranzo d'estate";
        t.sections = [sec("s", "Primi piatti", [dish("a", "Carbonara"), dish("b", "Gricia romana")])];
        expect(await saveTunnel(t, c)).toMatchObject({ id: "cat1", name: "Pranzo d'estate", productIds: ["p1", "p2"] });
        expect(createCatalog).toHaveBeenCalledTimes(1);
        expect(updateCatalog).toHaveBeenCalledWith("cat1", "t1", { name: "Pranzo d'estate" });
        expect(createCategory).toHaveBeenCalledTimes(1);
        expect(updateCategory).toHaveBeenCalledWith("sec1", "t1", { name: "Primi piatti" });
        expect(createProduct).toHaveBeenCalledTimes(2);
        expect(updateProduct).toHaveBeenCalledWith("p2", "t1", expect.objectContaining({ name: "Gricia romana" }));
        expect(vi.mocked(addProductToCategory).mock.calls.map(x => x[3])).toEqual(["p1", "p2", "p2"]);
    });

    it("piatto tolto: non resta collegato; categoria tolta: se ne va coi suoi piatti", async () => {
        ids(3);
        const t = newTunnel("menu", ALL);
        t.name = "Cena";
        t.sections = [sec("s", "Primi", [dish("a", "Carbonara"), dish("b", "Gricia")]), sec("r", "Secondi", [dish("c", "Tagliata"), dish("d", "Pollo")])];
        const c = ctx();
        await expect(saveTunnel(t, c)).rejects.toThrow("rete");
        // via Primi (con Carbonara e Gricia) e, dai Secondi, il Pollo… che non era ancora collegato
        t.sections = [sec("r", "Secondi", [dish("c", "Tagliata")])];
        expect(await saveTunnel(t, c)).toMatchObject({ id: "cat1", productIds: ["p3"] });
        expect(deleteCategory).toHaveBeenCalledWith("sec1", "t1");
        expect(removeProductFromCategory).not.toHaveBeenCalled();
        expect(updateCategory).toHaveBeenCalledWith("sec2", "t1", { sort_order: 0 });
        expect(createCategory).toHaveBeenCalledTimes(2);
        expect(vi.mocked(addProductToCategory).mock.calls.map(x => [x[2], x[3]])).toEqual([["sec1", "p1"], ["sec1", "p2"], ["sec2", "p3"], ["sec2", "p3"]]);
    });

    it("piatto già collegato e poi tolto: il collegamento se ne va", async () => {
        ids(2);
        const t = newTunnel("menu", ALL);
        t.name = "Cena";
        t.sections = [sec("s", "Primi", [dish("a", "Carbonara"), dish("b", "Gricia")])];
        const c = ctx();
        await expect(saveTunnel(t, c)).rejects.toThrow("rete");
        t.sections = [sec("s", "Primi", [dish("b", "Gricia")])];
        expect(await saveTunnel(t, c)).toMatchObject({ productIds: ["p2"] });
        expect(removeProductFromCategory).toHaveBeenCalledWith("t1", "l1");
        expect(vi.mocked(addProductToCategory).mock.calls.map(x => [x[3], x[4]])).toEqual([["p1", 0], ["p2", 1], ["p2", 0]]);
    });

    it("stile: nome e aspetto cambiati prima di «Riprova» aggiornano lo stile già nato", async () => {
        vi.mocked(createStyle).mockResolvedValue({ id: "st1" } as never);
        vi.mocked(createRuleDraft).mockRejectedValueOnce(new Error("rete")).mockResolvedValue("regola" as never);
        vi.mocked(listLayoutRules).mockResolvedValue([] as never);
        const t = newTunnel("stile", ALL);
        t.name = "Chiaro";
        const c = ctx({ live: true, pair: "m1" });
        await expect(saveTunnel(t, c)).rejects.toThrow("rete");
        t.name = "Chiaro estivo";
        t.look = { ...t.look, colors: { ...t.look.colors, primary: "#123456" } };
        expect(await saveTunnel(t, c)).toMatchObject({ id: "st1", name: "Chiaro estivo" });
        expect(createStyle).toHaveBeenCalledTimes(1);
        expect(updateStyle).toHaveBeenCalledTimes(1);
        expect(vi.mocked(updateStyle).mock.calls[0].slice(0, 2)).toEqual(["st1", "Chiaro estivo"]);
        expect(vi.mocked(updateStyle).mock.calls[0][2]).toBeDefined();
    });
});
