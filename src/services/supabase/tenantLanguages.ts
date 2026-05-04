import { supabase } from "./client";

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
