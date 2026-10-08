import { describe, it, expect, vi, beforeEach } from "vitest";

// Un ruolo di sede vede solo le sue sedi di una regola (RLS di
// schedule_targets): se la regola vale anche per sedi altrui, il permesso lo
// sa solo il database. `listWritableScheduleIds` chiede a `can_write_schedule`.
const rpc = vi.fn();

vi.mock("@/services/supabase/client", () => ({
    supabase: {
        rpc: (...args: unknown[]) => rpc(...args)
    }
}));

import { listWritableScheduleIds } from "@/services/supabase/scheduleTargets";

describe("listWritableScheduleIds", () => {
    beforeEach(() => rpc.mockReset());

    it("tiene solo le regole per cui il database dice sì", async () => {
        rpc.mockImplementation((_fn: string, args?: { p_schedule_id: string }) =>
            Promise.resolve({ data: args?.p_schedule_id === "mia", error: null })
        );
        const ids = await listWritableScheduleIds(["mia", "condivisa"]);
        expect([...ids]).toEqual(["mia"]);
        expect(rpc).toHaveBeenCalledWith("can_write_schedule", { p_schedule_id: "condivisa" });
    });

    it("un errore conta come no", async () => {
        rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
        expect((await listWritableScheduleIds(["x"])).size).toBe(0);
    });
});
