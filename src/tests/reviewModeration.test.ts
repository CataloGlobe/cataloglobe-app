import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Review } from "@/types/database";

const from = vi.fn();

vi.mock("@/services/supabase/client", () => ({
    supabase: { from: (...args: unknown[]) => from(...args) }
}));

import { countPendingReviews, updateReviewStatus } from "@/services/supabase/reviews";
import { queueTitle, rowActions, splitByStatus, waitingDays } from "@/pages/Dashboard/Reviews/reviewModeration";

/** Builder PostgREST finto che registra le chiamate e si risolve con `result`. */
function builder(result: { data?: unknown; count?: number | null; error: unknown }) {
    const calls: [string, unknown[]][] = [];
    const b: Record<string, unknown> = { calls };
    for (const method of ["select", "update", "eq", "in"]) {
        b[method] = (...args: unknown[]) => {
            calls.push([method, args]);
            return b;
        };
    }
    b.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve);
    return b as Record<string, unknown> & { calls: [string, unknown[]][] };
}

function review(id: string, status: Review["status"], createdAt: string): Review {
    return {
        id,
        tenant_id: "t1",
        activity_id: "a1",
        rating: 4,
        rating_category: "positive",
        comment: null,
        source: "public_form",
        status,
        session_id: null,
        created_at: createdAt
    } as Review;
}

beforeEach(() => from.mockReset());

describe("updateReviewStatus", () => {
    it("scrive solo status, filtrato per id e azienda", async () => {
        const b = builder({ data: [{ id: "r1" }], error: null });
        from.mockReturnValue(b);
        await updateReviewStatus("r1", "t1", "approved");
        expect(from).toHaveBeenCalledWith("reviews");
        expect(b.calls).toContainEqual(["update", [{ status: "approved" }]]);
        expect(b.calls).toContainEqual(["eq", ["id", "r1"]]);
        expect(b.calls).toContainEqual(["eq", ["tenant_id", "t1"]]);
    });

    it("lancia a 0 righe invece di risolvere in silenzio", async () => {
        from.mockReturnValue(builder({ data: [], error: null }));
        await expect(updateReviewStatus("r1", "t1", "hidden")).rejects.toThrow();
    });

    it("rilancia l'errore del server", async () => {
        from.mockReturnValue(builder({ data: null, error: { code: "42501", message: "permission denied" } }));
        await expect(updateReviewStatus("r1", "t1", "hidden")).rejects.toMatchObject({ code: "42501" });
    });
});

describe("countPendingReviews", () => {
    it("tutte le sedi: nessun filtro di sede", async () => {
        const b = builder({ count: 3, error: null });
        from.mockReturnValue(b);
        await expect(countPendingReviews("t1", null)).resolves.toBe(3);
        expect(b.calls).toContainEqual(["eq", ["status", "pending"]]);
        expect(b.calls.some(([m]) => m === "in")).toBe(false);
    });

    it("sedi assegnate: filtra, e senza sedi non chiede niente", async () => {
        const b = builder({ count: 1, error: null });
        from.mockReturnValue(b);
        await expect(countPendingReviews("t1", ["a1"])).resolves.toBe(1);
        expect(b.calls).toContainEqual(["in", ["activity_id", ["a1"]]]);
        from.mockReset();
        await expect(countPendingReviews("t1", [])).resolves.toBe(0);
        expect(from).not.toHaveBeenCalled();
    });
});

describe("coda di moderazione", () => {
    const now = new Date("2026-09-23T10:00:00.000Z").getTime();

    it("giorni interi d'attesa", () => {
        expect(waitingDays("2026-09-16T10:00:00.000Z", now)).toBe(7);
        expect(waitingDays("2026-09-22T11:00:00.000Z", now)).toBe(0);
        expect(waitingDays("2026-09-24T10:00:00.000Z", now)).toBe(0);
    });

    it("titolo: una, più d'una, oggi", () => {
        expect(queueTitle(1, 23)).toBe("1 recensione in attesa da 23 giorni");
        expect(queueTitle(2, 7)).toBe("2 recensioni in attesa, la prima da 7 giorni");
        expect(queueTitle(1, 1)).toBe("1 recensione in attesa da 1 giorno");
        expect(queueTitle(3, 0)).toBe("3 recensioni in attesa, la prima da oggi");
    });

    it("le in attesa dalla più vecchia; le altre restano nell'ordine", () => {
        const { pending, others } = splitByStatus([
            review("a", "pending", "2026-09-21T00:00:00Z"),
            review("b", "approved", "2026-09-20T00:00:00Z"),
            review("c", "pending", "2026-09-16T00:00:00Z"),
            review("d", "hidden", "2026-09-15T00:00:00Z")
        ]);
        expect(pending.map(r => r.id)).toEqual(["c", "a"]);
        expect(others.map(r => r.id)).toEqual(["b", "d"]);
    });

    it("azioni per stato: Elimina solo sulle nascoste, e solo con reviews.delete", () => {
        const all = { canModerate: true, canDelete: true };
        expect(rowActions("pending", all)).toEqual(["publish", "hide"]);
        expect(rowActions("approved", all)).toEqual(["hide"]);
        expect(rowActions("hidden", all)).toEqual(["publish", "delete"]);
        expect(rowActions("hidden", { canModerate: true, canDelete: false })).toEqual(["publish"]);
        expect(rowActions("hidden", { canModerate: false, canDelete: true })).toEqual(["delete"]);
    });

    it("senza reviews.moderate nessun comando reversibile", () => {
        const none = { canModerate: false, canDelete: false };
        expect(rowActions("pending", none)).toEqual([]);
        expect(rowActions("approved", none)).toEqual([]);
        expect(rowActions("hidden", none)).toEqual([]);
    });
});
