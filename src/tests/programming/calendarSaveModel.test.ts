import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Multi menù, passo 4: col database nuovo il Calendario salva menù e stili da
// soli come regole `menu`/`style`, con save_schedule_model dopo le sedi.
const calls: string[] = [];
vi.mock("@/services/supabase/layoutScheduling", () => ({
    createRuleDraft: vi.fn(async () => (calls.push("create"), "nuova")),
    deleteLayoutRule: vi.fn(async () => undefined),
    updateRule: vi.fn(async () => void calls.push("update"))
}));
vi.mock("@/services/supabase/featuredScheduling", () => ({ createFeaturedRuleDraft: vi.fn(), updateFeaturedRule: vi.fn() }));
vi.mock("@/services/supabase/scheduleTargets", () => ({
    updateScheduleTargets: vi.fn(async () => void calls.push("targets")),
    createScopedRuleDraft: vi.fn(async () => (calls.push("create-scoped"), "nuova-sede"))
}));
vi.mock("@/services/supabase/scheduleModel", () => ({ saveScheduleModel: vi.fn(async () => void calls.push("model")) }));

import { createRuleDraft, updateRule, type LayoutRule } from "@/services/supabase/layoutScheduling";
import { createScopedRuleDraft } from "@/services/supabase/scheduleTargets";
import { saveScheduleModel } from "@/services/supabase/scheduleModel";
import { blankDraft, DB, NEW_MODEL, draftFromEntry, savesAsModel, scontriWait, waitsForDb, type Draft, type DraftLookups, type Scontro } from "@/pages/Dashboard/Programming/calendar/calendarDraft";
import { modelSlotsOf, saveDraft } from "@/pages/Dashboard/Programming/calendar/calendarSave";

const L = { products: new Map(), catalogs: new Map([["bar", "Bar"]]), styles: new Map([["chiaro", "Chiaro"]]), featured: new Map(), sedi: new Map([["a1", "Porto"]]) } as unknown as DraftLookups;
const SEDE = { all: false, activityIds: ["a1"], groupIds: [] };

const menu = (o: Partial<Draft> = {}): Draft => ({ ...blankDraft("menu", SEDE, null), thing: "bar", ...o });

const keep = DB.schedule;
const keepSplit = NEW_MODEL.splitLayout;
beforeEach(() => {
    DB.schedule = true;
    calls.length = 0;
    vi.clearAllMocks();
});
afterEach(() => void (DB.schedule = keep));

describe("Calendario → regole menu e style", () => {
    it("menù nuovo da solo, insieme, due fasce: create menu, update senza layout, sedi, poi la RPC", async () => {
        await saveDraft(menu({ insieme: true, when: { days: [0, 1, 2, 3, 4], ranges: [[720, 900], [1140, 1380]] } }), L, "t");
        expect(calls).toEqual(["create", "update", "targets", "model"]);
        expect(createRuleDraft).toHaveBeenCalledWith(expect.objectContaining({ ruleType: "menu" }));
        const u = vi.mocked(updateRule).mock.calls[0][0];
        expect(u.ruleType).toBe("menu");
        expect(u.layout).toBeUndefined();
        // il quando lo scrive la RPC: updateRule non tocca le colonne che rifanno le fasce
        expect(u.keepTime).toBe(true);
        expect(saveScheduleModel).toHaveBeenCalledWith("nuova", {
            catalog_id: "bar",
            overlap_mode: "together",
            slots: [
                { days_of_week: [1, 2, 3, 4, 5], start_minute: 720, end_minute: 900 },
                { days_of_week: [1, 2, 3, 4, 5], start_minute: 1140, end_minute: 1380 }
            ]
        });
    });

    it("stile da solo, senza ore: style_id, niente fasce, il quando lo scrive updateRule", async () => {
        await saveDraft({ ...blankDraft("style", SEDE, null), thing: "chiaro" }, L, "t");
        expect(saveScheduleModel).toHaveBeenCalledWith("nuova", { style_id: "chiaro" });
        expect(vi.mocked(updateRule).mock.calls[0][0].keepTime).toBeUndefined();
    });

    it("menù con solo il periodo: resta `window` (colonne di updateRule), niente fasce alla RPC", async () => {
        await saveDraft(menu({ when: { period: { from: 1, to: 2 } as never } }), L, "t");
        const u = vi.mocked(updateRule).mock.calls[0][0];
        expect(u.keepTime).toBeUndefined();
        expect(u.timeMode).toBe("window");
        expect(vi.mocked(saveScheduleModel).mock.calls[0][1]).not.toHaveProperty("slots");
    });

    it("un ruolo di sede crea la bozza menu con le sue sedi", async () => {
        await saveDraft(menu(), L, "t", undefined, ["a1"]);
        expect(createScopedRuleDraft).toHaveBeenCalledWith(expect.objectContaining({ ruleType: "menu", activityIds: ["a1"] }));
    });

    it("una regola layout resta layout; senza il database nuovo tutto come oggi", async () => {
        const layout = { id: "vecchia", rule_type: "layout", tenant_id: "t", name: "x", layout: { catalog_id: "bar", style_id: "chiaro" } } as unknown as LayoutRule;
        expect(savesAsModel(menu({ rule: layout, mode: "edit" }))).toBe(false);
        // la coppia che il Calendario mette da sé (pairFor) conta solo coi tipi insieme
        NEW_MODEL.splitLayout = true;
        expect(savesAsModel(menu({ pair: "chiaro" }))).toBe(true);
        NEW_MODEL.splitLayout = false;
        expect(savesAsModel(menu({ pair: "chiaro" }))).toBe(false);
        NEW_MODEL.splitLayout = keepSplit;
        DB.schedule = false;
        expect(savesAsModel(menu())).toBe(false);
        await saveDraft(menu({ pair: "chiaro" }), L, "t");
        expect(vi.mocked(updateRule).mock.calls[0][0]).toMatchObject({ ruleType: "layout", layout: { catalogId: "bar", styleId: "chiaro" } });
        expect(vi.mocked(updateRule).mock.calls[0][0].keepTime).toBeUndefined();
        expect(saveScheduleModel).not.toHaveBeenCalled();
    });

    it("le attese del database cadono solo per le bozze del modello nuovo", () => {
        const sc = [{ vince: true, pari: false }] as unknown as Scontro[];
        const due = menu({ insieme: true, when: { ranges: [[720, 900], [1140, 1560]] } });
        expect(waitsForDb(due)).toBe("");
        expect(scontriWait(due, sc)).toBe("");
        DB.schedule = false;
        expect(waitsForDb(due)).not.toBe("");
        expect(scontriWait(due, sc)).not.toBe("");
    });

    it("riaprendo un menù «insieme» resta insieme", () => {
        const r = { id: "m", rule_type: "menu", tenant_id: "t", name: "Bar", overlap_mode: "together", layout: { catalog_id: "bar", style_id: null }, applyToAll: false, activityIds: ["a1"], groupIds: [], time_mode: "always", price_overrides: [], visibility_overrides: [], featured_contents: [] } as unknown as LayoutRule;
        const e = { id: "m:menu", ruleId: "m", kind: "menu", thing: "Bar", where: SEDE, when: {}, tscore: 0, priority: 10, created: 0, add: true, rule: r };
        const D = draftFromEntry(e as never, L);
        expect(D.insieme).toBe(true);
        expect(savesAsModel(D)).toBe(true);
    });

    it("modelSlotsOf: solo giorni = tutto il giorno; niente = undefined", () => {
        expect(modelSlotsOf({ days: [6] })).toEqual([{ days_of_week: [0], start_minute: 0, end_minute: 1440 }]);
        expect(modelSlotsOf({})).toBeUndefined();
        expect(modelSlotsOf({ period: { from: 1, to: 2 } as never })).toBeUndefined();
    });
});
