import { describe, it, expect, vi, beforeEach } from "vitest";

const from = vi.fn();
const rpc = vi.fn();

vi.mock("@/services/supabase/client", () => ({
    supabase: {
        from: (...args: unknown[]) => from(...args),
        rpc: (...args: unknown[]) => rpc(...args)
    }
}));

import {
    getJobLanguageStates,
    isJobWaiting,
    translateNow
} from "@/services/supabase/translationJobs";
import { deleteTranslationsForEntity } from "@/services/supabase/translations";
import {
    earliestNextRunAt,
    sumWaiting,
    type TranslationCoverage
} from "@/services/supabase/tenantLanguages";

/** Builder PostgREST finto che registra le chiamate e si risolve con `result`. */
function builder(result: { data?: unknown; error: unknown }) {
    const calls: [string, unknown[]][] = [];
    const b: Record<string, unknown> = { calls };
    for (const method of ["select", "delete", "eq", "in"]) {
        b[method] = (...args: unknown[]) => {
            calls.push([method, args]);
            return b;
        };
    }
    b.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve);
    return b as Record<string, unknown> & { calls: [string, unknown[]][] };
}

const NOW = Date.parse("2026-10-12T10:00:00Z");

beforeEach(() => {
    from.mockReset();
    rpc.mockReset();
});

describe("isJobWaiting", () => {
    it("è in attesa solo un pending con run_after futuro", () => {
        expect(isJobWaiting({ status: "pending", run_after: "2026-10-12T10:05:00Z" }, NOW)).toBe(true);
        expect(isJobWaiting({ status: "pending", run_after: "2026-10-12T09:55:00Z" }, NOW)).toBe(false);
        expect(isJobWaiting({ status: "processing", run_after: "2026-10-12T10:05:00Z" }, NOW)).toBe(false);
    });

    it("senza run_after il pending è in corso, come prima della migration", () => {
        expect(isJobWaiting({ status: "pending" }, NOW)).toBe(false);
        expect(isJobWaiting({ status: "pending", run_after: null }, NOW)).toBe(false);
    });
});

describe("getJobLanguageStates", () => {
    it("divide le lingue fra in corso e in attesa, con l'istante di partenza", async () => {
        const future = new Date(Date.now() + 5 * 60_000).toISOString();
        const past = new Date(Date.now() - 60_000).toISOString();
        from.mockReturnValue(
            builder({
                data: [
                    { target_language_code: "en", status: "pending", run_after: future },
                    { target_language_code: "fr", status: "pending", run_after: past },
                    { target_language_code: "de", status: "processing", run_after: past }
                ],
                error: null
            })
        );
        const { pending, waiting } = await getJobLanguageStates("t1", "product", "p1", "description", "h1");
        expect([...pending].sort()).toEqual(["de", "fr"]);
        expect([...waiting.entries()]).toEqual([["en", future]]);
    });
});

describe("translateNow", () => {
    it("anticipa tutta l'azienda senza filtri", async () => {
        rpc.mockResolvedValue({ data: 7, error: null });
        await expect(translateNow("t1")).resolves.toBe(7);
        expect(rpc).toHaveBeenCalledWith("translate_now", { p_tenant_id: "t1" });
    });

    it("anticipa solo l'entità scelta", async () => {
        rpc.mockResolvedValue({ data: 2, error: null });
        await translateNow("t1", { entityType: "category", entityId: "c1" });
        expect(rpc).toHaveBeenCalledWith("translate_now", {
            p_tenant_id: "t1",
            p_entity_type: "category",
            p_entity_id: "c1"
        });
    });

    it("propaga l'errore della RPC", async () => {
        rpc.mockResolvedValue({ data: null, error: { code: "42501" } });
        await expect(translateNow("t1")).rejects.toEqual({ code: "42501" });
    });
});

describe("deleteTranslationsForEntity", () => {
    it("cancella anche i job ancora pending dello stesso testo", async () => {
        const byTable: Record<string, ReturnType<typeof builder>> = {
            translations: builder({ error: null }),
            translation_jobs: builder({ error: null })
        };
        from.mockImplementation((table: string) => byTable[table]);

        await deleteTranslationsForEntity("t1", "category", "c1", "name");

        const jobs = byTable.translation_jobs.calls;
        expect(jobs).toContainEqual(["delete", []]);
        expect(jobs).toContainEqual(["eq", ["entity_id", "c1"]]);
        expect(jobs).toContainEqual(["eq", ["field", "name"]]);
        expect(jobs).toContainEqual(["eq", ["status", "pending"]]);
    });
});

describe("copertura con l'attesa", () => {
    const coverage: TranslationCoverage = {
        en: { total: 10, fresh: 5, stale: 0, pending: 1, waiting: 3, next_run_at: "2026-10-12T10:08:00Z", failed: 0, missing: 1, last_updated: null },
        fr: { total: 10, fresh: 6, stale: 0, pending: 0, waiting: 2, next_run_at: "2026-10-12T10:03:00Z", failed: 0, missing: 2, last_updated: null },
        de: { total: 10, fresh: 10, stale: 0, pending: 0, failed: 0, missing: 0, last_updated: null }
    };

    it("somma i job in attesa, anche con lingue senza il campo", () => {
        expect(sumWaiting(coverage)).toBe(5);
    });

    it("trova la prima partenza", () => {
        expect(earliestNextRunAt(coverage)).toBe("2026-10-12T10:03:00Z");
        expect(earliestNextRunAt({})).toBeNull();
    });
});

describe("countLanguageBackfill", () => {
    it("chiede il conteggio per la lingua, anche spenta", async () => {
        rpc.mockResolvedValue({ data: 42, error: null });
        const { countLanguageBackfill } = await import("@/services/supabase/tenantLanguages");
        await expect(countLanguageBackfill("t1", "de")).resolves.toBe(42);
        expect(rpc).toHaveBeenCalledWith("count_tenant_language_backfill", {
            p_tenant_id: "t1",
            p_target_lang: "de"
        });
    });

    it("propaga l'errore (la pagina torna alla frase generica)", async () => {
        rpc.mockResolvedValue({ data: null, error: { code: "42501" } });
        const { countLanguageBackfill } = await import("@/services/supabase/tenantLanguages");
        await expect(countLanguageBackfill("t1", "de")).rejects.toEqual({ code: "42501" });
    });
});
