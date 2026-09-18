import { describe, it, expect } from "vitest";
import { buildIdempotencyKey } from "../../supabase/functions/_shared/idempotency";

const base = {
    tenantId: "T1",
    subscriptionId: "sub_1",
    currentPlan: "pro",
    currentSeats: 2,
    targetPlan: "pro",
    targetSeats: 2
};

describe("buildIdempotencyKey — billing interval segments (passo 4a)", () => {
    it("without intervals the key is the legacy plan×seats shape", () => {
        expect(buildIdempotencyKey({ operation: "upgrade", ...base, targetSeats: 4 }, "r1"))
            .toBe("cg:upgrade:t1:sub_1:prox2-to-prox4:r1");
    });

    it("interval segments appear only when present", () => {
        expect(buildIdempotencyKey({ operation: "interval-up", ...base, currentInterval: "month", targetInterval: "year" }, "r1"))
            .toBe("cg:interval-up:t1:sub_1:prox2xmonth-to-prox2xyear:r1");
    });

    it("null intervals behave like omitted ones (legacy callers unchanged)", () => {
        expect(buildIdempotencyKey({ operation: "seats", ...base, currentInterval: null, targetInterval: null }, "r1"))
            .toBe(buildIdempotencyKey({ operation: "seats", ...base }, "r1"));
    });

    it("interval-down ops (passo 4b) carry the year→month segments", () => {
        const down = { ...base, currentInterval: "year" as const, targetInterval: "month" as const };
        expect(buildIdempotencyKey({ operation: "interval-down-create", ...down }, "r1"))
            .toBe("cg:interval-down-create:t1:sub_1:prox2xyear-to-prox2xmonth:r1");
        expect(buildIdempotencyKey({ operation: "interval-down-update", ...down }, "r1"))
            .toBe("cg:interval-down-update:t1:sub_1:prox2xyear-to-prox2xmonth:r1");
        expect(buildIdempotencyKey({ operation: "interval-down-trial", ...down }, "r1"))
            .toBe("cg:interval-down-trial:t1:sub_1:prox2xyear-to-prox2xmonth:r1");
    });

    it("create and update of the deferred schedule never share a key", () => {
        const down = { ...base, currentInterval: "year" as const, targetInterval: "month" as const };
        expect(buildIdempotencyKey({ operation: "interval-down-create", ...down }, "r1"))
            .not.toBe(buildIdempotencyKey({ operation: "interval-down-update", ...down }, "r1"));
    });

    it("the two directions on the same plan×seats produce different keys", () => {
        const up = buildIdempotencyKey({ operation: "interval-up", ...base, currentInterval: "month", targetInterval: "year" }, "r1");
        const down = buildIdempotencyKey({ operation: "interval-up", ...base, currentInterval: "year", targetInterval: "month" }, "r1");
        expect(up).not.toBe(down);
    });
});
