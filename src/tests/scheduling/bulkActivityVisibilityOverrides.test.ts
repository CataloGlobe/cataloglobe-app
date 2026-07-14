import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock del client Supabase: registra ogni query builder creata da `from()`
// (tabella + catena di operazioni) e risponde con la prossima response in coda.
// Ogni chiamata a `from()` = una query verso il DB → il conteggio di `calls`
// è la verifica anti-N+1.
type RecordedOp = { op: string; args: unknown[] };
type RecordedQuery = { table: string; ops: RecordedOp[] };
type MockResponse = { data?: unknown; error?: unknown };

const h = vi.hoisted(() => ({
    calls: [] as RecordedQuery[],
    responses: [] as MockResponse[]
}));

vi.mock("@/services/supabase/client", () => ({
    supabase: {
        from(table: string) {
            const call: RecordedQuery = { table, ops: [] };
            h.calls.push(call);
            const resp = h.responses.shift() ?? { data: null, error: null };
            const builder: Record<string, unknown> = {};
            for (const op of ["select", "insert", "update", "delete", "eq", "in", "is", "not", "maybeSingle"]) {
                builder[op] = (...args: unknown[]) => {
                    call.ops.push({ op, args });
                    return builder;
                };
            }
            builder.then = (resolve: (value: { data: unknown; error: unknown }) => unknown) =>
                resolve({ data: resp.data ?? null, error: resp.error ?? null });
            return builder;
        }
    }
}));

import { bulkUpdateActivityProductVisibility } from "@/services/supabase/activeCatalog";

const ACTIVITY = "act-1";

function opsOf(call: RecordedQuery, op: string): RecordedOp[] {
    return call.ops.filter(o => o.op === op);
}

function hasFilter(call: RecordedQuery, op: string, column: string): RecordedOp | undefined {
    return call.ops.find(o => o.op === op && o.args[0] === column);
}

beforeEach(() => {
    h.calls.length = 0;
    h.responses.length = 0;
});

describe("bulkUpdateActivityProductVisibility — batch hide/disable", () => {
    it("hidden su prodotti tutti nuovi → 1 SELECT + 1 INSERT batch, nessun UPDATE", async () => {
        const ids = ["p1", "p2", "p3"];
        h.responses.push({ data: [] }); // select: nessuna riga esistente

        await bulkUpdateActivityProductVisibility(ACTIVITY, ids, "hidden");

        expect(h.calls).toHaveLength(2);
        expect(h.calls.every(c => c.table === "activity_product_overrides")).toBe(true);

        const [sel, ins] = h.calls;
        expect(opsOf(sel, "select")).toHaveLength(1);

        const insertOp = opsOf(ins, "insert")[0];
        expect(insertOp).toBeDefined();
        const rows = insertOp.args[0] as Array<Record<string, unknown>>;
        expect(rows).toHaveLength(3);
        expect(rows.map(r => r.product_id)).toEqual(ids);
        for (const row of rows) {
            expect(row.activity_id).toBe(ACTIVITY);
            expect(row.visible_override).toBe(false);
            expect(row.mode).toBe("hide");
            expect(row.id).toBeTruthy();
        }
    });

    it("unavailable su mix esistenti/nuovi → UPDATE batch sugli esistenti + INSERT batch sui nuovi (mode='disable')", async () => {
        const ids = ["p1", "p2", "p3"];
        h.responses.push({ data: [{ product_id: "p1" }] }); // solo p1 ha già una riga

        await bulkUpdateActivityProductVisibility(ACTIVITY, ids, "unavailable");

        expect(h.calls).toHaveLength(3); // select + update + insert

        const upd = h.calls[1];
        const updPayload = opsOf(upd, "update")[0].args[0] as Record<string, unknown>;
        expect(updPayload.visible_override).toBe(false);
        expect(updPayload.mode).toBe("disable");
        // price_override MAI nel payload update → preservato sulle righe esistenti.
        expect("price_override" in updPayload).toBe(false);
        expect(hasFilter(upd, "eq", "activity_id")?.args[1]).toBe(ACTIVITY);
        expect(hasFilter(upd, "in", "product_id")?.args[1]).toEqual(["p1"]);

        const ins = h.calls[2];
        const rows = opsOf(ins, "insert")[0].args[0] as Array<Record<string, unknown>>;
        expect(rows.map(r => r.product_id)).toEqual(["p2", "p3"]);
        expect(rows.every(r => r.mode === "disable")).toBe(true);
    });

    it("tutti già esistenti → nessun INSERT (2 query totali)", async () => {
        h.responses.push({ data: [{ product_id: "p1" }, { product_id: "p2" }] });

        await bulkUpdateActivityProductVisibility(ACTIVITY, ["p1", "p2"], "hidden");

        expect(h.calls).toHaveLength(2); // select + update
        expect(h.calls.some(c => opsOf(c, "insert").length > 0)).toBe(false);
    });
});

describe("bulkUpdateActivityProductVisibility — batch restore visible (preserve-price)", () => {
    it("mix con/senza price_override → DELETE filtrato price_override IS NULL + UPDATE filtrato IS NOT NULL, 2 query costanti", async () => {
        // Il mix è gestito lato SQL dai filtri: il DELETE colpisce solo le righe
        // senza price_override, l'UPDATE solo quelle con. Nessun SELECT intermedio.
        const ids = ["p-senza-prezzo", "p-con-prezzo", "p-altro-con-prezzo"];

        await bulkUpdateActivityProductVisibility(ACTIVITY, ids, "visible");

        expect(h.calls).toHaveLength(2);

        const [del, upd] = h.calls;
        expect(opsOf(del, "delete")).toHaveLength(1);
        expect(hasFilter(del, "eq", "activity_id")?.args[1]).toBe(ACTIVITY);
        expect(hasFilter(del, "in", "product_id")?.args[1]).toEqual(ids);
        expect(hasFilter(del, "is", "price_override")?.args[1]).toBeNull();

        const updPayload = opsOf(upd, "update")[0].args[0] as Record<string, unknown>;
        expect(updPayload.visible_override).toBeNull();
        expect(updPayload.mode).toBeNull();
        // price_override intatto: né nel payload né azzerato.
        expect("price_override" in updPayload).toBe(false);
        expect(hasFilter(upd, "eq", "activity_id")?.args[1]).toBe(ACTIVITY);
        expect(hasFilter(upd, "in", "product_id")?.args[1]).toEqual(ids);
        const notOp = hasFilter(upd, "not", "price_override");
        expect(notOp?.args[1]).toBe("is");
        expect(notOp?.args[2]).toBeNull();
    });

    it("restore visible con molti prodotti → sempre 2 query (no N+1)", async () => {
        const ids = Array.from({ length: 50 }, (_, i) => `p-${i}`);

        await bulkUpdateActivityProductVisibility(ACTIVITY, ids, "visible");

        expect(h.calls).toHaveLength(2);
    });
});

describe("bulkUpdateActivityProductVisibility — scoping e guardie", () => {
    it("ogni query è vincolata ad activity_id + product_id IN (…): nessuna riga estranea toccata", async () => {
        const ids = ["p1", "p2"];
        h.responses.push({ data: [{ product_id: "p1" }] });

        await bulkUpdateActivityProductVisibility(ACTIVITY, ids, "hidden");

        for (const call of h.calls) {
            const isInsert = opsOf(call, "insert").length > 0;
            if (isInsert) {
                const rows = opsOf(call, "insert")[0].args[0] as Array<Record<string, unknown>>;
                for (const row of rows) {
                    expect(row.activity_id).toBe(ACTIVITY);
                    expect(ids).toContain(row.product_id);
                }
            } else {
                expect(hasFilter(call, "eq", "activity_id")?.args[1]).toBe(ACTIVITY);
                const inOp = hasFilter(call, "in", "product_id");
                expect(inOp).toBeDefined();
                for (const pid of inOp?.args[1] as string[]) {
                    expect(ids).toContain(pid);
                }
            }
        }
    });

    it("hide con molti prodotti → massimo 3 query (no N+1)", async () => {
        const ids = Array.from({ length: 50 }, (_, i) => `p-${i}`);
        h.responses.push({ data: ids.slice(0, 25).map(id => ({ product_id: id })) });

        await bulkUpdateActivityProductVisibility(ACTIVITY, ids, "hidden");

        expect(h.calls).toHaveLength(3);
    });

    it("productIds vuoto → zero query", async () => {
        await bulkUpdateActivityProductVisibility(ACTIVITY, [], "hidden");
        expect(h.calls).toHaveLength(0);
    });

    it("errore Supabase → throw (select del path hide)", async () => {
        h.responses.push({ error: { code: "XX000", message: "boom" } });

        await expect(
            bulkUpdateActivityProductVisibility(ACTIVITY, ["p1"], "hidden")
        ).rejects.toMatchObject({ code: "XX000" });
    });

    it("errore Supabase → throw (delete del path visible)", async () => {
        h.responses.push({ error: { code: "XX000", message: "boom" } });

        await expect(
            bulkUpdateActivityProductVisibility(ACTIVITY, ["p1"], "visible")
        ).rejects.toMatchObject({ code: "XX000" });
    });
});
