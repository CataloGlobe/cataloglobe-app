// @ts-nocheck
// =============================================================================
// process-translation-jobs (Edge Function)
// =============================================================================
//
// Consuma la queue translation_jobs ogni 2 min (pg_cron schedule). Auth via
// header X-Job-Secret. Niente CORS (chiamata interna da DB net.http_post).
//
// Flusso per invocazione:
//   1. Auth check (X-Job-Secret).
//   2. Pull batch via RPC claim_pending_translation_jobs (FOR UPDATE SKIP
//      LOCKED). Marca processing + attempts++.
//   3. Risolvi source_lang per tenant (base_language_code) o 'it' per system.
//   4. Group by (source_lang, target_lang) — DeepL accetta batch single-pair.
//   5. Translate via getProviderForLanguage(target).
//   6. UPSERT translations + UPDATE job done.
//   7. Su errore provider: retry se retryable + attempts < MAX_ATTEMPTS,
//      altrimenti failed.
//
// Ref: docs/translations-architecture-v3.md sez. 6.3.
// =============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getProviderForLanguage } from "../_shared/translation/router.ts";
import { TranslationProviderError } from "../_shared/translation/TranslationProvider.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const JOB_SECRET = Deno.env.get("TRANSLATION_JOB_SECRET")!;

const BATCH_SIZE = 50;
const MAX_ATTEMPTS = 3;

interface PendingJob {
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

Deno.serve(async (req: Request) => {
    // 1. Auth check
    const providedSecret = req.headers.get("X-Job-Secret");
    if (!providedSecret || providedSecret !== JOB_SECRET) {
        return jsonResponse({ error: "unauthorized" }, 401);
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
        auth: { persistSession: false }
    });

    // 2. Pull jobs (atomic claim)
    const { data: jobs, error: pullError } = await supabase
        .rpc("claim_pending_translation_jobs", { p_limit: BATCH_SIZE });

    if (pullError) {
        console.error("Failed to claim jobs:", pullError);
        return jsonResponse({ error: "claim_failed", details: pullError.message }, 500);
    }

    const pendingJobs = (jobs ?? []) as PendingJob[];
    if (pendingJobs.length === 0) {
        return jsonResponse({ processed: 0, failed: 0, retried: 0 }, 200);
    }

    // 3. Risolvi source_lang per ogni job
    const tenantIds = [...new Set(
        pendingJobs.map(j => j.tenant_id).filter((id): id is string => id !== null)
    )];
    const tenantBaseLangs = new Map<string, string>();
    if (tenantIds.length > 0) {
        const { data: tenants } = await supabase
            .from("tenants")
            .select("id, base_language_code")
            .in("id", tenantIds);
        for (const t of tenants ?? []) {
            tenantBaseLangs.set(t.id, t.base_language_code);
        }
    }

    // 4. Group by (source_lang, target_lang)
    type GroupKey = string;
    const groups = new Map<GroupKey, { source: string; target: string; jobs: PendingJob[] }>();
    for (const job of pendingJobs) {
        const sourceLang = job.tenant_id
            ? tenantBaseLangs.get(job.tenant_id) ?? "it"
            : "it";
        const key = `${sourceLang}|${job.target_language_code}`;
        if (!groups.has(key)) {
            groups.set(key, { source: sourceLang, target: job.target_language_code, jobs: [] });
        }
        groups.get(key)!.jobs.push(job);
    }

    // 5-7. Process groups
    const counters = { processed: 0, failed: 0, retried: 0 };

    for (const group of groups.values()) {
        try {
            const provider = getProviderForLanguage(group.target);
            const texts = group.jobs.map(j => j.source_text);

            const result = await provider.translate({
                texts,
                sourceLang: group.source,
                targetLang: group.target
            });

            // UPSERT translations via RPC (skips rows with status='manual')
            // + UPDATE jobs done (uno per uno per safety).
            for (let i = 0; i < group.jobs.length; i++) {
                const job = group.jobs[i];
                const translated = result.translations[i];

                const { data: wrote, error: upsertError } = await supabase.rpc(
                    "upsert_auto_translation",
                    {
                        p_tenant_id: job.tenant_id,
                        p_entity_type: job.entity_type,
                        p_entity_id: job.entity_id,
                        p_field: job.field,
                        p_language_code: job.target_language_code,
                        p_source_text: job.source_text,
                        p_source_hash: job.source_hash,
                        p_translated_text: translated,
                        p_provider: result.provider
                    }
                );

                if (upsertError) {
                    console.error(`Upsert failed for job ${job.id}:`, upsertError);
                    await markJobFailed(supabase, job.id, `upsert: ${upsertError.message}`);
                    counters.failed++;
                    continue;
                }

                if (wrote === false) {
                    console.log("[TRANSLATION] preserved manual override:", {
                        entity_type: job.entity_type,
                        entity_id: job.entity_id,
                        field: job.field,
                        language_code: job.target_language_code
                    });
                }

                await markJobDone(supabase, job.id);
                counters.processed++;
            }
        } catch (err) {
            // Errore su intero gruppo (provider down, batch fallito)
            const isProviderErr = err instanceof TranslationProviderError;
            const retryable = isProviderErr ? err.retryable : true;
            const errMessage = err instanceof Error ? err.message : String(err);

            for (const job of group.jobs) {
                if (retryable && job.attempts < MAX_ATTEMPTS) {
                    // Rimetti pending — claim_pending_translation_jobs ha già
                    // incrementato attempts, qui basta il rollback dello status.
                    await supabase
                        .from("translation_jobs")
                        .update({ status: "pending", last_error: errMessage })
                        .eq("id", job.id);
                    counters.retried++;
                } else {
                    await markJobFailed(supabase, job.id, errMessage);
                    counters.failed++;
                }
            }
        }
    }

    return jsonResponse(counters, 200);
});

async function markJobDone(supabase: any, jobId: string): Promise<void> {
    await supabase
        .from("translation_jobs")
        .update({ status: "done", processed_at: new Date().toISOString() })
        .eq("id", jobId);
}

async function markJobFailed(
    supabase: any,
    jobId: string,
    errMessage: string
): Promise<void> {
    await supabase
        .from("translation_jobs")
        .update({
            status: "failed",
            last_error: errMessage,
            processed_at: new Date().toISOString()
        })
        .eq("id", jobId);
}

function jsonResponse(body: unknown, status: number): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" }
    });
}
