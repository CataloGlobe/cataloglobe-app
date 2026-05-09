/**
 * Service layer per la tabella `translations`.
 *
 * Scope: lookup / list / delete delle traduzioni. NON include enqueue di job
 * (vive in translationJobs.ts) e NON include refresh di translations
 * generate via DeepL (vive nell'edge function process-translation-jobs,
 * Prompt 7).
 *
 * Ref: docs/translations-architecture-v3.md sez. 4.5, 6.1.
 */

import { supabase } from "@/services/supabase/client";
import type {
    Translation,
    TranslationEntityType,
    TranslationField,
    TenantLanguage
} from "@/types/translations";

/**
 * Fetch tutte le translations di un'entità per un tenant.
 *
 * Include eventuali system translations (tenant_id IS NULL) per allergen,
 * characteristic, attr_def, attr_def_option — coerente con la lookup
 * pubblica della RPC get_public_translations. La policy RLS
 * `translations_select` ammette tenant_id IS NULL per authenticated.
 */
export async function listTranslationsForEntity(
    tenantId: string,
    entityType: TranslationEntityType,
    entityId: string
): Promise<Translation[]> {
    const { data, error } = await supabase
        .from("translations")
        .select("*")
        .eq("entity_type", entityType)
        .eq("entity_id", entityId)
        .or(`tenant_id.eq.${tenantId},tenant_id.is.null`);

    if (error) throw error;
    return (data ?? []) as Translation[];
}

/**
 * Cancella le translations per un'entità + field opzionale.
 *
 * Usata dal service layer quando il source diventa null/vuoto (es. il tenant
 * cancella la description di un prodotto): il caller calcola
 * `computeFieldHash(null) === null` e invoca questa funzione invece di
 * `enqueueTranslationJobsIfChanged`.
 *
 * Sicurezza: filtro `eq("tenant_id", tenantId)` blocca cancellazioni di system
 * translations (tenant_id IS NULL). RLS rinforza il vincolo.
 */
export async function deleteTranslationsForEntity(
    tenantId: string,
    entityType: TranslationEntityType,
    entityId: string,
    field?: TranslationField
): Promise<void> {
    let query = supabase
        .from("translations")
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

/**
 * Lingue di traduzione attive per un tenant. NON include la lingua base
 * (vive su tenants.base_language_code).
 *
 * Un tenant senza translations attive ritorna un array vuoto — comportamento
 * di default per nuovi tenant.
 */
export async function getActiveTenantLanguages(
    tenantId: string
): Promise<TenantLanguage[]> {
    const { data, error } = await supabase
        .from("tenant_languages")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("is_active", true);

    if (error) throw error;
    return (data ?? []) as TenantLanguage[];
}

/**
 * Scrive (o aggiorna) una traduzione manuale per un'entità + lingua.
 *
 * Usata dal pannello override traduzioni (variante C2). Invoca la RPC
 * `upsert_manual_translation`, che gira SECURITY DEFINER e applica:
 *   - tenant guard via get_my_tenant_ids()
 *   - validazione source_text/translated_text non vuoti
 *   - validazione language_code presente in supported_languages
 *
 * Sovrascrive incondizionatamente eventuale riga esistente (auto o manual
 * precedente). status='manual', provider='manual'.
 */
export async function upsertManualTranslation(input: {
    tenantId: string;
    entityType: TranslationEntityType;
    entityId: string;
    field: TranslationField;
    languageCode: string;
    sourceText: string;
    sourceHash: string;
    translatedText: string;
}): Promise<void> {
    const { error } = await supabase.rpc("upsert_manual_translation", {
        p_tenant_id: input.tenantId,
        p_entity_type: input.entityType,
        p_entity_id: input.entityId,
        p_field: input.field,
        p_language_code: input.languageCode,
        p_source_text: input.sourceText,
        p_source_hash: input.sourceHash,
        p_translated_text: input.translatedText
    });

    if (error) {
        if (error.code === "42501") {
            throw new Error("Operazione non autorizzata");
        }
        if (error.code === "22023") {
            throw new Error(error.message);
        }
        throw error;
    }
}

/**
 * Cancella la traduzione manuale per (entity, field, lingua) e accoda un
 * translation_job per ri-tradurre automaticamente lo stesso source.
 *
 * Invoca la RPC `revert_manual_translation`. La RPC verifica tenant
 * authz e l'esistenza della riga manual; se assente, lancia `P0002`.
 */
export async function revertManualTranslation(input: {
    tenantId: string;
    entityType: TranslationEntityType;
    entityId: string;
    field: TranslationField;
    languageCode: string;
}): Promise<void> {
    const { error } = await supabase.rpc("revert_manual_translation", {
        p_tenant_id: input.tenantId,
        p_entity_type: input.entityType,
        p_entity_id: input.entityId,
        p_field: input.field,
        p_language_code: input.languageCode
    });

    if (error) {
        if (error.code === "42501") {
            throw new Error("Operazione non autorizzata");
        }
        if (error.code === "P0002") {
            throw new Error("Traduzione manuale non trovata");
        }
        throw error;
    }
}

/**
 * Lingua base del tenant (es. 'it'). Letta da tenants.base_language_code,
 * source of truth dopo la decisione architetturale Opzione B (Prompt 1):
 * la base NON vive in tenant_languages.
 *
 * Throws se il tenant non esiste (PGRST116).
 */
export async function getTenantBaseLanguage(tenantId: string): Promise<string> {
    const { data, error } = await supabase
        .from("tenants")
        .select("base_language_code")
        .eq("id", tenantId)
        .single();

    if (error) {
        if (error.code === "PGRST116") {
            throw new Error(`Tenant non trovato: ${tenantId}`);
        }
        throw error;
    }

    return data.base_language_code as string;
}
