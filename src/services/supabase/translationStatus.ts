import { supabase } from "./client";

export type FieldTranslationStatus = {
    field: string;
    totalLanguages: number;
    doneCount: number;
    pendingCount: number;
    errorCount: number;
    sourceHash: string | null;
    lastError?: string;
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

    if (totalLanguages === 0) {
        return {
            field,
            totalLanguages: 0,
            doneCount: 0,
            pendingCount: 0,
            errorCount: 0,
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
            sourceHash: null
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
        supabase
            .from("translations")
            .select("language_code")
            .eq("tenant_id", tenantId)
            .eq("entity_type", entityType)
            .eq("entity_id", entityId)
            .eq("field", field)
            .eq("source_hash", sourceHash)
    ]);

    if (jobsRes.error) throw jobsRes.error;
    if (translationsRes.error) throw translationsRes.error;

    const jobs = jobsRes.data ?? [];
    const translations = translationsRes.data ?? [];

    const doneCount = translations.length;
    const errorCount = jobs.filter(j => j.status === "error").length;
    const pendingCount = jobs.filter(j => j.status === "pending").length;
    const lastErrorJob = jobs.find(j => j.status === "error" && j.last_error);

    return {
        field,
        totalLanguages,
        doneCount,
        pendingCount,
        errorCount,
        sourceHash,
        ...(lastErrorJob?.last_error ? { lastError: lastErrorJob.last_error } : {})
    };
}

/**
 * Retry job error → pending. Reset attempts/last_error.
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
        .eq("status", "error");

    if (languageCode) {
        query = query.eq("target_language_code", languageCode);
    }

    const { error } = await query;
    if (error) throw error;
}
