// =============================================================================
// Unit test — runTranslationTick (worker traduzioni, FASE 2b)
// =============================================================================
//
// Logica pura estratta in supabase/functions/_shared/translation/
// processTranslationTick.ts (nessun global Deno -> importabile in node/vitest).
// Copre i path anti-orfano dell'audit FASE 1/2:
//   - throw retryable con attempts < MAX        -> job torna 'pending'
//   - throw con attempts >= MAX                  -> job 'failed'
//   - timeout sul provider (hang)               -> trattato come retryable
//   - UPDATE di stato che ritorna error         -> conteggiato, NON ingoiato
//   - job presi ma non risolti a fine tick      -> riportati a 'pending' dal
//                                                  finally (guard processing)
// =============================================================================

import { describe, it, expect } from "vitest";
import {
    runTranslationTick,
    type JobStore,
    type PendingJob,
    type TickDeps,
    type DbResult
} from "../../supabase/functions/_shared/translation/processTranslationTick";
import {
    TranslationProviderError,
    type TranslationProvider,
    type TranslateInput,
    type TranslateOutput
} from "../../supabase/functions/_shared/translation/TranslationProvider";

const NOW = "2026-06-29T12:00:00.000Z";

function makeJob(over: Partial<PendingJob> = {}): PendingJob {
    return {
        id: over.id ?? "job-1",
        tenant_id: over.tenant_id ?? null, // null => system => source 'it'
        entity_type: "product",
        entity_id: over.entity_id ?? "e1",
        field: "description",
        target_language_code: over.target_language_code ?? "en",
        source_text: over.source_text ?? "Pasta",
        source_hash: over.source_hash ?? "h1",
        attempts: over.attempts ?? 0
    };
}

/** Provider configurabile: succeed | throw | hang. */
function makeProvider(behavior: "ok" | "hang" | { throwErr: unknown }): TranslationProvider {
    return {
        name: "fake",
        supportedLanguages: ["en", "de"],
        translate(input: TranslateInput): Promise<TranslateOutput> {
            if (behavior === "hang") {
                return new Promise<never>(() => { /* never resolves */ });
            }
            if (typeof behavior === "object") {
                return Promise.reject(behavior.throwErr);
            }
            return Promise.resolve({
                translations: input.texts.map(t => `[${input.targetLang}] ${t}`),
                provider: this.name
            });
        }
    };
}

/** Store in-memory. Traccia stato job + permette di forzare error su updateJob. */
class FakeStore implements JobStore {
    rows = new Map<string, { status: string; attempts: number; last_error: string | null; processed_at: string | null }>();
    resetOrphansCalledWith: string[] | null = null;
    // (jobId|targetStatus) per i quali updateJob ritorna error
    failUpdateFor: Set<string> = new Set();

    constructor(private claimed: PendingJob[]) {
        for (const j of claimed) {
            this.rows.set(j.id, { status: "processing", attempts: j.attempts + 1, last_error: null, processed_at: null });
        }
    }

    claim(): Promise<DbResult<PendingJob[]>> {
        return Promise.resolve({ data: this.claimed, error: null });
    }
    getTenantBaseLangs(): Promise<Map<string, string>> {
        return Promise.resolve(new Map());
    }
    upsertAutoTranslation(): Promise<DbResult<boolean>> {
        return Promise.resolve({ data: true, error: null });
    }
    updateJob(jobId: string, patch: Record<string, unknown>): Promise<{ error: { message: string } | null }> {
        const status = String(patch.status);
        if (this.failUpdateFor.has(jobId) || this.failUpdateFor.has(`${jobId}|${status}`)) {
            return Promise.resolve({ error: { message: "simulated update failure" } });
        }
        const row = this.rows.get(jobId)!;
        row.status = status;
        if (typeof patch.last_error === "string") row.last_error = patch.last_error;
        if (typeof patch.processed_at === "string") row.processed_at = patch.processed_at as string;
        return Promise.resolve({ error: null });
    }
    resetOrphans(jobIds: string[]): Promise<{ error: { message: string } | null }> {
        this.resetOrphansCalledWith = jobIds;
        // guard: solo i job ancora 'processing' tornano a 'pending'
        for (const id of jobIds) {
            const row = this.rows.get(id);
            if (row && row.status === "processing") row.status = "pending";
        }
        return Promise.resolve({ error: null });
    }
}

function makeDeps(store: FakeStore, provider: TranslationProvider, over: Partial<TickDeps> = {}): TickDeps {
    return {
        store,
        getProvider: () => provider,
        batchSize: 50,
        maxAttempts: 3,
        deeplTimeoutMs: 30,
        now: () => NOW,
        log: () => { /* silent */ },
        ...over
    };
}

describe("runTranslationTick", () => {
    it("retryable throw with attempts < MAX -> job back to pending", async () => {
        const job = makeJob({ attempts: 0 }); // claimed -> attempts becomes 1 (< 3)
        const store = new FakeStore([job]);
        const provider = makeProvider({
            throwErr: new TranslationProviderError("deepl 500", "server", "fake", true)
        });

        const c = await runTranslationTick(makeDeps(store, provider));

        expect(store.rows.get(job.id)!.status).toBe("pending");
        expect(c.retried).toBe(1);
        expect(c.failed).toBe(0);
        expect(c.processed).toBe(0);
    });

    it("throw with attempts >= MAX -> job failed", async () => {
        const job = makeJob({ attempts: 3 }); // already at cap
        const store = new FakeStore([job]);
        const provider = makeProvider({
            throwErr: new TranslationProviderError("deepl 500", "server", "fake", true)
        });

        const c = await runTranslationTick(makeDeps(store, provider));

        expect(store.rows.get(job.id)!.status).toBe("failed");
        expect(c.failed).toBe(1);
        expect(c.retried).toBe(0);
    });

    it("provider timeout (hang) -> treated as retryable, job back to pending", async () => {
        const job = makeJob({ attempts: 0 });
        const store = new FakeStore([job]);
        const provider = makeProvider("hang");

        const c = await runTranslationTick(makeDeps(store, provider, { deeplTimeoutMs: 20 }));

        expect(store.rows.get(job.id)!.status).toBe("pending");
        expect(c.retried).toBe(1);
        expect(store.rows.get(job.id)!.last_error).toMatch(/timeout/i);
    });

    it("status UPDATE error is counted, not swallowed; job left processing then reset", async () => {
        const job = makeJob({ attempts: 0 });
        const store = new FakeStore([job]);
        store.failUpdateFor.add(`${job.id}|done`); // markDone UPDATE fails
        const provider = makeProvider("ok");

        const c = await runTranslationTick(makeDeps(store, provider));

        expect(c.updateErrors).toBe(1);
        expect(c.processed).toBe(0); // NON conteggiato come done
        // job non risolto -> riportato a pending dal finally
        expect(store.resetOrphansCalledWith).toContain(job.id);
        expect(store.rows.get(job.id)!.status).toBe("pending");
        expect(c.orphansReset).toBe(1);
    });

    it("finally resets only unresolved jobs; already-done jobs are untouched (guard)", async () => {
        const jobA = makeJob({ id: "A", entity_id: "eA" });
        const jobB = makeJob({ id: "B", entity_id: "eB" });
        const store = new FakeStore([jobA, jobB]);
        store.failUpdateFor.add("B|done"); // B markDone fails -> resta processing
        const provider = makeProvider("ok");

        const c = await runTranslationTick(makeDeps(store, provider));

        expect(store.rows.get("A")!.status).toBe("done");   // risolto, intatto
        expect(store.rows.get("B")!.status).toBe("pending"); // reset dal finally
        expect(c.processed).toBe(1);
        expect(c.updateErrors).toBe(1);
        expect(store.resetOrphansCalledWith).toEqual(["B"]);
        expect(c.orphansReset).toBe(1);
    });
});
