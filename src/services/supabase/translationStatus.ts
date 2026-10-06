import { supabase } from "./client";

export type FieldTranslationStatus = {
    field: string;
    totalLanguages: number;
    doneCount: number;
    pendingCount: number;
    errorCount: number;
    /**
     * Traduzioni manuali rimaste indietro rispetto al sorgente IT corrente
     * (source_hash ≠ hash entità). Le auto stale diventano `pending` (job di
     * ri-traduzione), quindi NON contano qui — solo le manual da rivedere.
     */
    staleCount: number;
    sourceHash: string | null;
    lastError?: string;
    /**
     * Lo stato lingua per lingua (riga traduzioni della Scheda, PS3), nello
     * stesso ordine di `tenant_languages`. `missing`: né traduzione attuale né
     * job in coda.
     */
    languages?: FieldLanguageStatus[];
};

export type FieldLanguageState = "done" | "pending" | "failed" | "stale" | "missing";

export type FieldLanguageStatus = {
    code: string;
    state: FieldLanguageState;
};

export type SupportedEntityField =
    | { entityType: "product"; field: "description" }
    | { entityType: "product"; field: "notes" };

/**
 * Lookup tabella + colonna hash per (entity_type, field).
 * Restituisce null se entity non trovata o hash non valorizzato.
 */
async function fetchEntitySourceHash(
    entityType: string,
    entityId: string,
    field: string
): Promise<string | null> {
    if (entityType === "product" && field === "description") {
        const { data, error } = await supabase
            .from("products")
            .select("description_hash")
            .eq("id", entityId)
            .maybeSingle();
        if (error) throw error;
        return data?.description_hash ?? null;
    }
    if (entityType === "product" && field === "notes") {
        const { data, error } = await supabase
            .from("products")
            .select("notes_hash")
            .eq("id", entityId)
            .maybeSingle();
        if (error) throw error;
        return data?.notes_hash ?? null;
    }
    throw new Error(`Unsupported entity_type/field: ${entityType}/${field}`);
}

/**
 * Stato delle translations per un campo specifico di un'entità.
 *
 * Logica:
 *   - totalLanguages = tenant_languages attive (escluso base 'it' implicito).
 *   - sourceHash = hash corrente del campo dell'entità.
 *   - jobs/translations filtrate per source_hash CORRENTE: quelle obsolete
 *     (relative a versioni precedenti del source) non contano.
 *
 * Casi nascosti:
 *   - totalLanguages === 0 → nessuna lingua attiva (banner-zero handled by UI).
 *   - sourceHash === null  → field source vuoto/null (banner-zero handled by UI).
 */
export async function getFieldTranslationStatus(
    tenantId: string,
    entityType: string,
    entityId: string,
    field: string
): Promise<FieldTranslationStatus> {
    const { data: tenantLangs, error: langsError } = await supabase
        .from("tenant_languages")
        .select("language_code")
        .eq("tenant_id", tenantId)
        .eq("is_active", true);
    if (langsError) throw langsError;

    const totalLanguages = (tenantLangs ?? []).length;
    const languageCodes = (tenantLangs ?? []).map(l => l.language_code as string);

    if (totalLanguages === 0) {
        return {
            field,
            totalLanguages: 0,
            doneCount: 0,
            pendingCount: 0,
            errorCount: 0,
            staleCount: 0,
            sourceHash: null
        };
    }

    const sourceHash = await fetchEntitySourceHash(entityType, entityId, field);

    if (sourceHash === null) {
        return {
            field,
            totalLanguages,
            doneCount: 0,
            pendingCount: 0,
            errorCount: 0,
            staleCount: 0,
            sourceHash: null,
            languages: languageCodes.map(code => ({ code, state: "missing" as const }))
        };
    }

    const [jobsRes, translationsRes] = await Promise.all([
        supabase
            .from("translation_jobs")
            .select("status, target_language_code, last_error")
            .eq("tenant_id", tenantId)
            .eq("entity_type", entityType)
            .eq("entity_id", entityId)
            .eq("field", field)
            .eq("source_hash", sourceHash),
        // Tutte le translations del campo (qualunque source_hash): serve per
        // distinguere fresh (= corrente) da stale (= manual indietro).
        supabase
            .from("translations")
            .select("language_code, status, source_hash")
            .eq("tenant_id", tenantId)
            .eq("entity_type", entityType)
            .eq("entity_id", entityId)
            .eq("field", field)
    ]);

    if (jobsRes.error) throw jobsRes.error;
    if (translationsRes.error) throw translationsRes.error;

    const jobs = jobsRes.data ?? [];
    const translations = translationsRes.data ?? [];

    const doneCount = translations.filter(tr => tr.source_hash === sourceHash).length;
    const staleCount = translations.filter(
        tr =>
            (tr.status === "manual" || tr.status === "overridden") &&
            tr.source_hash !== sourceHash
    ).length;
    // Stati del DB (translation_jobs_status_check): pending · processing · done · failed.
    const errorCount = jobs.filter(j => j.status === "failed").length;
    const pendingCount = jobs.filter(j => j.status === "pending" || j.status === "processing").length;
    const lastErrorJob = jobs.find(j => j.status === "failed" && j.last_error);

    // Prima il job in corso o fallito (l'ultima parola sul sorgente attuale),
    // poi la traduzione: attuale, oppure manuale rimasta indietro.
    const languages = languageCodes.map((code): FieldLanguageStatus => {
        const job = jobs.find(j => j.target_language_code === code);
        if (job?.status === "failed") return { code, state: "failed" };
        if (job?.status === "pending" || job?.status === "processing") return { code, state: "pending" };
        const tr = translations.find(t => t.language_code === code);
        if (tr?.source_hash === sourceHash) return { code, state: "done" };
        if (tr && (tr.status === "manual" || tr.status === "overridden")) return { code, state: "stale" };
        return { code, state: "missing" };
    });

    return {
        field,
        totalLanguages,
        doneCount,
        pendingCount,
        errorCount,
        staleCount,
        sourceHash,
        languages,
        ...(lastErrorJob?.last_error ? { lastError: lastErrorJob.last_error } : {})
    };
}

/**
 * Retry job failed → pending. Reset attempts/last_error.
 * Se languageCode omesso, retry tutte le lingue in errore per (entity, field).
 */
export async function retryFailedTranslation(
    tenantId: string,
    entityType: string,
    entityId: string,
    field: string,
    languageCode?: string
): Promise<void> {
    let query = supabase
        .from("translation_jobs")
        .update({ status: "pending", attempts: 0, last_error: null })
        .eq("tenant_id", tenantId)
        .eq("entity_type", entityType)
        .eq("entity_id", entityId)
        .eq("field", field)
        .eq("status", "failed");

    if (languageCode) {
        query = query.eq("target_language_code", languageCode);
    }

    const { error } = await query;
    if (error) throw error;
}
