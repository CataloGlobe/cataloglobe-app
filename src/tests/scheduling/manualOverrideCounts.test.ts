import { beforeEach, describe, expect, it, vi } from "vitest";

// «A mano» della matrice (§20.3, §19.5): tutte le modifiche della sede, una
// richiesta per tutte le sedi, e l'errore arriva al chiamante.

const from = vi.fn();

vi.mock("@/services/supabase/client", () => ({
    supabase: { from: (...args: unknown[]) => from(...args) }
}));

import { countManualOverridesByActivity } from "@/services/supabase/activeCatalog";

type Call = { method: string; args: unknown[] };

function builder(result: { data: unknown; error: unknown }, calls: Call[]) {
    const b: Record<string, unknown> = {};
    for (const method of ["select", "eq", "in"]) {
        b[method] = (...args: unknown[]) => {
            calls.push({ method, args });
            return b;
        };
    }
    b.then = (resolve: (v: unknown) => unknown) => resolve(result);
    return b;
}

describe("countManualOverridesByActivity", () => {
    beforeEach(() => from.mockReset());

    it("conta tutte le modifiche per sede, nascosti, non disponibili e visibili, in una richiesta", async () => {
        const calls: Call[] = [];
        from.mockImplementation(() =>
            builder(
                {
                    data: [
                        { activity_id: "a", visible_override: false },
                        { activity_id: "a", visible_override: true },
                        { activity_id: "b", visible_override: false }
                    ],
                    error: null
                },
                calls
            )
        );

        const counts = await countManualOverridesByActivity(["a", "b", "c"]);

        expect(counts).toEqual({ a: 2, b: 1, c: 0 });
        expect(from).toHaveBeenCalledTimes(1);
        expect(from).toHaveBeenCalledWith("activity_product_overrides");
        expect(calls).toContainEqual({ method: "in", args: ["activity_id", ["a", "b", "c"]] });
        expect(calls.some(c => c.method === "eq")).toBe(false);
    });

    it("senza sedi non chiede niente", async () => {
        expect(await countManualOverridesByActivity([])).toEqual({});
        expect(from).not.toHaveBeenCalled();
    });

    it("un errore non diventa «nessuna»: arriva al chiamante", async () => {
        from.mockImplementation(() => builder({ data: null, error: { code: "42501", message: "denied" } }, []));
        await expect(countManualOverridesByActivity(["a"])).rejects.toMatchObject({ code: "42501" });
    });
});
