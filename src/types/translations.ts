/**
 * Tipi del sistema traduzioni multi-lingua.
 *
 * Convention naming: snake_case sui field DB (matching diretto con
 * `translations` / `translation_jobs` / `tenant_languages`). Coerente con
 * il pattern del resto del service layer (vedi allergens.ts, featuredContents.ts).
 *
 * `ProductNote` NON è ridefinita qui: l'unica source of truth resta
 * `@/services/supabase/products`, che la valida via `validateProductNotes`.
 *
 * Ref: docs/translations-architecture-v3.md sez. 4.2.
 */

/**
 * Entità tradotte. Il valore è il discriminator che vive in
 * `translations.entity_type` + `translation_jobs.entity_type`.
 *
 * - `product_notes` è distinto da `product` perché serve un'unica row per
 *   l'intero JSONB array (vedi sez. 2.4 v3 + Q-CN10).
 * - `attr_def_option` usa composite key `{def_id}:{option_value}` come
 *   `entity_id` (sez. 2.2 v3).
 */
export type TranslationEntityType =
    | "product"
    | "product_notes"
    | "featured"
    | "featured_product"
    | "category"
    | "allergen"
    | "characteristic"
    | "ingredient"
    | "option_group"
    | "option_value"
    | "attr_def"
    | "attr_def_option"
    | "attr_value"
    | "variant_dim"
    | "variant_dim_value"
    | "closure";

/**
 * Field traducibili. Una stessa entity può avere più field
 * (es. featured_contents → title/subtitle/description/cta_text).
 */
export type TranslationField =
    | "description"
    | "title"
    | "subtitle"
    | "name"
    | "label"
    | "cta_text"
    | "note"
    | "notes"
    | "value_text";

export type TranslationProvider = "deepl" | "google" | "manual" | "system";
export type TranslationStatus = "auto" | "manual" | "overridden";

/**
 * Riga della tabella `translations`. tenant_id NULL ammesso solo per
 * system entities (allergen, characteristic, attr_def, attr_def_option) —
 * vincolo enforced da CHECK constraint `translations_system_entity_only_null_tenant`.
 */
export type Translation = {
    id: string;
    tenant_id: string | null;
    entity_type: TranslationEntityType;
    entity_id: string;
    field: TranslationField;
    language_code: string;
    source_text: string;
    source_hash: string;
    translated_text: string;
    provider: TranslationProvider;
    status: TranslationStatus;
    created_at: string;
    updated_at: string;
};

export type TranslationJobStatus = "pending" | "processing" | "done" | "failed";

/**
 * Riga di `translation_jobs`. Consumata dal job processor (Prompt 7) con
 * FOR UPDATE SKIP LOCKED LIMIT 50.
 */
export type TranslationJob = {
    id: string;
    tenant_id: string | null;
    entity_type: TranslationEntityType;
    entity_id: string;
    field: TranslationField;
    target_language_code: string;
    source_text: string;
    source_hash: string;
    status: TranslationJobStatus;
    attempts: number;
    last_error: string | null;
    created_at: string;
    processed_at: string | null;
};

/**
 * Riga di `tenant_languages`. NB: la lingua base NON entra qui (vive su
 * tenants.base_language_code ed è implicitamente sempre attiva).
 */
export type TenantLanguage = {
    id: string;
    tenant_id: string;
    language_code: string;
    is_active: boolean;
    created_at: string;
};
