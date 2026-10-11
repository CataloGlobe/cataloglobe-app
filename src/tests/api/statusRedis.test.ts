import { beforeEach, describe, expect, it, vi } from "vitest";
import {
    bucketFromCounts,
    historyKey,
    isHistoryFresh,
    lastUtcDays,
    readUptime,
    uptimeKey
} from "../../../api/_lib/statusRedis";

describe("bucketFromCounts", () => {
    it("peggiore del giorno: un solo down rende il giorno down", () => {
        expect(bucketFromCounts("2026-10-01", { up: "700", down: "1" })).toEqual({
            date: "2026-10-01",
            worst: "down",
            checkCount: 701
        });
    });

    it("degraded senza down → degraded", () => {
        expect(bucketFromCounts("2026-10-01", { up: 10, degraded: 2 }).worst).toBe("degraded");
    });

    it("chiave assente (null) → unknown con zero controlli", () => {
        expect(bucketFromCounts("2026-10-01", null)).toEqual({
            date: "2026-10-01",
            worst: "unknown",
            checkCount: 0
        });
    });
});

describe("lastUtcDays", () => {
    it("90 giorni dal più vecchio, l'ultimo è oggi (UTC)", () => {
        const days = lastUtcDays(new Date("2026-10-01T23:30:00Z"), 90);
        expect(days).toHaveLength(90);
        expect(days[89]).toBe("2026-10-01");
        expect(days[0]).toBe("2026-07-04");
    });
});

// Redis finto: conta i comandi, come li conta Upstash (anche dentro una pipeline).
const store = new Map<string, unknown>();
let commands = 0;
vi.mock("../../../api/_lib/redis", () => ({
    getEnvNamespace: () => "test",
    getRedis: () => ({
        pipeline: () => {
            const ops: Array<() => unknown> = [];
            const pipe = {
                get: (k: string) => (ops.push(() => store.get(k) ?? null), pipe),
                hgetall: (k: string) => (ops.push(() => store.get(k) ?? null), pipe),
                exec: async () => {
                    commands += ops.length;
                    return ops.map(op => op());
                }
            };
            return pipe;
        },
        set: async (k: string, v: unknown) => {
            commands += 1;
            store.set(k, JSON.parse(JSON.stringify(v)));
        }
    })
}));

describe("readUptime", () => {
    const now = new Date("2026-10-11T10:00:00Z");

    beforeEach(() => {
        store.clear();
        commands = 0;
        store.set(uptimeKey("database", "2026-10-11"), { up: "10" });
        store.set(uptimeKey("database", "2026-10-10"), { up: "700", down: "2" });
    });

    it("prima lettura del giorno: ricalcola i giorni chiusi e salva il riepilogo", async () => {
        const out = await readUptime(now, 90);
        expect(out.database).toHaveLength(90);
        expect(out.database[89]).toEqual({ date: "2026-10-11", worst: "up", checkCount: 10 });
        expect(out.database[88]).toEqual({ date: "2026-10-10", worst: "down", checkCount: 702 });
        expect(out.database[0].worst).toBe("unknown");
        // 5 (riepilogo + oggi) + 4 × 89 (giorni chiusi) + 1 (SET del riepilogo)
        expect(commands).toBe(5 + 4 * 89 + 1);
        expect(store.get(historyKey())).toMatchObject({ through: "2026-10-10" });
    });

    it("letture successive: 5 comandi, stesso risultato", async () => {
        const first = await readUptime(now, 90);
        commands = 0;
        store.set(uptimeKey("database", "2026-10-11"), { up: "11" });
        const second = await readUptime(now, 90);
        expect(commands).toBe(5);
        expect(second.database.slice(0, 89)).toEqual(first.database.slice(0, 89));
        expect(second.database[89].checkCount).toBe(11);
    });

    it("giorno nuovo: il riepilogo di ieri non vale più e si ricalcola", async () => {
        await readUptime(now, 90);
        commands = 0;
        const out = await readUptime(new Date("2026-10-12T00:05:00Z"), 90);
        expect(commands).toBe(5 + 4 * 89 + 1);
        expect(out.database[88]).toEqual({ date: "2026-10-11", worst: "up", checkCount: 10 });
        expect(store.get(historyKey())).toMatchObject({ through: "2026-10-11" });
    });
});

describe("isHistoryFresh", () => {
    it("riepilogo senza tutti i servizi → da ricalcolare", () => {
        expect(isHistoryFresh({ through: "2026-10-10", days: {} } as never, "2026-10-10")).toBe(false);
    });
});
