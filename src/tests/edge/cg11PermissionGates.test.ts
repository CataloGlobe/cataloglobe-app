import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// CG-11: close-table, toggle-product-availability e generate-table-qrs
// avevano solo il controllo di appartenenza al tenant. Ora chiedono anche il
// permesso sulla sede, con `hasActivityPermission` (fail-closed, provato in
// `supabase/functions/_shared/membershipCheck.test.ts`).
// Letto dal testo: gli handler sono moduli Deno che il progetto TS dell'app
// non compila. Si controlla il permesso e che il controllo venga prima del
// primo gesto che fa qualcosa (RPC o scrittura in service_role, lettura dei
// tavoli con i qr_token).

const GATES = [
    { fn: "close-table", permission: "tables.manage", activity: "tableFetch.row.activity_id", before: "close_table_with_resolution" },
    { fn: "toggle-product-availability", permission: "product_availability.write", activity: "body.activity_id", before: ".upsert(" },
    { fn: "generate-table-qrs", permission: "tables.manage", activity: "body.activity_id", before: "_fetchTables(supabaseService" }
] as const;

describe("CG-11: permesso sulla sede nelle edge dei tavoli e della disponibilità", () => {
    for (const g of GATES) {
        const source = readFileSync(`supabase/functions/${g.fn}/index.ts`, "utf8");
        // Il corpo dell'handler: le definizioni in testa al file non contano.
        const handler = source.slice(source.indexOf("serve("));

        it(`${g.fn}: chiede ${g.permission} sulla sede giusta`, () => {
            const call = new RegExp(
                `hasActivityPermission\\(\\s*supabaseUser,\\s*"${g.permission.replace(".", "\\.")}",\\s*${g.activity.replace(/[.()]/g, "\\$&")},`
            );
            expect(handler).toMatch(call);
        });

        it(`${g.fn}: il permesso viene controllato prima di agire, e senza permesso risponde 403`, () => {
            const gate = handler.indexOf("hasActivityPermission(");
            const action = handler.indexOf(g.before);
            expect(gate).toBeGreaterThan(-1);
            expect(action).toBeGreaterThan(gate);
            const afterGate = handler.slice(gate, gate + 600);
            expect(afterGate).toMatch(/if \(!can\w+\) \{\s*return jsonResponse\(403/);
        });
    }
});
