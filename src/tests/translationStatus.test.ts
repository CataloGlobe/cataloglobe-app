import { describe, it, expect, vi, beforeEach } from "vitest";

const from = vi.fn();

vi.mock("@/services/supabase/client", () => ({
    supabase: { from: (...args: unknown[]) => from(...args) }
}));

import { getFieldTranslationStatus, retryFailedTranslation } from "@/services/supabase/translationStatus";

/** Builder PostgREST finto che registra le chiamate e si risolve con `result`. */
function builder(result: { data?: unknown; error: unknown }) {
    const calls: [string, unknown[]][] = [];
    const b: Record<string, unknown> = { calls };
    for (const method of ["select", "update", "eq"]) {
        b[method] = (...args: unknown[]) => {
            calls.push([method, args]);
            return b;
        };
    }
    b.maybeSingle = () => Promise.resolve(result);
    b.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve);
    return b as Record<string, unknown> & { calls: [string, unknown[]][] };
}

/** Una risposta per tabella, come le legge getFieldTranslationStatus. */
function tables(
    jobs: { status: string; target_language_code: string; last_error: string | null }[],
    translations: { language_code: string; status: string; source_hash: string | null }[] = []
) {
    const byTable: Record<string, ReturnType<typeof builder>> = {
        tenant_languages: builder({
            data: [{ language_code: "en" }, { language_code: "fr" }, { language_code: "de" }, { language_code: "es" }],
            error: null
        }),
        products: builder({ data: { description_hash: "h1" }, error: null }),
        translation_jobs: builder({ data: jobs, error: null }),
        translations: builder({ data: translations, error: null })
    };
    from.mockImplementation((table: string) => byTable[table]);
}

beforeEach(() => from.mockReset());

describe("getFieldTranslationStatus", () => {
    it("conta i job failed come errori, con l'ultimo messaggio", async () => {
        tables([
            { status: "failed", target_language_code: "fr", last_error: "quota esaurita" },
            { status: "done", target_language_code: "en", last_error: null }
        ]);
        const status = await getFieldTranslationStatus("t1", "product", "p1", "description");
        expect(status.errorCount).toBe(1);
        expect(status.lastError).toBe("quota esaurita");
    });

    it("conta in corso sia i pending sia i processing", async () => {
        tables([
            { status: "pending", target_language_code: "fr", last_error: null },
            { status: "processing", target_language_code: "de", last_error: null },
            { status: "done", target_language_code: "en", last_error: null },
            { status: "failed", target_language_code: "es", last_error: null }
        ]);
        const status = await getFieldTranslationStatus("t1", "product", "p1", "description");
        expect(status.pendingCount).toBe(2);
        expect(status.errorCount).toBe(1);
    });

    it("conta indietro anche un'automatica senza job aperto, come la tab Traduzioni", async () => {
        tables(
            [{ status: "pending", target_language_code: "de", last_error: null }],
            [
                { language_code: "en", status: "auto", source_hash: "h0" }, // orfana: indietro
                { language_code: "fr", status: "manual", source_hash: "h0" }, // manuale: indietro
                { language_code: "de", status: "auto", source_hash: "h0" }, // job in coda: non indietro
                { language_code: "es", status: "auto", source_hash: "h1" } // attuale
            ]
        );
        const status = await getFieldTranslationStatus("t1", "product", "p1", "description");
        expect(status.staleCount).toBe(2);
        expect(status.doneCount).toBe(1);
        expect(status.languages).toEqual([
            { code: "en", state: "stale" },
            { code: "fr", state: "stale" },
            { code: "de", state: "pending" },
            { code: "es", state: "done" }
        ]);
    });
});

describe("retryFailedTranslation", () => {
    it("rimette in coda i job failed, non uno stato che il DB non ha", async () => {
        const b = builder({ error: null });
        from.mockReturnValue(b);
        await retryFailedTranslation("t1", "product", "p1", "description", "fr");
        expect(from).toHaveBeenCalledWith("translation_jobs");
        expect(b.calls).toContainEqual(["eq", ["status", "failed"]]);
        expect(b.calls).toContainEqual(["eq", ["target_language_code", "fr"]]);
    });
});
