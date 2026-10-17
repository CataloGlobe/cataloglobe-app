import { beforeEach, describe, expect, it, vi } from "vitest";

// Ogni chiamata ai servizi finisce in `calls`, in ordine.
const calls: unknown[][] = [];
let nextId = 0;
const rpc = vi.fn(async (...args: unknown[]) => {
    calls.push(["rpc", ...args]);
    return { data: null, error: null };
});

vi.mock("@/services/supabase/client", () => ({ supabase: { rpc: (...args: unknown[]) => rpc(...args) } }));
vi.mock("@/services/supabase/scheduleTargets", () => ({
    createScopedRuleDraft: async (input: unknown) => {
        calls.push(["draft", input]);
        return `regola-${++nextId}`;
    }
}));
vi.mock("@/services/supabase/layoutScheduling", () => ({
    updateScheduleEnabled: async (...args: unknown[]) => {
        calls.push(["enabled", ...args]);
    }
}));

import { createMenuAndStyleRules } from "@/services/supabase/scheduleModel";

beforeEach(() => {
    calls.length = 0;
    nextId = 0;
});

// Il wizard col Calendario acceso (multi menù, passo 6): menù e stile come due regole.
describe("createMenuAndStyleRules", () => {
    it("crea menù e stile sulla sede, li scrive «al posto», poi li accende", async () => {
        const out = await createMenuAndStyleRules({ tenantId: "t1", name: "Menù principale", activityId: "a1", catalogId: "c1", styleId: "s1" });
        expect(out).toEqual({ menuId: "regola-1", styleRuleId: "regola-2" });
        expect(calls).toEqual([
            ["draft", { tenantId: "t1", ruleType: "menu", name: "Menù principale", activityIds: ["a1"] }],
            ["rpc", "save_schedule_model", { p_schedule_id: "regola-1", p_payload: { catalog_id: "c1", overlap_mode: "replace" } }],
            ["draft", { tenantId: "t1", ruleType: "style", name: "Menù principale", activityIds: ["a1"] }],
            ["rpc", "save_schedule_model", { p_schedule_id: "regola-2", p_payload: { style_id: "s1", overlap_mode: "replace" } }],
            ["enabled", "regola-1", true],
            ["enabled", "regola-2", true]
        ]);
    });

    it("se la scrittura del menù fallisce non accende niente", async () => {
        rpc.mockResolvedValueOnce({ data: null, error: { message: "no" } } as never);
        await expect(createMenuAndStyleRules({ tenantId: "t1", name: "M", activityId: "a1", catalogId: "c1", styleId: "s1" })).rejects.toBeTruthy();
        expect(calls.some(c => c[0] === "enabled")).toBe(false);
    });
});
