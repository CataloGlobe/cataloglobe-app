import { beforeEach, describe, expect, it, vi } from "vitest";

// Multi menù: per `menu` e `style` il quando lo scrive save_schedule_model. Se
// updateRule scrivesse time_mode, giorni o ore, il trigger
// schedule_slots_from_legacy rifarebbe le fasce prima della RPC.
const updates: Record<string, unknown>[] = [];

function queryBuilder() {
    const builder: Record<string, unknown> = {};
    for (const method of ["select", "eq", "in", "order", "limit", "delete"]) builder[method] = () => builder;
    builder.update = (payload: Record<string, unknown>) => (updates.push(payload), builder);
    builder.maybeSingle = () => Promise.resolve({ data: null, error: null });
    builder.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: [{ id: "s1" }], error: null }).then(resolve);
    return builder;
}

vi.mock("@/services/supabase/client", () => ({ supabase: { from: () => queryBuilder() } }));
vi.mock("@services/publicCatalog/revalidatePublicCatalog", () => ({ revalidatePublicCatalogForTenant: vi.fn() }));
vi.mock("@utils/priorityUtils", () => import("@/utils/priorityUtils"));
vi.mock("@utils/scheduleDays", () => import("@/utils/scheduleDays"));

import { updateRule } from "@/services/supabase/layoutScheduling";

const rule = {
    scheduleId: "s1",
    tenantId: "t1",
    ruleType: "menu" as const,
    applyToAll: false,
    activityIds: ["a1"],
    groupIds: [],
    enabled: true,
    timeMode: "window" as const,
    daysOfWeek: [1, 2],
    timeFrom: "12:00",
    timeTo: "15:00",
    startAt: null,
    endAt: "2026-12-31T22:59:59.999Z"
};
const TIME = ["time_mode", "days_of_week", "time_from", "time_to"];

beforeEach(() => void (updates.length = 0));

describe("updateRule e il quando", () => {
    it("con keepTime non scrive le colonne che rifanno le fasce, il periodo sì", async () => {
        await updateRule({ ...rule, keepTime: true });
        const all = Object.assign({}, ...updates);
        for (const k of TIME) expect(all).not.toHaveProperty(k);
        expect(all).toMatchObject({ enabled: true, end_at: rule.endAt });
    });

    it("senza keepTime le scrive come oggi", async () => {
        await updateRule(rule);
        const all = Object.assign({}, ...updates);
        expect(all).toMatchObject({ time_mode: "window", time_from: "12:00", time_to: "15:00" });
    });
});
