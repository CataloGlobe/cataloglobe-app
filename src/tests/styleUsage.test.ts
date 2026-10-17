import { beforeEach, describe, expect, it, vi } from "vitest";

// Ogni `from(table)` registra le chiamate e risponde con `rows[table]`.
type Call = { table: string; calls: unknown[][] };
const log: Call[] = [];
let rows: Record<string, unknown> = {};

function chain(table: string) {
    const entry: Call = { table, calls: [] };
    log.push(entry);
    const obj: object = new Proxy(
        {},
        {
            get(_, prop) {
                if (prop === "then") {
                    const isWrite = entry.calls.some(([m]) => m === "update" || m === "delete");
                    const result = { data: isWrite ? null : rows[table], error: null };
                    return (res: (v: unknown) => unknown) => Promise.resolve(result).then(res);
                }
                return (...args: unknown[]) => {
                    entry.calls.push([prop, ...args]);
                    return obj;
                };
            }
        }
    );
    return obj;
}

vi.mock("@/services/supabase/client", () => ({ supabase: { from: (t: string) => chain(t) } }));
vi.mock("@services/publicCatalog/revalidatePublicCatalog", () => ({ revalidatePublicCatalogForTenant: vi.fn() }));

import { countStyleUsage, deleteStyle } from "@/services/supabase/styles";

beforeEach(() => {
    log.length = 0;
    rows = {
        styles: { id: "vecchio", tenant_id: "t1", is_system: false },
        schedule_layout: [{ id: "l1" }],
        schedule_style: [{ id: "s1" }, { id: "s2" }]
    };
});

// Multi menù: uno stile si usa anche da una regola `style` (compito 2).
describe("uso di uno stile", () => {
    it("conta le regole layout e le regole style", async () => {
        await expect(countStyleUsage("vecchio", "t1")).resolves.toBe(3);
        expect(log.map(c => c.table).sort()).toEqual(["schedule_layout", "schedule_style"]);
    });

    it("eliminandolo, il sostituto entra in tutte e due", async () => {
        await deleteStyle("vecchio", "t1", "nuovo");
        const updated = log.filter(c => c.calls.some(([m]) => m === "update")).map(c => c.table);
        expect(updated.sort()).toEqual(["schedule_layout", "schedule_style"]);
        for (const c of log.filter(x => updated.includes(x.table) && x.calls.some(([m]) => m === "update")))
            expect(c.calls).toContainEqual(["update", { style_id: "nuovo" }]);
    });

    it("usato solo da una regola style e senza sostituto: non si elimina", async () => {
        rows.schedule_layout = [];
        await expect(deleteStyle("vecchio", "t1")).rejects.toThrow(/used in 2/);
        expect(log.some(c => c.table === "styles" && c.calls.some(([m]) => m === "delete"))).toBe(false);
    });
});
