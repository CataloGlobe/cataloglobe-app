import { supabase } from "./client";
import type { TranslationEntityType, TranslationField } from "@/types/translations";

export type SupportedLanguage = {
    code: string;
    name_native: string;
    name_en: string;
    name_it: string;
    flag_emoji: string | null;
    is_available: boolean;
};

export type TenantLanguage = {
    id: string;
    tenant_id: string;
    language_code: string;
    is_active: boolean;
    created_at: string;
};

/**
 * Lista lingue supportate dalla piattaforma (curated, is_available=true).
 * Usato dalla pagina Settings → Lingue per popolare l'elenco selezionabile.
 */
export async function listAvailableLanguages(): Promise<SupportedLanguage[]> {
    const { data, error } = await supabase
        .from("supported_languages")
        .select("code, name_native, name_en, name_it, flag_emoji, is_available")
        .eq("is_available", true)
        .order("sort_order");
    if (error) throw error;
    return (data ?? []) as SupportedLanguage[];
}

/**
 * Lingue attive per un tenant. Lista include sia righe is_active=true
 * sia is_active=false (storico lingue mai più attivate). Caller filtra.
 */
export async function listTenantLanguages(tenantId: string): Promise<TenantLanguage[]> {
    const { data, error } = await supabase
        .from("tenant_languages")
        .select("id, tenant_id, language_code, is_active, created_at")
        .eq("tenant_id", tenantId);
    if (error) throw error;
    return (data ?? []) as TenantLanguage[];
}

/**
 * Attiva una lingua per il tenant + lazy backfill.
 *
 * ⚠️ ORDINE CRITICO:
 *   1. UPSERT tenant_languages PRIMA: la RPC backfill verifica che la lingua
 *      sia is_active=true per il tenant (defense-in-depth security check).
 *   2. SOLO POI chiamare la RPC.
 *
 * Errore RPC NON blocca attivazione: la lingua resta attiva in tenant_languages.
 * Il backfill può essere ri-tentato manualmente (UI futura) o si attende che
 * gli utenti modifichino contenuti (trigger in-place via enqueueTranslationJobsIfChanged).
 */
export async function activateTenantLanguage(
    tenantId: string,
    languageCode: string
): Promise<{ jobsCreated: number }> {
    const { error: upsertError } = await supabase
        .from("tenant_languages")
        .upsert(
            {
                tenant_id: tenantId,
                language_code: languageCode,
                is_active: true
            },
            { onConflict: "tenant_id,language_code" }
        );
    if (upsertError) throw upsertError;

    const { data: jobsCreated, error: rpcError } = await supabase.rpc(
        "enqueue_tenant_language_backfill",
        { p_tenant_id: tenantId, p_target_lang: languageCode }
    );
    if (rpcError) {
        console.error("[tenantLanguages] backfill failed (non-blocking):", rpcError);
    }

    return { jobsCreated: typeof jobsCreated === "number" ? jobsCreated : 0 };
}

/**
 * Disattiva una lingua per il tenant. Translations restano in DB
 * (re-attivazione in futuro = gratuita, niente nuovo backfill se source invariato).
 */
export async function deactivateTenantLanguage(
    tenantId: string,
    languageCode: string
): Promise<void> {
    const { error } = await supabase
        .from("tenant_languages")
        .update({ is_active: false })
        .eq("tenant_id", tenantId)
        .eq("language_code", languageCode);
    if (error) throw error;
}

export type LanguageProgress = {
    lang: string;
    pending: number;
    done: number;
    error: number;
    total: number;
};

export type TranslationProgress = {
    by_lang: LanguageProgress[];
    total_pending: number;
    total_error: number;
    total_done: number;
};

const EMPTY_PROGRESS: TranslationProgress = {
    by_lang: [],
    total_pending: 0,
    total_error: 0,
    total_done: 0
};

/**
 * Aggrega translation_jobs per (tenant, target_language_code, status).
 * RPC SECURITY DEFINER con membership check via tenant_memberships.
 *
 * Status mapping (DB → output):
 *   - 'pending'    → pending
 *   - 'processing' → pending (in corso)
 *   - 'done'       → done
 *   - 'failed'     → error
 *
 * Polling consigliato: ogni 5 sec se total_pending > 0; stop quando 0.
 */
export async function getTranslationProgress(
    tenantId: string
): Promise<TranslationProgress> {
    const { data, error } = await supabase.rpc("get_translation_progress", {
        p_tenant_id: tenantId
    });
    if (error) throw error;
    if (!data) return EMPTY_PROGRESS;
    return data as TranslationProgress;
}

/**
 * Copertura traduzioni entity-level, hash-aware, per UNA lingua attiva.
 * A differenza di LanguageProgress (job-level, cumulativo), classifica ogni unità
 * traducibile confrontando source_hash col contenuto sorgente attuale.
 * Invariante server-side: fresh + stale + pending + failed + missing = total.
 */
export type LanguageCoverage = {
    total: number;
    fresh: number;
    stale: number;
    pending: number;
    failed: number;
    missing: number;
    last_updated: string | null;
};

/** Mappa per lingua attiva: { <language_code>: LanguageCoverage }. */
export type TranslationCoverage = Record<string, LanguageCoverage>;

/**
 * Copertura onesta delle traduzioni per ogni lingua attiva del tenant.
 * RPC SECURITY DEFINER get_translation_coverage (access check via get_my_tenant_ids).
 * Ritorna solo le lingue ATTIVE; le inattive non compaiono.
 *
 * Polling consigliato: ogni 5 sec finché qualche lingua ha pending > 0; stop a 0.
 */
export async function getTranslationCoverage(
    tenantId: string
): Promise<TranslationCoverage> {
    const { data, error } = await supabase.rpc("get_translation_coverage", {
        p_tenant_id: tenantId
    });
    if (error) throw error;
    if (!data) return {};
    return data as TranslationCoverage;
}

/**
 * Elemento "da rivedere" restituito da get_stale_translations: una traduzione
 * rimasta indietro rispetto all'italiano (kind 'stale') o mai prodotta ('missing').
 */
export type StaleTranslationKind = "stale" | "missing";

export type StaleTranslationItem = {
    entity_type: TranslationEntityType;
    entity_id: string;
    field: TranslationField;
    name: string;
    source_text: string;
    status: "manual" | "overridden" | "auto" | null;
    kind: StaleTranslationKind;
};

/**
 * Lista degli elementi "da rivedere" per una lingua (kind stale|missing).
 * RPC SECURITY DEFINER get_stale_translations. Stesso universo della coverage:
 * length() == sum(stale + missing) della lingua nella copertura.
 *
 * Chiamata LAZY (solo all'apertura del drawer "Da rivedere"), niente polling.
 */
export async function getStaleTranslations(
    tenantId: string,
    languageCode: string
): Promise<StaleTranslationItem[]> {
    const { data, error } = await supabase.rpc("get_stale_translations", {
        p_tenant_id: tenantId,
        p_language_code: languageCode
    });
    if (error) throw error;
    if (!data) return [];
    return data as StaleTranslationItem[];
}

/**
 * Resetta tutti i translation_jobs status='failed' del tenant a 'pending',
 * azzerando last_error e attempts. Il cron li riprende al prossimo ciclo.
 * Ritorna count righe aggiornate.
 */
export async function retryAllFailedTranslations(tenantId: string): Promise<number> {
    const { data, error } = await supabase.rpc("retry_all_failed_translations", {
        p_tenant_id: tenantId
    });
    if (error) throw error;
    return typeof data === "number" ? data : 0;
}
