/**
 * Service layer per la queue `translation_jobs`.
 *
 * Funzione cardine: `enqueueTranslationJobsIfChanged` viene chiamata da ogni
 * write nei service esistenti (Prompt 9-12) quando un campo tradotto cambia.
 * Calcola se il source_hash è cambiato vs translations esistenti, e nel caso
 * dedup/INSERT i job per le lingue attive del tenant.
 *
 * Filtro vertical-aware (Q-CN2): per tenant `food_beverage` la sezione
 * Attributi è nascosta in UI → niente job per attr_def / attr_def_option /
 * attr_value. Pattern simmetrico nel resolver pubblico (Prompt 13).
 *
 * Ref: docs/translations-architecture-v3.md sez. 6.1, 6.2, 6.3, 6.6.
 */

import { supabase } from "@/services/supabase/client";
import type {
    TranslationEntityType,
    TranslationField
} from "@/types/translations";
import {
    getActiveTenantLanguages,
    getTenantBaseLanguage
} from "@/services/supabase/translations";

/**
 * Mappa vertical → entity_type da skippare.
 *
 * food_beverage: niente job per attributes legacy (UI nascosta in ProductPage,
 * gli array sono praticamente sempre vuoti — vedi Q-CN2).
 *
 * Estensibile in futuro: se nasceranno entity-type vertical-specific (es.
 * retail-only "size_chart"), aggiungere qui senza toccare i caller.
 */
const VERTICAL_AWARE_SKIPS: Record<string, ReadonlyArray<TranslationEntityType>> = {
    food_beverage: ["attr_def", "attr_def_option", "attr_value"]
};

/**
 * Lingue con un job `pending`/`processing` per (entity, field) al source_hash
 * corrente. Usato dalla tab Traduzioni per il badge "In traduzione" (priorità
 * sul calcolo stale da hash). Dopo un cambio del sorgente IT l'enqueue crea job
 * SOLO per le lingue auto (le manual sono escluse), quindi un'auto "indietro"
 * risulta sempre pending qui, mentre una manual indietro no → "Da rivedere".
 *
 * Select RLS-safe: la policy SELECT su `translation_jobs` è già tenant-scoped
 * (`tenant_id IN get_my_tenant_ids()`). Nessuna RPC.
 */
export async function getPendingJobLanguages(
    tenantId: string,
    entityType: TranslationEntityType,
    entityId: string,
    field: TranslationField,
    sourceHash: string
): Promise<Set<string>> {
    const { data, error } = await supabase
        .from("translation_jobs")
        .select("target_language_code")
        .eq("tenant_id", tenantId)
        .eq("entity_type", entityType)
        .eq("entity_id", entityId)
        .eq("field", field)
        .eq("source_hash", sourceHash)
        .in("status", ["pending", "processing"]);
    if (error) throw error;
    return new Set((data ?? []).map(r => r.target_language_code as string));
}

/**
 * Funzione cardine: enqueue translation_jobs se source_hash è cambiato.
 *
 * Flusso:
 *  1. Vertical-aware skip (Q-CN2).
 *  2. newSourceText null → DELETE translations + skip enqueue.
 *  3. Fetch lingue attive del tenant (escluse base).
 *  4. Per ogni lingua: SELECT translation esistente; se source_hash diverso
 *     o translation mancante → marca per enqueue.
 *  5. Dedup + INSERT/UPDATE i job pending.
 *  6. Trigger job processor (fire-and-forget, no-op fino a Prompt 7).
 */
export async function enqueueTranslationJobsIfChanged(input: {
    tenantId: string;
    entityType: TranslationEntityType;
    entityId: string;
    field: TranslationField;
    newSourceText: string | null;
    newSourceHash: string | null;
}): Promise<number> {
    // 1. Vertical-aware skip
    const tenantVertical = await getTenantVerticalType(input.tenantId);
    const skips = VERTICAL_AWARE_SKIPS[tenantVertical] ?? [];
    if (skips.includes(input.entityType)) return 0;

    // 2. Source rimosso → DELETE translations esistenti per (entity, field)
    if (input.newSourceText === null || input.newSourceHash === null) {
        const { error } = await supabase
            .from("translations")
            .delete()
            .eq("tenant_id", input.tenantId)
            .eq("entity_type", input.entityType)
            .eq("entity_id", input.entityId)
            .eq("field", input.field);
        if (error) throw error;
        return 0;
    }

    // 3. Lingue attive (esclusa base)
    const [baseLanguage, activeLanguages] = await Promise.all([
        getTenantBaseLanguage(input.tenantId),
        getActiveTenantLanguages(input.tenantId)
    ]);

    const targetLanguages = activeLanguages
        .map(l => l.language_code)
        .filter(code => code !== baseLanguage);

    if (targetLanguages.length === 0) return 0;

    // 4. Filtra le lingue che effettivamente necessitano un nuovo job
    const existing = await fetchExistingTranslationsHashes(
        input.tenantId,
        input.entityType,
        input.entityId,
        input.field,
        targetLanguages
    );

    // Skip lingue con override manuale: la edge function preserverebbe
    // comunque la riga (guard server-side in upsert_auto_translation),
    // ma evitiamo l'enqueue per non sprecare round-trip DeepL.
    const manualLangs = new Set(
        existing.filter(t => t.status === "manual").map(t => t.language_code)
    );

    const langsNeedingJob = targetLanguages.filter(lang => {
        if (manualLangs.has(lang)) return false;
        const existingRow = existing.find(t => t.language_code === lang);
        return !existingRow || existingRow.source_hash !== input.newSourceHash;
    });

    if (langsNeedingJob.length === 0) return 0;

    // 5. Dedup + INSERT/UPDATE
    await dedupAndEnqueueJobs({
        tenantId: input.tenantId,
        entityType: input.entityType,
        entityId: input.entityId,
        field: input.field,
        sourceText: input.newSourceText,
        sourceHash: input.newSourceHash,
        targetLanguages: langsNeedingJob
    });

    // 6. Fire-and-forget trigger
    void triggerJobProcessor();

    return langsNeedingJob.length;
}

/**
 * Versione bulk per menu-ai-import post-import (Prompt 11) e backfill di
 * tenant esistenti (Prompt 22).
 *
 * MVP: implementata sequenzialmente sopra `enqueueTranslationJobsIfChanged`
 * per riusare la logica vertical-aware + dedup. Ottimizzazione UPSERT batch
 * lasciata a v1.1 se il profilo di carico lo giustifica.
 *
 * Trigger del job processor avviene UNA SOLA VOLTA a fine batch
 * (i singoli enqueue interni hanno il trigger no-op fino a Prompt 7,
 * quindi non c'è regressione).
 */
export async function enqueueTranslationJobsBulk(
    tenantId: string,
    items: ReadonlyArray<{
        entityType: TranslationEntityType;
        entityId: string;
        field: TranslationField;
        sourceText: string;
        sourceHash: string;
    }>
): Promise<void> {
    for (const item of items) {
        await enqueueTranslationJobsIfChanged({
            tenantId,
            entityType: item.entityType,
            entityId: item.entityId,
            field: item.field,
            newSourceText: item.sourceText,
            newSourceHash: item.sourceHash
        });
    }
    void triggerJobProcessor();
}

/**
 * Fire-and-forget call all'edge function process-translation-jobs.
 *
 * PLACEHOLDER: la funzione resta no-op. Decisione architetturale Prompt 7:
 * niente webhook trigger dal frontend (richiederebbe secret accessibile dal
 * browser, complessità non giustificata). I job pending vengono processati
 * dal pg_cron schedule (ogni 2 minuti) attivo in produzione.
 *
 * Latency tipica save → traduzione visibile: 0-120s. Acceptable per B2B menu
 * management (stale-while-revalidate copre l'edge case lato pubblico).
 */
async function triggerJobProcessor(): Promise<void> {
    // No-op intenzionale. pg_cron schedule è il trigger autoritativo.
}

/**
 * Serializza products.notes (JSONB array di {label, value}) in canonical JSON
 * string per uso come `source_text` nel record translations / translation_jobs.
 *
 * Canonical form: array di {label, value} con `trim()` su ogni stringa, NO
 * sort (l'ordine è semantico). DEVE matchare esattamente la canonical form
 * usata da `computeNotesHash` in hashUtils.ts — pena divergenza tra hash e
 * source_text al lookup.
 *
 * @returns null per array null/vuoto. Stringa JSON altrimenti.
 *
 * Usato dal Prompt 9 (hook updateProduct.notes) e dal Prompt 13 (resolver
 * pubblico per deserializzare translated_text → array).
 */
export function serializeNotes(
    notes: ReadonlyArray<{ label: string; value: string }> | null | undefined
): string | null {
    if (!notes || notes.length === 0) return null;
    return JSON.stringify(
        notes.map(n => ({
            label: (n.label ?? "").trim(),
            value: (n.value ?? "").trim()
        }))
    );
}

/**
 * Wrapper di `enqueueTranslationJobsIfChanged` con catch silent: gli errori
 * della pipeline traduzioni NON devono mai rompere il save dell'utente.
 *
 * Pattern fire-and-forget: errori di network/RPC vengono loggati ma swallow.
 * Al prossimo save dello stesso campo, l'enqueue verrà ritentato (l'hash è
 * preservato in DB, quindi se cambia di nuovo entra in loop di retry
 * naturale).
 *
 * Usato in tutti gli hook write-side (Prompt 9, 10).
 */
export async function enqueueWithSilentError(
    input: Parameters<typeof enqueueTranslationJobsIfChanged>[0]
): Promise<number> {
    try {
        return await enqueueTranslationJobsIfChanged(input);
    } catch (err) {
        console.error("[translations] enqueue failed (non-blocking):", err);
        return 0;
    }
}

/**
 * Cancella i translation_jobs per un'entità + field opzionale.
 *
 * Simmetrica a `deleteTranslationsForEntity` (translations.ts) ma su
 * tabella `translation_jobs`. Usata in cleanup post-delete dell'entità
 * sorgente: la FK su translation_jobs è polimorfica (entity_id TEXT, no
 * vincolo), quindi il cleanup va fatto manualmente dal service.
 */
export async function deleteTranslationJobsForEntity(
    tenantId: string,
    entityType: TranslationEntityType,
    entityId: string,
    field?: TranslationField
): Promise<void> {
    let query = supabase
        .from("translation_jobs")
        .delete()
        .eq("tenant_id", tenantId)
        .eq("entity_type", entityType)
        .eq("entity_id", entityId);

    if (field !== undefined) {
        query = query.eq("field", field);
    }

    const { error } = await query;
    if (error) throw error;
}

// Helpers ---------------------------------------------------------------

async function getTenantVerticalType(tenantId: string): Promise<string> {
    const { data, error } = await supabase
        .from("tenants")
        .select("vertical_type")
        .eq("id", tenantId)
        .single();

    if (error) {
        if (error.code === "PGRST116") {
            throw new Error(`Tenant non trovato: ${tenantId}`);
        }
        throw error;
    }

    return data.vertical_type as string;
}

async function fetchExistingTranslationsHashes(
    tenantId: string,
    entityType: TranslationEntityType,
    entityId: string,
    field: TranslationField,
    targetLanguages: string[]
): Promise<Array<{ language_code: string; source_hash: string; status: string }>> {
    const { data, error } = await supabase
        .from("translations")
        .select("language_code, source_hash, status")
        .eq("tenant_id", tenantId)
        .eq("entity_type", entityType)
        .eq("entity_id", entityId)
        .eq("field", field)
        .in("language_code", targetLanguages);

    if (error) throw error;
    return (data ?? []) as Array<{ language_code: string; source_hash: string; status: string }>;
}

async function dedupAndEnqueueJobs(input: {
    tenantId: string;
    entityType: TranslationEntityType;
    entityId: string;
    field: TranslationField;
    sourceText: string;
    sourceHash: string;
    targetLanguages: string[];
}): Promise<void> {
    // Per ogni lang: prima check se esiste pending → UPDATE, altrimenti INSERT.
    // Pattern N+1 sequenziale per ora; se diventa hot path, ottimizzare con
    // ON CONFLICT UPSERT su index parziale (translation_jobs_dedup_idx).
    for (const lang of input.targetLanguages) {
        const { data: existing, error: selectError } = await supabase
            .from("translation_jobs")
            .select("id")
            .eq("tenant_id", input.tenantId)
            .eq("entity_type", input.entityType)
            .eq("entity_id", input.entityId)
            .eq("field", input.field)
            .eq("target_language_code", lang)
            .eq("status", "pending")
            .maybeSingle();

        if (selectError) throw selectError;

        if (existing) {
            const { error: updateError } = await supabase
                .from("translation_jobs")
                .update({
                    source_text: input.sourceText,
                    source_hash: input.sourceHash
                })
                .eq("id", existing.id);
            if (updateError) throw updateError;
        } else {
            const { error: insertError } = await supabase
                .from("translation_jobs")
                .insert({
                    tenant_id: input.tenantId,
                    entity_type: input.entityType,
                    entity_id: input.entityId,
                    field: input.field,
                    target_language_code: lang,
                    source_text: input.sourceText,
                    source_hash: input.sourceHash,
                    status: "pending",
                    attempts: 0
                });
            if (insertError) throw insertError;
        }
    }
}
