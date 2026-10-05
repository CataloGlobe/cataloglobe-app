import { describe, expect, it } from "vitest";
import { GEA_MEMORY_MINUTES, GEA_MEMORY_TURNS } from "./crmGea.ts";
import { recentTurns } from "./crmGeaJob.ts";

type Call = [string, ...unknown[]];

/** Un finto client: registra la catena di filtri e risponde con `result`. */
function fakeSupabase(result: { data: unknown; error: unknown }) {
    const calls: Call[] = [];
    const builder = new Proxy(
        {},
        {
            get(_target, prop: string) {
                if (prop === "then") return (resolve: (v: unknown) => void) => resolve(result);
                return (...args: unknown[]) => {
                    calls.push([prop, ...args]);
                    return builder;
                };
            }
        }
    );
    return { client: { from: (table: string) => (calls.push(["from", table]), builder) }, calls };
}

const NOW = new Date("2026-10-05T10:00:00Z");

describe("recentTurns", () => {
    it("ultimi scambi della stessa persona, dal più vecchio, senza il messaggio in corso", async () => {
        const { client, calls } = fakeSupabase({
            data: [
                { id: "c", body: "terza", reply: "r3" },
                { id: "b", body: "seconda", reply: "r2" }
            ],
            error: null
        });
        const turns = await recentTurns(client, "u1", "now-id", NOW);
        expect(turns).toEqual([
            { asked: "seconda", replied: "r2" },
            { asked: "terza", replied: "r3" }
        ]);
        expect(calls).toContainEqual(["from", "crm_gea_inbox"]);
        expect(calls).toContainEqual(["eq", "user_id", "u1"]);
        expect(calls).toContainEqual(["neq", "id", "now-id"]);
        expect(calls).toContainEqual(["gte", "created_at", new Date(NOW.getTime() - GEA_MEMORY_MINUTES * 60_000).toISOString()]);
        expect(calls).toContainEqual(["order", "created_at", { ascending: false }]);
        expect(calls).toContainEqual(["limit", GEA_MEMORY_TURNS]);
    });

    it("errore o niente dati: nessuna memoria, Gea risponde lo stesso", async () => {
        expect(await recentTurns(fakeSupabase({ data: null, error: { code: "42501" } }).client, "u1", "x", NOW)).toEqual([]);
        expect(await recentTurns(fakeSupabase({ data: null, error: null }).client, "u1", "x", NOW)).toEqual([]);
    });
});
