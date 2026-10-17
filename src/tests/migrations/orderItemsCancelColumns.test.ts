import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// order_items.cancelled_at / cancel_reason solo via cancel_order_item_atomic
// (mig 20261016200000). Letto dal testo: la migrazione non gira nei test
// unitari; il comportamento sul database lo prova
// supabase/tests/order_items_cancel_columns_guard.test.sql (staging).

const sql = readFileSync("supabase/migrations/20261016200000_order_items_cancel_columns_revoke.sql", "utf8")
    .split("\n")
    .filter(line => !line.trim().startsWith("--"))
    .join("\n");

function sourceFiles(dir: string): string[] {
    return readdirSync(dir).flatMap(name => {
        const full = path.join(dir, name);
        if (statSync(full).isDirectory()) return name === "tests" ? [] : sourceFiles(full);
        return /\.(ts|tsx)$/.test(name) ? [full] : [];
    });
}

describe("order_items: colonne di annullamento solo via RPC", () => {
    it("toglie l'UPDATE di tabella ad anon e authenticated (il REVOKE di colonna da solo non basta)", () => {
        expect(sql).toMatch(/REVOKE UPDATE ON TABLE public\.order_items FROM anon, authenticated;/);
    });

    it("ridà ad authenticated l'UPDATE sulle altre colonne, escluse le due", () => {
        expect(sql).toMatch(/column_name NOT IN \('cancelled_at', 'cancel_reason'\)/);
        expect(sql).toMatch(/GRANT UPDATE \(%s\) ON TABLE public\.order_items TO authenticated/);
        expect(sql).not.toMatch(/TO anon/);
    });

    it("nessun file del frontend aggiorna order_items direttamente", () => {
        const offenders = sourceFiles("src").filter(file => {
            const source = readFileSync(file, "utf8");
            return /from\(\s*["']order_items["']\s*\)[\s\S]{0,200}?\.(update|upsert)\(/.test(source);
        });
        expect(offenders).toEqual([]);
    });
});
