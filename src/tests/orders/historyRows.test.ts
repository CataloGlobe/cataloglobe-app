import { describe, expect, it } from "vitest";
import type { V2OrderWithItems } from "@/types/orders";
import { annotateHistory, filterHistory } from "@/pages/Dashboard/Orders/historyRows";

function order(partial: Partial<V2OrderWithItems> & { id: string }): V2OrderWithItems {
    return {
        status: "delivered",
        is_rectification: false,
        parent_order_id: null,
        total_amount: 10,
        created_at: "2026-09-13T12:00:00Z",
        updated_at: "2026-09-13T12:00:00Z",
        ...partial
    } as V2OrderWithItems;
}

describe("annotateHistory", () => {
    it("aggancia gli storni al padre e ne dice il netto", () => {
        const rows = annotateHistory([
            order({ id: "p", total_amount: 20 }),
            order({ id: "s", is_rectification: true, parent_order_id: "p", total_amount: 5 })
        ]);
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({ id: "p", rectified: true, netTotal: 15 });
        expect(rows[0].storni?.map(s => s.id)).toEqual(["s"]);
    });

    it("uno storno senza padre nell'elenco resta una riga a sé", () => {
        const rows = annotateHistory([order({ id: "s", is_rectification: true, parent_order_id: "ieri" })]);
        expect(rows.map(r => r.id)).toEqual(["s"]);
    });

    it("il più recente in cima, contando gli storni del padre", () => {
        const rows = annotateHistory([
            order({ id: "vecchio", updated_at: "2026-09-13T10:00:00Z" }),
            order({ id: "nuovo", updated_at: "2026-09-13T11:00:00Z" }),
            order({
                id: "storno",
                is_rectification: true,
                parent_order_id: "vecchio",
                created_at: "2026-09-13T12:00:00Z",
                updated_at: "2026-09-13T12:00:00Z"
            })
        ]);
        expect(rows.map(r => r.id)).toEqual(["vecchio", "nuovo"]);
    });
});

describe("filterHistory", () => {
    const rows = annotateHistory([
        order({ id: "servito" }),
        order({ id: "annullato", status: "cancelled" }),
        order({ id: "orfano", is_rectification: true, parent_order_id: "ieri" })
    ]);

    it("«Serviti» non conta gli storni orfani", () => {
        expect(filterHistory(rows, "delivered").map(r => r.id)).toEqual(["servito"]);
    });

    it("«Annullati» e «Tutti»", () => {
        expect(filterHistory(rows, "cancelled").map(r => r.id)).toEqual(["annullato"]);
        expect(filterHistory(rows, "all")).toHaveLength(3);
    });
});
