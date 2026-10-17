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
const enabled = vi.fn(async (...args: unknown[]) => void calls.push(["enabled", ...args]));
vi.mock("@/services/supabase/layoutScheduling", () => ({
    updateScheduleEnabled: (...args: unknown[]) => enabled(...args),
    deleteLayoutRule: async (id: string) => void calls.push(["delete", id])
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

    const input = { tenantId: "t1", name: "M", activityId: "a1", catalogId: "c1", styleId: "s1" };

    it("se la scrittura del menù fallisce non accende niente e toglie la bozza", async () => {
        rpc.mockResolvedValueOnce({ data: null, error: { message: "no" } } as never);
        await expect(createMenuAndStyleRules(input)).rejects.toBeTruthy();
        expect(calls.some(c => c[0] === "enabled")).toBe(false);
        expect(calls.filter(c => c[0] === "delete")).toEqual([["delete", "regola-1"]]);
    });

    it("se la scrittura dello stile fallisce toglie menù e stile", async () => {
        rpc.mockResolvedValueOnce({ data: null, error: null }).mockResolvedValueOnce({ data: null, error: { message: "no" } } as never);
        await expect(createMenuAndStyleRules(input)).rejects.toBeTruthy();
        expect(calls.filter(c => c[0] === "delete")).toEqual([["delete", "regola-1"], ["delete", "regola-2"]]);
    });

    it("se l'accensione dello stile fallisce toglie anche il menù già acceso, e rilancia l'errore", async () => {
        const boom = new Error("rete");
        enabled.mockImplementationOnce(async (...args: unknown[]) => void calls.push(["enabled", ...args])).mockRejectedValueOnce(boom);
        await expect(createMenuAndStyleRules(input)).rejects.toBe(boom);
        expect(calls.filter(c => c[0] === "delete")).toEqual([["delete", "regola-1"], ["delete", "regola-2"]]);
    });
});
