/**
 * Tipi del manifest di import AI in catalogo esistente (FASE 2B).
 *
 * Rispecchiano 1:1 il contratto della RPC atomica
 * `import_products_into_catalog` (migration 20260630120000): il client
 * pre-formatta ogni valore (inclusi gli hash traduzione) e la RPC non deriva
 * nulla. Vedi lo schema MANIFEST nel commento di testa della migration.
 */

import type { ProductNote } from "@/services/supabase/products";

/** Categoria di destinazione risolta per `ref` simbolico. */
export interface ImportManifestCategory {
    /** Chiave simbolica univoca nel manifest. */
    ref: string;
    /** Se valorizzato → usa esistente; se null → crea. */
    existing_id: string | null;
    name: string;
    /** Richiesto in create (hash canonical client-computed); null se esistente. */
    name_hash: string | null;
    level: 1 | 2 | 3;
    /** `ref` di un'altra categoria del manifest, o null. */
    parent_ref: string | null;
    sort_order: number;
}

/** Formato (option value PRIMARY_PRICE "Formati"). */
export interface ImportManifestFormat {
    name: string;
    absolute_price: number | null;
    name_hash: string | null;
}

/** Payload prodotto GIÀ formato per `action="create"` (verbatim, nessuna derivazione lato RPC). */
export interface ImportManifestProductPayload {
    name: string;
    description: string | null;
    base_price: number | null;
    image_url: string | null;
    product_type: "simple" | "formats";
    variant_strategy: "manual";
    notes: ProductNote[];
    description_hash: string | null;
    notes_hash: string | null;
    /** name_hash del gruppo "Formati" (solo formats). */
    format_group_name_hash: string | null;
    formats: ImportManifestFormat[];
}

export type ImportManifestProduct =
    | {
          action: "create";
          category_ref: string;
          sort_order: number;
          product: ImportManifestProductPayload;
      }
    | {
          action: "reuse";
          category_ref: string;
          sort_order: number;
          product_id: string;
      };

/** Output di `buildImportManifest`: le due liste passate verbatim alla RPC. */
export interface ImportManifest {
    categories: ImportManifestCategory[];
    products: ImportManifestProduct[];
}

/** Return della RPC `import_products_into_catalog`. */
export interface V2ImportSummary {
    catalog_id: string;
    created_categories: number;
    created_products: number;
    reused_products: number;
    skipped: number;
    product_ids: string[];
    /** ref → category_id per TUTTE le categorie del manifest (create + esistenti). */
    category_ref_map: Record<string, string>;
}

/** Input del wrapper `importProductsIntoCatalog`. */
export interface ImportProductsIntoCatalogInput {
    /** null → crea nuovo catalogo da `newCatalogName`. */
    catalogId: string | null;
    newCatalogName: string | null;
    categories: ImportManifestCategory[];
    products: ImportManifestProduct[];
}
