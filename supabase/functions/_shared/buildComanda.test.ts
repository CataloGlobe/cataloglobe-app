import { describe, it, expect } from "vitest";
import { buildComanda } from "./buildComanda";

// Fake minimale del client supabase-js: risponde per tabella.
function fakeClient(responses: {
    orders: { data: unknown; error: { message: string } | null };
    profiles?: { data: unknown; error: { message: string } | null };
}) {
    const selects: Record<string, string> = {};
    const client = {
        from(table: "orders" | "profiles") {
            const chain = {
                select(cols: string) {
                    selects[table] = cols;
                    return chain;
                },
                eq() {
                    return chain;
                },
                async maybeSingle() {
                    return table === "orders"
                        ? responses.orders
                        : (responses.profiles ?? { data: null, error: null });
                }
            };
            return chain;
        }
    };
    return { client: client as never, selects };
}

const ORDER_ROW = {
    id: "0a1b2c3d-4e5f-6071-8293-a4b5c6d7e8f9",
    tenant_id: "t1",
    activity_id: "a1",
    submitted_at: "2026-09-07T19:15:00Z",
    cancelled_at: "2026-09-07T19:20:00Z",
    cancellation_reason: "Ingredienti finiti",
    notes: "  ",
    customer_name_snapshot: "Marco",
    created_by_user_id: null,
    is_rectification: false,
    activities: { name: "Sede Centro" },
    tables: { label: "12", table_zones: { name: "Sala" } },
    order_items: [
        {
            id: "i2",
            quantity: 1,
            product_name_snapshot: "Acqua",
            options_snapshot: {},
            item_notes: null,
            cancelled_at: null,
            created_at: "2026-09-07T19:15:02Z"
        },
        {
            id: "i1",
            quantity: 2,
            product_name_snapshot: "Pizza",
            options_snapshot: {
                primary_option: { value_id: "v1", value_name: "Grande" },
                addons: [{ value_id: "v2", value_name: "Bufala" }, { value_id: "v3", value_name: "" }]
            },
            item_notes: "senza basilico",
            cancelled_at: null,
            created_at: "2026-09-07T19:15:01Z"
        },
        {
            id: "i3",
            quantity: 1,
            product_name_snapshot: "Annullato",
            options_snapshot: {},
            item_notes: null,
            cancelled_at: "2026-09-07T19:20:00Z",
            created_at: "2026-09-07T19:15:03Z"
        }
    ]
};

describe("buildComanda", () => {
    it("mappa l'ordine in ComandaPayload, filtra le righe annullate, ordina per created_at", async () => {
        const { client, selects } = fakeClient({ orders: { data: ORDER_ROW, error: null } });
        const res = await buildComanda(client, ORDER_ROW.id);
        expect(res.kind).toBe("ok");
        if (res.kind !== "ok") return;

        expect(selects.orders).toContain("order_items(");
        expect(selects.orders).toContain("cancelled_at");
        expect(selects.orders).toContain("cancellation_reason");
        expect(selects.orders).toContain("tables(label, table_zones(name))");

        expect(res.payload.cancelled_at).toBe("2026-09-07T19:20:00Z");
        expect(res.payload.cancellation_reason).toBe("Ingredienti finiti");

        expect(res.tenant_id).toBe("t1");
        expect(res.activity_id).toBe("a1");
        expect(res.activity_name).toBe("Sede Centro");
        expect(res.payload.table_label).toBe("12");
        expect(res.payload.table_zone).toBe("Sala");
        expect(res.payload.operator_label).toBeNull();
        expect(res.payload.customer_name).toBe("Marco");
        expect(res.payload.notes).toBeNull(); // whitespace → null
        expect(res.payload.items.map(i => i.product_name)).toEqual(["Pizza", "Acqua"]);
        expect(res.payload.items[0]).toEqual({
            quantity: 2,
            product_name: "Pizza",
            primary_option: "Grande",
            addons: ["Bufala"], // addon con value_name vuoto scartato
            item_notes: "senza basilico"
        });
    });

    it("ordine staff: operator_label da profiles, customer_name omesso", async () => {
        const { client } = fakeClient({
            orders: { data: { ...ORDER_ROW, created_by_user_id: "u1" }, error: null },
            profiles: { data: { first_name: "Giulia", last_name: "Rossi" }, error: null }
        });
        const res = await buildComanda(client, ORDER_ROW.id);
        if (res.kind !== "ok") throw new Error(res.kind);
        expect(res.payload.operator_label).toBe("Giulia Rossi");
        expect(res.payload.customer_name).toBeNull();
    });

    it("ordine staff senza profilo → 'Staff'", async () => {
        const { client } = fakeClient({
            orders: { data: { ...ORDER_ROW, created_by_user_id: "u1" }, error: null },
            profiles: { data: null, error: null }
        });
        const res = await buildComanda(client, ORDER_ROW.id);
        if (res.kind !== "ok") throw new Error(res.kind);
        expect(res.payload.operator_label).toBe("Staff");
    });

    it("tavolo senza zona → table_zone null", async () => {
        const { client } = fakeClient({
            orders: { data: { ...ORDER_ROW, tables: { label: "3", table_zones: null } }, error: null }
        });
        const res = await buildComanda(client, ORDER_ROW.id);
        if (res.kind !== "ok") throw new Error(res.kind);
        expect(res.payload.table_zone).toBeNull();
    });

    it("ordine assente → not_found; errore DB → db_error", async () => {
        const nf = await buildComanda(fakeClient({ orders: { data: null, error: null } }).client, "x");
        expect(nf.kind).toBe("not_found");
        const err = await buildComanda(
            fakeClient({ orders: { data: null, error: { message: "boom" } } }).client,
            "x"
        );
        expect(err).toEqual({ kind: "db_error", message: "boom" });
    });
});
