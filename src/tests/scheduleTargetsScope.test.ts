import { describe, it, expect, vi, beforeEach } from "vitest";

// «Nuova regola» dalla sede (T9b, PG6): la bozza nasce su tutte le sedi e va
// portata sulla sede prima di aprirla. La RPC rifiuta le regole apply_to_all,
// quindi l'ordine conta: prima apply_to_all=false, poi le sedi.
const rpc = vi.fn();
const from = vi.fn();
const calls: string[] = [];

vi.mock("@/services/supabase/client", () => ({
    supabase: {
        rpc: (...args: unknown[]) => {
            calls.push("rpc");
            return rpc(...args);
        },
        from: (...args: unknown[]) => {
            calls.push("update");
            return from(...args);
        }
    }
}));

import { scopeRuleToActivity } from "@/services/supabase/scheduleTargets";

function updateBuilder(result: { data: unknown; error: unknown }, captured: { patch?: unknown }) {
    const builder: Record<string, unknown> = {};
    builder.update = (patch: unknown) => {
        captured.patch = patch;
        return builder;
    };
    builder.eq = () => builder;
    builder.select = () => builder;
    builder.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve);
    return builder;
}

beforeEach(() => {
    rpc.mockReset();
    from.mockReset();
    calls.length = 0;
});

describe("scopeRuleToActivity", () => {
    it("toglie apply_to_all, scrive lo shim e poi le sedi con la RPC", async () => {
        const captured: { patch?: unknown } = {};
        from.mockImplementation(() => updateBuilder({ data: [{ id: "r1" }], error: null }, captured));
        rpc.mockResolvedValue({ data: 1, error: null });

        await scopeRuleToActivity("r1", "a1");

        expect(calls).toEqual(["update", "rpc"]);
        expect(captured.patch).toEqual({ apply_to_all: false, target_type: "activity", target_id: "a1" });
        expect(rpc).toHaveBeenCalledWith("update_schedule_targets", {
            p_schedule_id: "r1",
            p_targets: [{ target_type: "activity", target_id: "a1" }]
        });
    });

    it("0 righe aggiornate è un errore, e la RPC non parte", async () => {
        from.mockImplementation(() => updateBuilder({ data: [], error: null }, {}));
        await expect(scopeRuleToActivity("r1", "a1")).rejects.toThrow();
        expect(rpc).not.toHaveBeenCalled();
    });
});
