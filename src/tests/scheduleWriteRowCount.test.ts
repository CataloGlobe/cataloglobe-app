import { describe, it, expect, vi, beforeEach } from "vitest";

// Un UPDATE o DELETE rifiutato dall'RLS non dà errore: PostgREST risponde 200
// con zero righe. Il service deve trattarlo come errore (come deleteReview),
// altrimenti l'interfaccia dice «salvato» e sul DB non è cambiato niente.
const from = vi.fn();

vi.mock("@/services/supabase/client", () => ({
    supabase: {
        from: (...args: unknown[]) => from(...args)
    }
}));

vi.mock("@services/publicCatalog/revalidatePublicCatalog", () => ({
    revalidatePublicCatalogForTenant: vi.fn()
}));

// vitest.config.ts risolve solo «@» e «@shared»: gli alias di Vite usati dal
// service si puntano ai moduli veri.
vi.mock("@utils/priorityUtils", () => import("@/utils/priorityUtils"));
vi.mock("@utils/scheduleDays", () => import("@/utils/scheduleDays"));

import {
    updateScheduleEnabled,
    deleteLayoutRule,
    updateRule,
    reorderSchedulesInLevel
} from "@/services/supabase/layoutScheduling";

/**
 * Builder PostgREST finto: ogni metodo incatenabile ritorna `this`, la catena
 * si risolve con `result` su `maybeSingle()` o su `await`.
 */
function queryBuilder(result: { data: unknown; error: unknown }) {
    const builder: Record<string, unknown> = {};
    for (const method of ["select", "eq", "in", "order", "limit", "update", "delete"]) {
        builder[method] = () => builder;
    }
    builder.maybeSingle = () => Promise.resolve(result);
    builder.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve);
    return builder;
}

const NONE = { data: [], error: null };
const ONE = { data: [{ id: "s1", tenant_id: "t1" }], error: null };

beforeEach(() => {
    from.mockReset();
});

const baseRule = {
    scheduleId: "s1",
    tenantId: "t1",
    ruleType: "layout" as const,
    applyToAll: false,
    activityIds: ["a1"],
    groupIds: [],
    enabled: true,
    timeMode: "always" as const,
    daysOfWeek: null,
    timeFrom: null,
    timeTo: null,
    startAt: null,
    endAt: null
};

describe("scritture sulle regole rifiutate dall'RLS (0 righe)", () => {
    it("updateScheduleEnabled: 0 righe è un errore", async () => {
        from.mockImplementation(() => queryBuilder(NONE));
        await expect(updateScheduleEnabled("s1", true)).rejects.toThrow(/permess/i);
    });

    it("updateScheduleEnabled: 1 riga passa", async () => {
        from.mockImplementation(() => queryBuilder(ONE));
        await expect(updateScheduleEnabled("s1", true)).resolves.toBeUndefined();
    });

    it("deleteLayoutRule: 0 righe è un errore", async () => {
        from.mockImplementationOnce(() => queryBuilder({ data: { tenant_id: "t1" }, error: null }))
            .mockImplementation(() => queryBuilder(NONE));
        await expect(deleteLayoutRule("s1")).rejects.toThrow(/permess/i);
    });

    it("updateRule: 0 righe sulla regola è un errore", async () => {
        from.mockImplementation(() => queryBuilder(NONE));
        await expect(updateRule(baseRule)).rejects.toThrow(/permess/i);
    });

    it("reorderSchedulesInLevel: 0 righe è un errore", async () => {
        from.mockImplementation(() => queryBuilder(NONE));
        await expect(
            reorderSchedulesInLevel("t1", [{ id: "s1", display_order: 0, priority_level: "medium" }])
        ).rejects.toThrow(/permess/i);
    });
});
