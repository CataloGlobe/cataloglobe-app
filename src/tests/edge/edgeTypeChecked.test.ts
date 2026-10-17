import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import path from "path";

/**
 * Edge Functions già senza `// @ts-nocheck` (rimozione progressiva, task
 * «@ts-nocheck in Edge Functions»): `deno check` le controlla davvero, e
 * questo test impedisce che il commento torni. Si aggiunge una funzione
 * all'elenco solo dopo `deno check supabase/functions/<nome>/index.ts` verde.
 */

const ROOT = path.resolve(__dirname, "../../..");

const TYPE_CHECKED = [
    "acknowledge-order",
    "cancel-order-admin",
    "deliver-order",
    "mark-order-ready",
    "restore-order",
    "uncancel-to-acknowledged",
    "uncancel-to-submitted",
    "unready-order"
];

describe("Edge Functions controllate da deno check", () => {
    it.each(TYPE_CHECKED)("%s non ha @ts-nocheck", name => {
        const source = readFileSync(path.join(ROOT, "supabase/functions", name, "index.ts"), "utf8");
        expect(source).not.toMatch(/@ts-nocheck/);
    });
});
