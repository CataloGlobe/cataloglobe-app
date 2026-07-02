// =============================================================================
// processTranslationTick — logica pura del tick del worker (Edge + testabile)
// =============================================================================
//
// Estratta da process-translation-jobs/index.ts (FASE 2b) per renderla unit-
// testabile in Vitest (node): NESSUN global Deno qui, e NESSUN import da file
// Deno con estensione esplicita `.ts` (es. ./TranslationProvider.ts) — quegli
// import romperebbero `tsc --noEmit` dell'app (moduleResolution Node, niente
// allowImportingTsExtensions) non appena il test li tira nel grafo. Quindi:
//   - tipi provider minimi definiti localmente (structural-compatible con la
//     TranslationProvider dell'edge);
//   - retryable rilevato in modo DUCK-TYPED (legge err.retryable) invece che via
//     `instanceof TranslationProviderError`: funziona comunque con la classe
//     reale lanciata dai provider, senza importarla.
//
// Tutte le dipendenze sono iniettate via TickDeps:
//   - store:  accesso DB (claim, upsert, update job, reset orfani) — ogni op
//             ritorna {error} stile supabase, l'error handling vive qui.
//   - getProvider: risoluzione provider per lingua (in index usa il router).
//   - now / log / config: iniettati per determinismo nei test.
//
// Garanzie anti-orfano (audit FASE 1):
//   1. Timeout esplicito sul provider (deeplTimeoutMs) -> i tick muoiono
//      prevedibilmente prima della soglia di reclaim DB.
//   2. Ogni UPDATE di stato e' controllato: un UPDATE fallito NON lascia il job
//      silenziosamente in 'processing' (conteggiato + resta "unresolved" e
//      viene riportato a pending dal finally).
//   3. finally anti-orfano: i job presi nel tick ma non risolti vengono
//      riportati a 'pending' (best-effort, guard status='processing'). Rete a
//      monte; il reclaim DB (FASE 2a) resta la rete a valle.
//
// Ref: docs/translations-architecture-v3.md sez. 6.3 + audit FASE 1/2.
// =============================================================================

// ── Tipi provider minimi (structural-compatible con ./TranslationProvider.ts) ─
//
// Tipi canonici: ./TranslationProvider.ts (TranslationProvider, TranslateInput,
// TranslateOutput, TranslationProviderError). Qui sono ri-dichiarati in forma
// minima di proposito — NON importarli da quel file: l'import con estensione
// `.ts` romperebbe `tsc --noEmit` dell'app quando il test tira il modulo nel
// grafo (vedi header). Mantenere queste shape allineate al contratto canonico.

export interface TranslateLikeInput {
    texts: readonly string[];
    sourceLang: string;
    targetLang: string;
    signal?: AbortSignal;
}

export interface TranslateLikeOutput {
    translations: readonly string[];
    provider: string;
}

export interface TranslationProviderLike {
    readonly name: string;
    translate(input: TranslateLikeInput): Promise<TranslateLikeOutput>;
}

// ── Job + store ──────────────────────────────────────────────────────────────

export interface PendingJob {
    id: string;
    tenant_id: string | null;
    entity_type: string;
    entity_id: string;
    field: string;
    target_language_code: string;
    source_text: string;
    source_hash: string;
    attempts: number;
}

export interface DbError {
    message: string;
}

export interface DbResult<T> {
    data: T | null;
    error: DbError | null;
}

/**
 * Accesso DB del worker. Ogni operazione ritorna {error} stile supabase-js:
 * l'error handling (log + conteggio + mantenimento "unresolved") vive nella
 * logica pura, non nell'implementazione.
 */
export interface JobStore {
    /** Atomic claim: pending + reclaim orfani under-cap. p_max_attempts passato. */
    claim(limit: number, maxAttempts: number): Promise<DbResult<PendingJob[]>>;
    /** base_language_code per i tenant indicati (per risolvere source_lang). */
    getTenantBaseLangs(tenantIds: string[]): Promise<Map<string, string>>;
    /** UPSERT translation. data=false => override manuale preservato. */
    upsertAutoTranslation(
        job: PendingJob,
        translatedText: string,
        provider: string
    ): Promise<DbResult<boolean>>;
    /** UPDATE singolo job (patch parziale). */
    updateJob(jobId: string, patch: Record<string, unknown>): Promise<{ error: DbError | null }>;
    /** Riporta a 'pending' i job ancora 'processing' (finally anti-orfano). */
    resetOrphans(jobIds: string[]): Promise<{ error: DbError | null }>;
}

export interface TickDeps {
    store: JobStore;
    getProvider(targetLang: string): TranslationProviderLike;
    /** Batch size del claim. */
    batchSize: number;
    /** Limite tentativi: passato al claim e usato per il boundary retry/fail. */
    maxAttempts: number;
    /** Timeout esplicito sulla chiamata al provider (ms). */
    deeplTimeoutMs: number;
    /** ISO timestamp corrente (iniettato per determinismo nei test). */
    now(): string;
    /** Logger opzionale (default no-op). */
    log?(message: string, meta?: unknown): void;
}

export interface TickCounters {
    processed: number;
    failed: number;
    retried: number;
    /** UPDATE di stato falliti (non ingoiati). */
    updateErrors: number;
    /** Job riportati a pending dal finally anti-orfano. */
    orphansReset: number;
}

interface Group {
    source: string;
    target: string;
    jobs: PendingJob[];
}

/**
 * retryable duck-typed: legge err.retryable se presente (la
 * TranslationProviderError dei provider lo espone come boolean), altrimenti
 * true (errore non-provider / sconosciuto -> retry cautelativo, come la logica
 * originale `instanceof ? err.retryable : true`).
 */
function isRetryable(err: unknown): boolean {
    if (err && typeof err === "object"
        && typeof (err as { retryable?: unknown }).retryable === "boolean") {
        return (err as { retryable: boolean }).retryable;
    }
    return true;
}

/**
 * Esegue un tick completo: claim -> group -> translate -> upsert/mark -> finally.
 * Ritorna i contatori. Non lancia: tutti gli errori sono gestiti internamente.
 */
export async function runTranslationTick(deps: TickDeps): Promise<TickCounters> {
    const counters: TickCounters = {
        processed: 0,
        failed: 0,
        retried: 0,
        updateErrors: 0,
        orphansReset: 0
    };

    const claimRes = await deps.store.claim(deps.batchSize, deps.maxAttempts);
    if (claimRes.error) {
        deps.log?.("claim failed", claimRes.error);
        return counters;
    }
    const jobs = claimRes.data ?? [];
    if (jobs.length === 0) return counters;

    // Job presi nel tick ma non ancora risolti (rimossi su done/failed/rollback
    // andati a buon fine). Cio' che resta qui a fine tick viene riportato a
    // pending dal finally.
    const unresolved = new Set<string>(jobs.map(j => j.id));

    try {
        const tenantBaseLangs = await resolveTenantBaseLangs(jobs, deps);
        const groups = groupBySourceTarget(jobs, tenantBaseLangs);

        for (const group of groups) {
            try {
                const result = await translateWithTimeout(
                    deps.getProvider(group.target),
                    { texts: group.jobs.map(j => j.source_text), sourceLang: group.source, targetLang: group.target },
                    deps.deeplTimeoutMs
                );

                for (let i = 0; i < group.jobs.length; i++) {
                    const job = group.jobs[i];
                    const upsert = await deps.store.upsertAutoTranslation(
                        job,
                        result.translations[i],
                        result.provider
                    );

                    if (upsert.error) {
                        deps.log?.(`upsert failed for job ${job.id}`, upsert.error);
                        await markFailed(job.id, `upsert: ${upsert.error.message}`, unresolved, counters, deps);
                        continue;
                    }

                    if (upsert.data === false) {
                        deps.log?.("preserved manual override", {
                            entity_type: job.entity_type,
                            entity_id: job.entity_id,
                            field: job.field,
                            language_code: job.target_language_code
                        });
                    }

                    await markDone(job.id, unresolved, counters, deps);
                }
            } catch (err) {
                // Errore sull'intero gruppo (provider down, timeout, batch fallito).
                const retryable = isRetryable(err);
                const errMessage = err instanceof Error ? err.message : String(err);

                for (const job of group.jobs) {
                    if (retryable && job.attempts < deps.maxAttempts) {
                        await rollbackToPending(job.id, errMessage, unresolved, counters, deps);
                    } else {
                        await markFailed(job.id, errMessage, unresolved, counters, deps);
                    }
                }
            }
        }
    } finally {
        // Rete anti-orfano: qualunque job preso ma non risolto (errori di UPDATE,
        // morte parziale del loop) torna a pending. Guard status='processing'
        // lato store evita di sovrascrivere job gia' passati a done/failed.
        if (unresolved.size > 0) {
            const ids = [...unresolved];
            const { error } = await deps.store.resetOrphans(ids);
            if (error) {
                deps.log?.("orphan reset failed", error);
            } else {
                counters.orphansReset = ids.length;
            }
        }
    }

    return counters;
}

// ── Helpers di transizione (controllano SEMPRE l'error dell'UPDATE) ──────────

async function markDone(
    jobId: string,
    unresolved: Set<string>,
    counters: TickCounters,
    deps: TickDeps
): Promise<void> {
    const { error } = await deps.store.updateJob(jobId, {
        status: "done",
        processed_at: deps.now()
    });
    if (error) {
        deps.log?.(`markDone update failed for job ${jobId}`, error);
        counters.updateErrors++;
        return; // resta in unresolved -> finally lo riporta a pending
    }
    unresolved.delete(jobId);
    counters.processed++;
}

async function markFailed(
    jobId: string,
    errMessage: string,
    unresolved: Set<string>,
    counters: TickCounters,
    deps: TickDeps
): Promise<void> {
    const { error } = await deps.store.updateJob(jobId, {
        status: "failed",
        last_error: errMessage,
        processed_at: deps.now()
    });
    if (error) {
        deps.log?.(`markFailed update failed for job ${jobId}`, error);
        counters.updateErrors++;
        return;
    }
    unresolved.delete(jobId);
    counters.failed++;
}

async function rollbackToPending(
    jobId: string,
    errMessage: string,
    unresolved: Set<string>,
    counters: TickCounters,
    deps: TickDeps
): Promise<void> {
    const { error } = await deps.store.updateJob(jobId, {
        status: "pending",
        last_error: errMessage
    });
    if (error) {
        deps.log?.(`rollbackToPending update failed for job ${jobId}`, error);
        counters.updateErrors++;
        return;
    }
    unresolved.delete(jobId);
    counters.retried++;
}

// ── Provider call con timeout esplicito (AbortController + race) ─────────────

/**
 * Esegue provider.translate con un timeout duro. Allo scadere:
 *   - aborta il segnale (la fetch reale del provider viene cancellata);
 *   - rigetta con un errore retryable, indipendentemente dal fatto che il
 *     provider onori o meno il signal (race -> il timeout vince anche se la
 *     promise del provider non si risolve mai).
 */
export async function translateWithTimeout(
    provider: TranslationProviderLike,
    input: TranslateLikeInput,
    timeoutMs: number
): Promise<TranslateLikeOutput> {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;

    const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
            controller.abort();
            reject(makeTimeoutError(provider.name, timeoutMs));
        }, timeoutMs);
    });

    try {
        return await Promise.race([
            provider.translate({ ...input, signal: controller.signal }),
            timeout
        ]);
    } finally {
        if (timer !== undefined) clearTimeout(timer);
    }
}

/**
 * Errore di timeout shaped come una TranslationProviderError retryable (espone
 * `retryable: true`) senza importare la classe dal modulo Deno -> isRetryable
 * lo tratta come retryable, il path catch fa rollback->pending se sotto cap.
 */
function makeTimeoutError(provider: string, timeoutMs: number): Error {
    const err = new Error(`provider timeout after ${timeoutMs}ms`);
    err.name = "TranslationProviderError";
    (err as Error & { retryable: boolean; category: string; provider: string }).retryable = true;
    (err as Error & { retryable: boolean; category: string; provider: string }).category = "network";
    (err as Error & { retryable: boolean; category: string; provider: string }).provider = provider;
    return err;
}

// ── Grouping ─────────────────────────────────────────────────────────────────

async function resolveTenantBaseLangs(
    jobs: PendingJob[],
    deps: TickDeps
): Promise<Map<string, string>> {
    const tenantIds = [...new Set(
        jobs.map(j => j.tenant_id).filter((id): id is string => id !== null)
    )];
    if (tenantIds.length === 0) return new Map();
    return deps.store.getTenantBaseLangs(tenantIds);
}

function groupBySourceTarget(
    jobs: PendingJob[],
    tenantBaseLangs: Map<string, string>
): Group[] {
    const groups = new Map<string, Group>();
    for (const job of jobs) {
        const sourceLang = job.tenant_id
            ? tenantBaseLangs.get(job.tenant_id) ?? "it"
            : "it";
        const key = `${sourceLang}|${job.target_language_code}`;
        let group = groups.get(key);
        if (!group) {
            group = { source: sourceLang, target: job.target_language_code, jobs: [] };
            groups.set(key, group);
        }
        group.jobs.push(job);
    }
    return [...groups.values()];
}
