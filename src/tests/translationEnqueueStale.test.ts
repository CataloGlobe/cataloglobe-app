import { describe, it, expect, vi, beforeEach } from "vitest";

const from = vi.fn();

vi.mock("@/services/supabase/client", () => ({
    supabase: { from: (...args: unknown[]) => from(...args), rpc: vi.fn(), functions: { invoke: vi.fn() } }
}));

vi.mock("@/services/supabase/translations", () => ({
    getTenantBaseLanguage: vi.fn(async () => "it"),
    getActiveTenantLanguages: vi.fn(async () => [{ language_code: "en" }, { language_code: "fr" }])
}));

import { enqueueTranslationJobsIfChanged } from "@/services/supabase/translationJobs";

type Calls = [string, unknown[]][];

/** Builder PostgREST finto: registra le chiamate e si risolve con `result`. */
function builder(result: { data?: unknown; error: unknown }) {
    const calls: Calls = [];
    const b: Record<string, unknown> = { calls };
    for (const method of ["select", "delete", "eq", "in", "neq", "not", "single"]) {
        b[method] = (...args: unknown[]) => {
            calls.push([method, args]);
            return b;
        };
    }
    b.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve);
    return b as Record<string, unknown> & { calls: Calls };
}

/** Ogni `from(table)` riceve un builder nuovo; li tiene per tabella. */
function tables(translations: unknown[]) {
    const made: Record<string, ReturnType<typeof builder>[]> = {};
    from.mockImplementation((table: string) => {
        const result =
            table === "tenants"
                ? { data: { vertical_type: "food_beverage" }, error: null }
                : table === "translations"
                  ? { data: translations, error: null }
                  : { error: null };
        const b = builder(result);
        (made[table] ??= []).push(b);
        return b;
    });
    return made;
}

const input = {
    tenantId: "t1",
    entityType: "category" as const,
    entityId: "c1",
    field: "name" as const
};

beforeEach(() => from.mockReset());

describe("enqueueTranslationJobsIfChanged e i job in attesa superati", () => {
    it("testo svuotato: cancella traduzioni e tutti i job pending del campo", async () => {
        const made = tables([]);
        await expect(
            enqueueTranslationJobsIfChanged({ ...input, newSourceText: null, newSourceHash: null })
        ).resolves.toBe(0);

        const jobs = made.translation_jobs?.[0]?.calls ?? [];
        expect(jobs).toContainEqual(["delete", []]);
        expect(jobs).toContainEqual(["eq", ["field", "name"]]);
        expect(jobs).toContainEqual(["eq", ["status", "pending"]]);
        expect(jobs.some(([m]) => m === "neq")).toBe(false);
    });

    it("testo tornato all'originale (A → B → A): cancella il pending con l'hash B", async () => {
        const made = tables([
            { language_code: "en", source_hash: "hA", status: "auto" },
            { language_code: "fr", source_hash: "hOld", status: "manual" }
        ]);
        await expect(
            enqueueTranslationJobsIfChanged({ ...input, newSourceText: "A", newSourceHash: "hA" })
        ).resolves.toBe(0);

        const jobs = made.translation_jobs?.[0]?.calls ?? [];
        expect(jobs).toContainEqual(["delete", []]);
        expect(jobs).toContainEqual(["eq", ["status", "pending"]]);
        expect(jobs).toContainEqual(["neq", ["source_hash", "hA"]]);
        expect(jobs.some(([m]) => m === "not")).toBe(false);
    });
});
