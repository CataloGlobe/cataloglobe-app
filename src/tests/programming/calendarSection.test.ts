import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/services/supabase/layoutScheduling", () => ({
    createRuleDraft: vi.fn(async () => "nuova"),
    deleteLayoutRule: vi.fn(async () => undefined),
    updateRule: vi.fn(async () => undefined)
}));
vi.mock("@/services/supabase/featuredScheduling", () => ({
    createFeaturedRuleDraft: vi.fn(async () => "nuova-ev"),
    updateFeaturedRule: vi.fn(async () => undefined)
}));
vi.mock("@/services/supabase/scheduleTargets", () => ({ updateScheduleTargets: vi.fn(async () => undefined) }));

import { createRuleDraft, deleteLayoutRule, updateRule, type LayoutRule } from "@/services/supabase/layoutScheduling";
import { createFeaturedRuleDraft, updateFeaturedRule } from "@/services/supabase/featuredScheduling";
import { updateScheduleTargets } from "@/services/supabase/scheduleTargets";
import {
    blankDraft,
    draftEntry,
    dropAside,
    peekAside,
    draftFromEntry,
    invalid,
    isDirty,
    missing,
    timeFields,
    writeAside,
    type DraftLookups
} from "@/pages/Dashboard/Programming/calendar/calendarDraft";
import { dayCtx, dayNum, entriesFromRules, fState, order, why } from "@/pages/Dashboard/Programming/calendar/calendarModel";
import { compareCandidates, specificityFor } from "@shared/scheduleCompetition";
import { dropDraft, PartialSaveError, saveDraft } from "@/pages/Dashboard/Programming/calendar/calendarSave";

let n = 0;
const rule = (o: Partial<LayoutRule>): LayoutRule =>
    ({
        id: "r" + ++n,
        tenant_id: "t",
        name: null,
        rule_type: "layout",
        target_type: "",
        target_id: "",
        target_group: null,
        applyToAll: false,
        activityIds: ["a1"],
        groupIds: [],
        visibility_mode: "hide",
        priority: 10,
        priority_level: "normal",
        display_order: 0,
        enabled: true,
        time_mode: "window",
        days_of_week: null,
        time_from: null,
        time_to: null,
        start_at: null,
        end_at: null,
        created_at: "2026-09-01T10:00:00Z",
        layout: null,
        price_overrides: [],
        visibility_overrides: [],
        featured_contents: [],
        ...o
    }) as LayoutRule;

const L: DraftLookups = {
    products: new Map([
        ["p1", { id: "p1", name: "Spritz", category: "Aperitivi", listPrice: 6, formats: [] }],
        ["p2", { id: "p2", name: "Negroni", category: "Aperitivi", listPrice: 7, formats: [] }],
        ["p3", { id: "p3", name: "Birra", category: "Birre", listPrice: 5, formats: [{ id: "v1", name: "Piccola" }, { id: "v2", name: "Media" }] }]
    ]),
    catalogs: new Map([["c1", "Alla carta"], ["c2", "Pranzo"]]),
    styles: new Map([["s1", "Classico"]]),
    featured: new Map([["f1", "Piatto del giorno"], ["f2", "Vini"], ["f3", "Serata jazz"]]),
    sedi: new Map([["a1", "Centro"], ["a2", "Stazione"]]),
    groups: new Map(),
    multi: false
};
const names = { catalogs: new Map(L.catalogs), styles: new Map(L.styles), featured: new Map(L.featured), products: new Map([["p1", "Spritz"], ["p2", "Negroni"], ["p3", "Birra"]]) };
const ALL = { all: true, activityIds: [], groupIds: [] };

const happy = () =>
    rule({
        rule_type: "price",
        name: "Happy hour",
        time_from: "17:00:00",
        time_to: "19:30:00",
        price_overrides: [
            { product_id: "p1", product_name: "Spritz", override_price: 4, show_original_price: true, option_value_id: null },
            { product_id: "p2", product_name: "Negroni", override_price: 5, show_original_price: true, option_value_id: null }
        ] as LayoutRule["price_overrides"]
    });
const entryOf = (r: LayoutRule, i = 0) => entriesFromRules([r], names)[i];

beforeEach(() => vi.clearAllMocks());

describe("bozza della sezione", () => {
    it("i tempi tornano come li scrive l'editor: domenica = 0, fine alle 24 → 23:59", () => {
        const t = timeFields({ period: { from: dayNum(2026, 9, 9), to: dayNum(2026, 10, 8) }, days: [0, 6], ranges: [[720, 1440]] });
        expect(t).toMatchObject({ timeMode: "window", daysOfWeek: [1, 0], timeFrom: "12:00", timeTo: "23:59", startDay: "2026-10-09", endDay: "2026-11-08", alwaysActive: false });
        expect(timeFields({})).toMatchObject({ timeMode: "always", daysOfWeek: null, timeFrom: null, timeTo: null, alwaysActive: true });
    });

    it("cosa manca e cosa non va: un piatto, ogni prezzo (anche per formato), le sedi, le date", () => {
        const D = blankDraft("price", ALL, null);
        expect(missing(D, L)).toBe("Scegli almeno un piatto");
        D.picks = ["p3"];
        D.prices = { "p3:v1": 3 };
        expect(missing(D, L)).toBe("Manca un prezzo");
        D.prices["p3:v2"] = 4;
        expect(missing(D, L)).toBe("");
        D.when = { period: { from: 10, to: 5 } };
        expect(invalid(D)).toMatch(/fine del periodo/);
        D.when = {};
        D.where = { all: false, activityIds: [], groupIds: [] };
        expect(invalid(D)).toMatch(/sede/);
    });

    it("una bozza nuova non è cambiata finché non si sceglie qualcosa", () => {
        const D = blankDraft("menu", ALL, "s1");
        expect(isDirty(D)).toBe(false);
        D.thing = "c2";
        expect(isDirty(D)).toBe(true);
    });

    it("modificando un piatto solo di una regola con altri piatti si carica solo lui", () => {
        const r = happy();
        const D = draftFromEntry(entryOf(r), L, "p2");
        expect(D.only).toBe("p2");
        expect(D.picks).toEqual(["p2"]);
        expect(D.prices).toEqual({ p2: 5 });
        expect(D.name).toBeNull();
        // l'unico piatto della regola: si modifica la regola intera
        const solo = rule({ rule_type: "price", price_overrides: [r.price_overrides[0]] });
        expect(draftFromEntry(entryOf(solo), L, "p1").only).toBeNull();
    });

    it("l'anteprima dei piatti porta i loro nomi", () => {
        const D = blankDraft("price", ALL, null);
        D.picks = ["p1", "p2"];
        expect(draftEntry(D, L, 0)).toMatchObject({ thing: "Spritz, Negroni", preview: true, priority: 21 });
    });
});

describe("chi vince a parità (#337.1)", () => {
    const seat = { activityId: "a1", groupIds: [] };
    const menu = (catalog: string, created_at: string, o: Partial<LayoutRule> = {}) =>
        rule({ applyToAll: true, activityIds: [], time_mode: "always", created_at, layout: { catalog_id: catalog, style_id: "s1" } as LayoutRule["layout"], ...o });

    it("due menù «Sempre, tutte le sedi» con la stessa priorità: in onda il più vecchio, come nella pagina pubblica", () => {
        const vecchio = menu("c1", "2026-03-01T10:00:00Z"), nuovo = menu("c2", "2026-09-01T10:00:00Z");
        const entries = entriesFromRules([nuovo, vecchio], names).filter(e => e.kind === "menu");
        const st = fState(dayCtx(entries, "menu", seat, dayNum(2026, 8, 23)), 12 * 60);
        expect(st.win?.ruleId).toBe(vecchio.id);
        expect(st.onda).toEqual(["Alla carta"]);
        expect(st.hidden).toEqual(["Pranzo"]);
        const [w, l] = [...entries].sort(order(seat));
        expect(why(w, l, seat, () => "tutte le sedi")).toBe("è stato aggiunto prima");
    });

    it("l'ordine del Calendario è quello di compareCandidates, anche a parità di data", () => {
        const rules = [
            menu("c1", "2026-03-01T10:00:00Z"),
            menu("c2", "2026-03-01T10:00:00Z"),
            menu("c1", "2026-01-01T10:00:00Z", { priority: 30 }),
            menu("c2", "2026-09-01T10:00:00Z", { applyToAll: false, activityIds: ["a1"] }),
            menu("c1", "2026-09-02T10:00:00Z", { time_mode: "window", time_from: "12:00:00", time_to: "15:00:00" })
        ];
        const cal = entriesFromRules(rules, names).filter(e => e.kind === "menu").sort(order(seat)).map(e => e.ruleId);
        const pub = rules
            .map(r => ({ rule: r, specificity: specificityFor(r, seat)! }))
            .sort(compareCandidates)
            .map(x => x.rule.id);
        expect(cal).toEqual(pub);
    });
});

describe("salvare la sezione", () => {
    it("un menù nuovo: bozza della regola, poi menù e stile insieme, per tutte le sedi senza toccare le sedi", async () => {
        const D = blankDraft("menu", ALL, "s1");
        D.thing = "c2";
        D.when = { days: [0, 1, 2, 3, 4], ranges: [[720, 900]] };
        await saveDraft(D, L, "t");
        expect(createRuleDraft).toHaveBeenCalledWith({ tenantId: "t", ruleType: "layout", name: "Pranzo · Lun–Ven · 12:00–15:00" });
        expect(updateRule).toHaveBeenCalledWith(
            expect.objectContaining({ scheduleId: "nuova", applyToAll: true, enabled: true, layout: { catalogId: "c2", styleId: "s1" }, daysOfWeek: [1, 2, 3, 4, 5], timeFrom: "12:00", timeTo: "15:00" })
        );
        expect(updateScheduleTargets).not.toHaveBeenCalled();
    });

    it("un piatto solo, stessi orari e sedi: si riscrive la stessa regola con gli altri piatti", async () => {
        const r = happy();
        const D = draftFromEntry(entryOf(r), L, "p2");
        D.prices = { p2: 4.5 };
        await saveDraft(D, L, "t");
        expect(createRuleDraft).not.toHaveBeenCalled();
        expect(updateRule).toHaveBeenCalledTimes(1);
        const arg = vi.mocked(updateRule).mock.calls[0][0];
        expect(arg).toMatchObject({ scheduleId: r.id, name: "Happy hour" });
        expect(arg.priceProducts).toEqual([
            { productId: "p1", optionValueId: null, overridePrice: 4, showOriginalPrice: true },
            { productId: "p2", optionValueId: null, overridePrice: 4.5, showOriginalPrice: true }
        ]);
        expect(updateScheduleTargets).toHaveBeenCalledWith(r.id, [{ targetType: "activity", targetId: "a1" }]);
    });

    it("un piatto solo con orari nuovi: esce dalla regola e ne fa una sua", async () => {
        const r = happy();
        const D = draftFromEntry(entryOf(r), L, "p2");
        D.when = { ranges: [[1080, 1200]] };
        await saveDraft(D, L, "t");
        expect(createRuleDraft).toHaveBeenCalledWith(expect.objectContaining({ ruleType: "price" }));
        const [mine, left] = vi.mocked(updateRule).mock.calls.map(c => c[0]);
        expect(mine).toMatchObject({ scheduleId: "nuova", timeFrom: "18:00", timeTo: "20:00", priceProducts: [{ productId: "p2", optionValueId: null, overridePrice: 5, showOriginalPrice: true }] });
        expect(left).toMatchObject({ scheduleId: r.id, name: "Happy hour", timeFrom: "17:00", timeTo: "19:30", priceProducts: [{ productId: "p1", optionValueId: null, overridePrice: 4, showOriginalPrice: true }] });
        expect(deleteLayoutRule).not.toHaveBeenCalled();
    });

    it("«Modifica completa» con solo l'orario cambiato: barrato e modo restano quelli di ogni piatto (#337.3)", async () => {
        const prezzi = rule({
            rule_type: "price",
            price_overrides: [
                { product_id: "p1", product_name: "Spritz", override_price: 4, show_original_price: true, option_value_id: null },
                { product_id: "p2", product_name: "Negroni", override_price: 5, show_original_price: false, option_value_id: null }
            ] as LayoutRule["price_overrides"]
        });
        const D = draftFromEntry(entryOf(prezzi), L);
        D.when = { ranges: [[1080, 1200]] };
        await saveDraft(D, L, "t");
        expect(vi.mocked(updateRule).mock.calls[0][0].priceProducts).toEqual([
            { productId: "p1", optionValueId: null, overridePrice: 4, showOriginalPrice: true },
            { productId: "p2", optionValueId: null, overridePrice: 5, showOriginalPrice: false }
        ]);

        vi.clearAllMocks();
        const nascosti = rule({
            rule_type: "visibility",
            visibility_overrides: [
                { product_id: "p1", product_name: "Spritz", mode: "hide" },
                { product_id: "p2", product_name: "Negroni", mode: "disable" }
            ] as LayoutRule["visibility_overrides"]
        });
        const V = draftFromEntry(entryOf(nascosti), L);
        V.when = { ranges: [[1080, 1200]] };
        await saveDraft(V, L, "t");
        expect(vi.mocked(updateRule).mock.calls[0][0].visibilityProductOverrides).toEqual([
            { productId: "p1", mode: "hide" },
            { productId: "p2", mode: "disable" }
        ]);

        // Toccato il comando (uno per tutti), vale la scelta nuova e la bozza risulta cambiata.
        const T = draftFromEntry(entryOf(prezzi), L);
        expect(isDirty(T)).toBe(false);
        delete T.strikeBy;
        expect(isDirty(T)).toBe(true);
    });

    it("una regola nuova che non si riesce a scrivere non resta orfana (#337.5)", async () => {
        vi.mocked(updateRule).mockRejectedValueOnce(new Error("rifiutata"));
        const D = blankDraft("menu", ALL, "s1");
        D.thing = "c2";
        await expect(saveDraft(D, L, "t")).rejects.toThrow("rifiutata");
        expect(deleteLayoutRule).toHaveBeenCalledWith("nuova");
    });

    it("piatto con orari nuovi: se la regola nuova non si scrive si toglie, quella di partenza non si tocca (#337.5)", async () => {
        const r = happy();
        vi.mocked(updateRule).mockRejectedValueOnce(new Error("rifiutata"));
        const D = draftFromEntry(entryOf(r), L, "p2");
        D.when = { ranges: [[1080, 1200]] };
        await expect(saveDraft(D, L, "t")).rejects.toThrow("rifiutata");
        expect(deleteLayoutRule).toHaveBeenCalledWith("nuova");
        expect(updateRule).toHaveBeenCalledTimes(1);
    });

    it("piatto con orari nuovi: se non esce dalla regola di partenza è un salvataggio a metà, e niente si disfa (#337.5)", async () => {
        const r = happy();
        vi.mocked(updateRule).mockResolvedValueOnce(undefined as never).mockRejectedValueOnce(new Error("rete"));
        const D = draftFromEntry(entryOf(r), L, "p2");
        D.when = { ranges: [[1080, 1200]] };
        await expect(saveDraft(D, L, "t")).rejects.toBeInstanceOf(PartialSaveError);
        expect(createRuleDraft).toHaveBeenCalledTimes(1);
        expect(deleteLayoutRule).not.toHaveBeenCalled();
    });

    it("«Togli dal calendario»: il piatto solo esce dalla regola; l'ultimo toglie la regola", async () => {
        const r = happy();
        await dropDraft(draftFromEntry(entryOf(r), L, "p1"));
        expect(vi.mocked(updateRule).mock.calls[0][0].priceProducts).toEqual([{ productId: "p2", optionValueId: null, overridePrice: 5, showOriginalPrice: true }]);
        expect(deleteLayoutRule).not.toHaveBeenCalled();
        await dropDraft(draftFromEntry(entryOf(r), L));
        expect(deleteLayoutRule).toHaveBeenCalledWith(r.id);
    });

    it("In evidenza: un contenuto solo di più cambia solo lui, nello stesso posto", async () => {
        const r = rule({
            rule_type: "featured",
            featured_contents: [
                { featured_content_id: "f1", slot: "before_catalog", sort_order: 0, featured_content_title: "Piatto del giorno" },
                { featured_content_id: "f2", slot: "before_catalog", sort_order: 1, featured_content_title: "Vini" }
            ] as LayoutRule["featured_contents"]
        });
        const e = entriesFromRules([r], names).find(x => x.id.endsWith(":featured:f2"))!;
        const D = draftFromEntry(e, L, null);
        expect(D.only).toBe("f2");
        D.thing = "f3";
        await saveDraft(D, L, "t");
        expect(createFeaturedRuleDraft).not.toHaveBeenCalled();
        expect(vi.mocked(updateFeaturedRule).mock.calls[0][0].featuredContents).toEqual([
            { featured_content_id: "f1", slot: "before_catalog", sort_order: 0 },
            { featured_content_id: "f3", slot: "before_catalog", sort_order: 1 }
        ]);
    });
});

describe("la bozza messa da parte", () => {
    it("un tunnel ne legge solo cosa, quando e dove; «via» la toglie", () => {
        const store = new Map<string, string>();
        vi.stubGlobal("sessionStorage", {
            getItem: (k: string) => store.get(k) ?? null,
            setItem: (k: string, v: string) => void store.set(k, v),
            removeItem: (k: string) => void store.delete(k)
        });
        expect(peekAside()).toBeNull();
        const D = blankDraft("menu", { all: false, activityIds: ["a1"], groupIds: [] }, "s1");
        D.thing = "c2";
        D.when = { days: [0, 1, 2, 3, 4], ranges: [[720, 900]] };
        writeAside(D);
        expect(peekAside()).toEqual({ kind: "menu", when: D.when, where: D.where });
        dropAside();
        expect(peekAside()).toBeNull();
        vi.unstubAllGlobals();
    });
});
