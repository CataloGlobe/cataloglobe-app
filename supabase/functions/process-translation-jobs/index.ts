// @ts-nocheck
// =============================================================================
// process-translation-jobs (Edge Function)
// =============================================================================
//
// Consuma la queue translation_jobs ogni 30s (pg_cron). Auth via header
// X-Job-Secret. Niente CORS (chiamata interna da DB net.http_post).
//
// La logica del tick (claim -> group -> translate -> upsert/mark -> finally
// anti-orfano) vive in _shared/translation/processTranslationTick.ts, pura e
// unit-testata (src/tests/translationWorker.test.ts). Qui solo wiring:
//   - auth X-Job-Secret;
//   - JobStore concreto sopra supabase-js (ogni op ritorna {error});
//   - getProvider via router (legge Deno.env);
//   - timeout DeepL 45s, MAX_ATTEMPTS passato al claim (fonte autoritativa).
//
// Hardening FASE 2b (audit FASE 1):
//   - claim riceve p_max_attempts -> l'edge e' la fonte del cap;
//   - timeout esplicito sul provider (i tick muoiono prima della soglia di
//     reclaim DB di FASE 2a);
//   - ogni UPDATE di stato e' controllato (no job silenziosamente 'processing');
//   - finally riporta a 'pending' i job presi-ma-non-risolti (rete a monte).
//
// Ref: docs/translations-architecture-v3.md sez. 6.3.
// =============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getProviderForLanguage } from "../_shared/translation/router.ts";
import {
    runTranslationTick,
    type JobStore,
    type PendingJob,
    type DbResult
} from "../_shared/translation/processTranslationTick.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const JOB_SECRET = Deno.env.get("TRANSLATION_JOB_SECRET")!;

const BATCH_SIZE = 50;
const MAX_ATTEMPTS = 3;
const DEEPL_TIMEOUT_MS = 45_000;

Deno.serve(async (req: Request) => {
    // 1. Auth check
    const providedSecret = req.headers.get("X-Job-Secret");
    if (!providedSecret || providedSecret !== JOB_SECRET) {
        return jsonResponse({ error: "unauthorized" }, 401);
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
        auth: { persistSession: false }
    });

    const store = createJobStore(supabase);

    const counters = await runTranslationTick({
        store,
        getProvider: getProviderForLanguage,
        batchSize: BATCH_SIZE,
        maxAttempts: MAX_ATTEMPTS,
        deeplTimeoutMs: DEEPL_TIMEOUT_MS,
        now: () => new Date().toISOString(),
        log: (message, meta) => {
            if (meta !== undefined) console.error(`[process-translation-jobs] ${message}`, meta);
            else console.log(`[process-translation-jobs] ${message}`);
        }
    });

    return jsonResponse(counters, 200);
});

// JobStore concreto su supabase-js. Ogni op normalizza l'output a {data?, error}.
function createJobStore(supabase: any): JobStore {
    return {
        async claim(limit: number, maxAttempts: number): Promise<DbResult<PendingJob[]>> {
            const { data, error } = await supabase.rpc("claim_pending_translation_jobs", {
                p_limit: limit,
                p_max_attempts: maxAttempts
                // p_reclaim_after_minutes: lasciato al DEFAULT DB (5 min)
            });
            if (error) return { data: null, error: { message: error.message } };
            return { data: (data ?? []) as PendingJob[], error: null };
        },

        async getTenantBaseLangs(tenantIds: string[]): Promise<Map<string, string>> {
            const map = new Map<string, string>();
            if (tenantIds.length === 0) return map;
            const { data } = await supabase
                .from("tenants")
                .select("id, base_language_code")
                .in("id", tenantIds);
            for (const t of data ?? []) {
                map.set(t.id, t.base_language_code);
            }
            return map;
        },

        async upsertAutoTranslation(
            job: PendingJob,
            translatedText: string,
            provider: string
        ): Promise<DbResult<boolean>> {
            const { data, error } = await supabase.rpc("upsert_auto_translation", {
                p_tenant_id: job.tenant_id,
                p_entity_type: job.entity_type,
                p_entity_id: job.entity_id,
                p_field: job.field,
                p_language_code: job.target_language_code,
                p_source_text: job.source_text,
                p_source_hash: job.source_hash,
                p_translated_text: translatedText,
                p_provider: provider
            });
            if (error) return { data: null, error: { message: error.message } };
            return { data: data as boolean, error: null };
        },

        async updateJob(jobId: string, patch: Record<string, unknown>): Promise<{ error: { message: string } | null }> {
            const { error } = await supabase
                .from("translation_jobs")
                .update(patch)
                .eq("id", jobId);
            return { error: error ? { message: error.message } : null };
        },

        async resetOrphans(jobIds: string[]): Promise<{ error: { message: string } | null }> {
            const { error } = await supabase
                .from("translation_jobs")
                .update({ status: "pending" })
                .in("id", jobIds)
                .eq("status", "processing"); // guard: non sovrascrivere done/failed
            return { error: error ? { message: error.message } : null };
        }
    };
}

function jsonResponse(body: unknown, status: number): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" }
    });
}
