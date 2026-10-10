import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/services/supabase/catalogs", () => ({
    createCatalog: vi.fn(async () => ({ id: "cat1" })),
    createCategory: vi.fn(async () => ({ id: "sec1" })),
    addProductToCategory: vi.fn(async () => undefined),
    deleteCategory: vi.fn(),
    removeProductFromCategory: vi.fn(),
    updateCategory: vi.fn(),
    updateProductSortOrder: vi.fn()
}));
vi.mock("@/services/supabase/products", () => ({ createProduct: vi.fn() }));
vi.mock("@/services/supabase/productOptions", () => ({ createPrimaryPriceFormat: vi.fn() }));
vi.mock("@/services/supabase/styles", () => ({ createStyle: vi.fn(async () => ({ id: "st1" })) }));
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

import { addProductToCategory, createCatalog, createCategory } from "@/services/supabase/catalogs";
import { createProduct } from "@/services/supabase/products";
import { listLayoutRules } from "@/services/supabase/layoutScheduling";
import { createFeaturedContent, updateFeaturedContent } from "@/services/supabase/featuredContents";
import { createFeaturedRuleDraft, updateFeaturedRule } from "@/services/supabase/featuredScheduling";
import { createStory, updateStory } from "@/services/supabase/stories";
import { DEFAULT_STYLE_TOKENS } from "@/pages/Dashboard/Styles/Editor/StyleTokenModel";
import { newTunnel } from "@/pages/Dashboard/Crea/creaModel";
import { saveTunnel, type SaveCtx } from "@/pages/Dashboard/Crea/creaSave";
import type { DraftLookups } from "@/pages/Dashboard/Programming/calendar/calendarDraft";

// Review #360.2: se un passo del salvataggio fallisce, «Riprova» riparte da
// quello che c'è già invece di ricreare tutto (menù, categorie e piatti doppi).

const ALL = { all: true, activityIds: [], groupIds: [] };
const L: DraftLookups = { products: new Map(), catalogs: new Map(), styles: new Map(), featured: new Map(), sedi: new Map(), groups: new Map(), multi: false };
const ctx = (o: Partial<SaveCtx> = {}): SaveCtx => ({ tenantId: "t1", L, live: false, pair: null, baseTokens: DEFAULT_STYLE_TOKENS, blockFiles: {}, done: new Map(), ...o });

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
