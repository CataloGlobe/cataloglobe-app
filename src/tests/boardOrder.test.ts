import { describe, expect, it } from "vitest";
import { boardOrder } from "@/pages/Dashboard/Orders/boardOrder";
import type { V2OrderWithItems } from "@/types/orders";

function order(id: string, status: V2OrderWithItems["status"], submitted_at: string): V2OrderWithItems {
    return { id, status, submitted_at } as V2OrderWithItems;
}

describe("boardOrder", () => {
    it("Nuove, poi In lavorazione, poi Pronte; in ogni corsia la più nuova in cima", () => {
        const orders = [
            order("p1", "ready", "2026-10-09T12:00:00Z"),
            order("n1", "submitted", "2026-10-09T12:00:00Z"),
            order("l1", "acknowledged", "2026-10-09T11:00:00Z"),
            order("n2", "submitted", "2026-10-09T12:30:00Z"),
            order("l2", "acknowledged", "2026-10-09T11:30:00Z")
        ];
        expect(boardOrder(orders).map(o => o.id)).toEqual(["n2", "n1", "l2", "l1", "p1"]);
    });

    it("servite e annullate non stanno sulla board", () => {
        const orders = [order("s", "delivered", "2026-10-09T12:00:00Z"), order("a", "cancelled", "2026-10-09T12:00:00Z")];
        expect(boardOrder(orders)).toEqual([]);
    });
});
