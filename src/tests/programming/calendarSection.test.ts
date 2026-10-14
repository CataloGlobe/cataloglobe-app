import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
    DB,
    draftEntry,
    draftParts,
    dropAside,
    peekAside,
    draftFromEntry,
    draftPairEntry,
    pairCovers,
    invalid,
    isDirty,
    missing,
    NEW_MODEL,
    parseTime,
    setRangeTime,
    perText,
    syncPer,
    timeFields,
    waitsForDb,
    writeAside,
    type DraftLookups
} from "@/pages/Dashboard/Programming/calendar/calendarDraft";
import { axisFor, dayCtx, dayNum, entriesFromRules, fLines, fState, offLines, order, thingIdOf, voceOf, why } from "@/pages/Dashboard/Programming/calendar/calendarModel";
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

describe("regole spente: pronto, non in onda", () => {
    const layout = { catalog_id: "c1", style_id: "s1" } as LayoutRule["layout"];
    const accesa = rule({ enabled: true, layout });
    const spenta = rule({ enabled: false, applyToAll: true, activityIds: [], layout, time_mode: "window", days_of_week: [1], time_from: "12:00:00", time_to: "15:00:00" });
    const bozza = rule({ enabled: false, layout: { catalog_id: null, style_id: null } as LayoutRule["layout"] });
    const prezzo = rule({ enabled: false, rule_type: "price", price_overrides: [{ product_id: "p1", product_name: "Spritz", override_price: 4, show_original_price: true, option_value_id: null }] as LayoutRule["price_overrides"] });
    const all = [accesa, spenta, bozza, prezzo];
    it("le accese e le spente stanno in due elenchi; bozze, prezzi e disponibilità spenti restano fuori", () => {
        expect(entriesFromRules(all, names).map(e => e.ruleId)).toEqual([accesa.id, accesa.id]);
        const off = entriesFromRules(all, names, true);
        expect(off.map(e => [e.ruleId, e.kind, e.spento])).toEqual([[spenta.id, "menu", true], [spenta.id, "style", true]]);
    });
    it("la voce di una cosa: in quante regole sta, e se una è in onda", () => {
        const on = entriesFromRules(all, names), off = entriesFromRules(all, names, true);
        expect(on.map(thingIdOf)).toEqual(["c1", "s1"]);
        expect(voceOf(on, off, "menu", "c1")).toMatchObject({ count: 2, on: true, entry: { ruleId: accesa.id } });
        expect(voceOf([], off, "menu", "c1")).toMatchObject({ count: 1, on: false, entry: { spento: true } });
        expect(voceOf(on, off, "menu", "c9")).toBeNull();
    });
    it("la linea spenta sta nelle ore che avrebbe, solo nei suoi giorni", () => {
        const off = entriesFromRules(all, names, true), seat = { activityId: "a1", groupIds: [] }, ax = { from: 480, to: 1440 };
        const lun = dayNum(2026, 8, 21);
        expect(offLines(off, "menu", seat, lun, ax).map(l => l.segs)).toEqual([[{ from: 720, to: 900 }]]);
        expect(offLines(off, "menu", seat, lun + 1, ax)).toEqual([]);
        expect(offLines(off, "price", seat, lun, ax)).toEqual([]);
    });
});

describe("una fascia che passa la mezzanotte (punto 26)", () => {
    const layout = { catalog_id: "c1", style_id: "s1" } as LayoutRule["layout"];
    const notte = rule({ enabled: true, applyToAll: true, activityIds: [], layout, time_mode: "window", days_of_week: [5], time_from: "22:00:00", time_to: "02:00:00" });
    const list = entriesFromRules([notte], names), seat = { activityId: "a1", groupIds: [] };
    const ven = dayNum(2026, 8, 25);
    it("l'asse arriva dove finisce l'ultima fascia, e parte dalla prima", () => {
        expect(axisFor(list)).toEqual({ from: 480, to: 1560 });
        const alba = rule({ enabled: true, applyToAll: true, activityIds: [], layout, time_mode: "window", time_from: "05:30:00", time_to: "01:00:00" });
        expect(axisFor(entriesFromRules([alba], names))).toEqual({ from: 300, to: 1500 });
    });
    it("si disegna nel giorno in cui comincia: il venerdì fino alle 02:00, il sabato niente", () => {
        const ax = axisFor(list);
        const segs = (d: number) => fLines(dayCtx(list, "menu", seat, d), ax).flatMap(l => l.segs.filter(x => x.state === "on").map(x => [x.from, x.to]));
        expect(segs(ven)).toEqual([[1320, 1560]]);
        expect(segs(ven + 1)).toEqual([]);
        expect(fState(dayCtx(list, "menu", seat, ven), 1500).win?.ruleId).toBe(notte.id);
    });
});

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
        expect(why(w, l, seat, () => "tutte le sedi")).toBe("c'era prima");
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

describe("l'anteprima di uno stile porta il menù abbinato (#337.6)", () => {
    const seat = { activityId: "a1", groupIds: [] };
    const carta = rule({ applyToAll: true, activityIds: [], time_mode: "always", layout: { catalog_id: "c1", style_id: "s1" } as LayoutRule["layout"] });

    it("la bozza di uno stile ha una voce anche per il suo menù, che nella corsia dei menù copre gli altri", () => {
        const D = blankDraft("style", { all: false, activityIds: ["a1"], groupIds: [] }, "c2");
        expect(draftPairEntry(D, L, 0)).toBeNull(); // finché lo stile non è scelto non c'è niente da mostrare
        D.thing = "s1";
        const pair = draftPairEntry(D, L, 0)!;
        expect(pair).toMatchObject({ kind: "menu", thing: "Pranzo", preview: true });
        const list = [...entriesFromRules([carta], names), draftEntry(D, L, 0)!, pair];
        const week = dayNum(2026, 8, 21);
        expect(fState(dayCtx(list, "menu", seat, week), 12 * 60).onda).toEqual(["Pranzo"]);
        expect(pairCovers(list, pair, seat, week, axisFor(list))).toEqual(["Alla carta"]);
    });

    it("senza abbinato, o per un piatto, non c'è nessuna voce in più", () => {
        const D = blankDraft("style", ALL, null);
        D.thing = "s1";
        expect(draftPairEntry(D, L, 0)).toBeNull();
        const P = blankDraft("price", ALL, "c2");
        P.picks = ["p1"];
        expect(draftPairEntry(P, L, 0)).toBeNull();
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

describe("le ore diverse per sede (D145)", () => {
    const LUN_VEN = { days: [0, 1, 2, 3, 4], ranges: [[720, 900]] as [number, number][] };
    const SEMPRE_PRANZO = { ranges: [[720, 900]] as [number, number][] };

    it("le ore per sede seguono le sedi: chi entra parte da quelle di tutte, con una sede sola spariscono", () => {
        const per = { a1: LUN_VEN, a2: SEMPRE_PRANZO };
        expect(syncPer(per, ["a1", "a3"], { days: [5] })).toEqual({ a1: LUN_VEN, a3: { days: [5] } });
        expect(syncPer(per, ["a1"], LUN_VEN)).toBeNull();
        expect(syncPer(null, ["a1", "a2"], LUN_VEN)).toBeNull();
    });

    it("si salva una regola per ogni orario diverso; ore tutte uguali, una sola col dove di prima", () => {
        const D = blankDraft("menu", ALL, "s1");
        D.thing = "c2";
        D.per = { a1: LUN_VEN, a2: SEMPRE_PRANZO };
        const parts = draftParts(D);
        expect(parts).toHaveLength(2);
        expect(parts.map(p => p.where.activityIds)).toEqual([["a1"], ["a2"]]);
        expect(parts.every(p => p.per === null)).toBe(true);
        expect(parts[1]).toMatchObject({ mode: "add", rule: null });
        D.per = { a1: LUN_VEN, a2: structuredClone(LUN_VEN) };
        expect(draftParts(D)).toEqual([expect.objectContaining({ where: ALL, when: LUN_VEN, per: null })]);
    });

    it("#360.3: riprovando dopo un errore, la regola già salvata non si rifà", async () => {
        const D = blankDraft("menu", ALL, "s1");
        D.thing = "c2";
        D.per = { a1: LUN_VEN, a2: SEMPRE_PRANZO };
        const done = new Set<string>();
        vi.mocked(updateRule).mockResolvedValueOnce(undefined as never).mockRejectedValueOnce(new Error("rete"));
        await expect(saveDraft(D, L, "t1", done)).rejects.toThrow("rete");
        // la prima è salvata; la seconda, nata e non scritta, è stata tolta
        expect(createRuleDraft).toHaveBeenCalledTimes(2);
        expect(deleteLayoutRule).toHaveBeenCalledTimes(1);
        expect(done.size).toBe(1);
        await saveDraft(D, L, "t1", done);
        expect(createRuleDraft).toHaveBeenCalledTimes(3);
        expect(done.size).toBe(2);
        // senza la memoria delle parti la prima nasceva di nuovo
        await saveDraft(D, L, "t1");
        expect(createRuleDraft).toHaveBeenCalledTimes(5);
    });

    it("il riepilogo raccoglie le sedi con le stesse ore", () => {
        expect(perText({ a1: LUN_VEN, a2: SEMPRE_PRANZO }, L)).toMatch(/^Centro: .+ · Stazione: .+$/);
        expect(perText({ a1: LUN_VEN, a2: structuredClone(LUN_VEN) }, L)).toMatch(/^Centro e Stazione: /);
    });

    it("una sede con ore sue: due regole nel Calendario, ognuna con la sua sede", async () => {
        const D = blankDraft("menu", ALL, "s1");
        D.thing = "c2";
        D.per = { a1: LUN_VEN, a2: SEMPRE_PRANZO };
        await saveDraft(D, L, "t");
        expect(createRuleDraft).toHaveBeenCalledTimes(2);
        const calls = vi.mocked(updateRule).mock.calls.map(c => c[0]);
        expect(calls).toEqual([
            expect.objectContaining({ applyToAll: false, daysOfWeek: [1, 2, 3, 4, 5], timeFrom: "12:00" }),
            expect.objectContaining({ applyToAll: false, timeFrom: "12:00", timeTo: "15:00" })
        ]);
        expect(vi.mocked(updateScheduleTargets).mock.calls.map(c => c[1])).toEqual([[{ targetType: "activity", targetId: "a1" }], [{ targetType: "activity", targetId: "a2" }]]);
    });
});

describe("le novità della versione 10 (D120, D149)", () => {
    const keep = { ...NEW_MODEL };
    afterEach(() => {
        Object.assign(NEW_MODEL, keep);
        DB.ready = false;
    });

    it("spente: un menù chiede il suo stile, più fasce e dopo mezzanotte non passano", () => {
        Object.assign(NEW_MODEL, { multiRange: false, overnight: false, multiMenu: false, splitLayout: false });
        const D = blankDraft("menu", ALL, null);
        D.thing = "c2";
        expect(missing(D, L)).toBe("Scegli lo stile che va col menù");
        D.when = { ranges: [[720, 900], [1140, 1380]] };
        expect(invalid(D)).toBe("Più fasce arriva col database nuovo");
        D.when = { ranges: [[1140, 1500]] };
        expect(invalid(D)).toBe("Dopo mezzanotte arriva col database nuovo");
    });

    it("accese: la bozza si fa tutta, il salvataggio aspetta il database nuovo", () => {
        Object.assign(NEW_MODEL, { multiRange: true, overnight: true, multiMenu: true, splitLayout: true });
        const D = blankDraft("menu", ALL, null);
        D.thing = "c2";
        expect(missing(D, L)).toBe("");
        expect(waitsForDb(D)).toBe("Un menù senza stile: si salva col database nuovo");
        D.pair = "s1";
        expect(waitsForDb(D)).toBe("");
        D.when = { ranges: [[720, 900], [1140, 1380]] };
        expect(invalid(D)).toBe("");
        expect(waitsForDb(D)).toBe("Più fasce in una regola: si salva col database nuovo");
        D.when = { ranges: [[1140, 1500]] };
        expect(waitsForDb(D)).toBe("Dopo mezzanotte: si salva col database nuovo");
        DB.ready = true;
        expect(waitsForDb(D)).toBe("");
    });

    it("uno stile da solo aspetta anche lui: oggi la vetrina lo legge solo insieme a un menù", () => {
        const D = blankDraft("style", ALL, null);
        D.thing = "s1";
        expect(waitsForDb(D)).toBe("Uno stile da solo: si salva col database nuovo");
    });
});

describe("l'ora scritta a mano e la fascia che passa la mezzanotte (tunnel, punto 3)", () => {
    const keep = { ...NEW_MODEL };
    afterEach(() => void Object.assign(NEW_MODEL, keep));

    it("si scrive 22, 2230, 22:30 o 22.30; si arrotonda al quarto d'ora", () => {
        expect(parseTime("22")).toBe(1320);
        expect(parseTime("2230")).toBe(1350);
        expect(parseTime("22:30")).toBe(1350);
        expect(parseTime("22.30")).toBe(1350);
        expect(parseTime(" 9 ")).toBe(540);
        expect(parseTime("22:10")).toBe(1335);
        expect(parseTime("24")).toBe(0);
        expect(parseTime("")).toBeNull();
        expect(parseTime("ciao")).toBeNaN();
        expect(parseTime("25")).toBeNaN();
        expect(parseTime("12:70")).toBeNaN();
    });

    it("con la notte: una fine prima dell'inizio è del giorno dopo, e segue l'inizio", () => {
        NEW_MODEL.overnight = true;
        const r: [number, number] = [23 * 60, 24 * 60];
        setRangeTime(r, 1, 5 * 60);
        expect(r).toEqual([1380, 1440 + 300]);
        // l'inizio scende sotto la fine: la fine torna nello stesso giorno
        setRangeTime(r, 0, 2 * 60);
        expect(r).toEqual([120, 300]);
        // e risale sopra: di nuovo il giorno dopo
        setRangeTime(r, 0, 12 * 60);
        expect(r).toEqual([720, 1440 + 300]);
        // le frecce: un quarto d'ora sotto lo zero è 23:45
        setRangeTime(r, 0, -15);
        expect(r[0]).toBe(1425);
    });

    it("senza la notte: la fine resta com'è scritta (lo dice `invalid`) e lo 0 è mezzanotte", () => {
        NEW_MODEL.overnight = false;
        const r: [number, number] = [12 * 60, 15 * 60];
        setRangeTime(r, 1, 0);
        expect(r).toEqual([720, 1440]);
        setRangeTime(r, 1, 10 * 60);
        expect(r).toEqual([720, 600]);
        const D = blankDraft("menu", ALL, null);
        D.when = { ranges: [r] };
        expect(invalid(D)).toBe("Una fascia finisce prima di cominciare");
        setRangeTime(r, 0, 9 * 60);
        expect(r).toEqual([540, 600]);
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
        expect(peekAside("t1")).toBeNull();
        const D = blankDraft("menu", { all: false, activityIds: ["a1"], groupIds: [] }, "s1");
        D.thing = "c2";
        D.when = { days: [0, 1, 2, 3, 4], ranges: [[720, 900]] };
        writeAside(D, "t1");
        expect(peekAside("t1")).toEqual({ kind: "menu", when: D.when, where: D.where, per: null });
        // un periodo senza fine resta senza fine (#337.7): JSON da solo ne farebbe null, cioè il 1970
        D.when = { period: { from: dayNum(2026, 9, 12), to: Infinity } };
        writeAside(D, "t1");
        expect(peekAside("t1")!.when.period).toEqual({ from: dayNum(2026, 9, 12), to: Infinity });
        // è dell'azienda che l'ha messa da parte (#360.8): un'altra non la vede
        expect(peekAside("t2")).toBeNull();
        dropAside("t1");
        expect(peekAside("t1")).toBeNull();
        vi.unstubAllGlobals();
    });
});
