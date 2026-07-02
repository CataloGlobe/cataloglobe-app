/**
 * Service layer per l'import AI in un catalogo esistente (FASE 2B).
 *
 * - `importProductsIntoCatalog` → wrapper della RPC atomica
 *   `import_products_into_catalog` (migration 20260630120000). L'import intero
 *   gira in transazione: qualsiasi errore fa rollback totale.
 * - `enqueueImportSideEffects` → side-effect post-RPC (traduzioni + revalidation
 *   cache pubblica), fire-and-forget con silent-error come il path per-riga.
 *
 * ⚠️ La RPC è SECURITY DEFINER ma la guardia usa `get_my_tenant_ids()` +
 * `has_permission_any_activity('catalogs.write', tenant)` sull'IDENTITÀ del
 * chiamante (`auth.uid()`). Va invocata col client user-scoped del frontend,
 * MAI con `service_role` (auth.uid() null → guardia blocca con 42501).
 */

import { supabase } from "@/services/supabase/client";
import { enqueueWithSilentError, serializeNotes } from "./translationJobs";
import { revalidatePublicCatalogForTenant } from "@services/publicCatalog/revalidatePublicCatalog";
import type {
    ImportManifest,
    ImportProductsIntoCatalogInput,
    V2ImportSummary
} from "@/types/aiImport";

/**
 * Esegue l'import atomico via RPC col client user-scoped.
 *
 * `error.code` atteso: `42501` (permesso mancante / tenant non accessibile /
 * catalogo o prodotto non del tenant). Convenzione service: si rilancia l'errore
 * al chiamante (che mostrerà il toast in 2C).
 */
export async function importProductsIntoCatalog(
    tenantId: string,
    input: ImportProductsIntoCatalogInput
): Promise<V2ImportSummary> {
    const { data, error } = await supabase.rpc("import_products_into_catalog", {
        p_tenant_id: tenantId,
        p_catalog_id: input.catalogId,
        p_new_catalog_name: input.newCatalogName,
        p_categories: input.categories,
        p_products: input.products
    });

    if (error) throw error;

    return data as V2ImportSummary;
}

/**
 * Accoda le traduzioni per le entità CREATE dall'import e invalida la cache
 * pubblica. Fire-and-forget: un fallimento qui NON deve rompere l'import (già
 * committato dalla RPC).
 *
 * - Prodotti creati: `summary.product_ids` è allineato per ORDINE alle entry
 *   `action="create"` del manifest (la RPC appende gli id nell'ordine di
 *   iterazione di `p_products`, solo per i create). Per ciascuno si accodano i
 *   job `description` / `product_notes` come farebbe createProduct.
 * - Categorie create: le entry con `existing_id === null`; il loro id reale è in
 *   `summary.category_ref_map[ref]`. Job `category.name`.
 * - Prodotti riusati: NON ri-accodati (esistono già, già tradotti).
 *
 * - Formats (`option_group` "Formati" + `option_value`): la RPC non ne ritorna
 *   gli id, ma i prodotti creati sono nuovi → si risolvono con 2 SELECT batch su
 *   `summary.product_ids` e si accodano le traduzioni `name` (mirror
 *   productOptions.ts:142/307). Solo creati; i riusati sono già tradotti.
 */
export async function enqueueImportSideEffects(
    tenantId: string,
    manifest: ImportManifest,
    summary: V2ImportSummary
): Promise<void> {
    try {
        const createEntries = manifest.products.filter(
            (p): p is Extract<ImportManifest["products"][number], { action: "create" }> =>
                p.action === "create"
        );

        const count = Math.min(createEntries.length, summary.product_ids.length);
        for (let i = 0; i < count; i++) {
            const payload = createEntries[i].product;
            const productId = summary.product_ids[i];

            if (payload.description_hash !== null) {
                await enqueueWithSilentError({
                    tenantId,
                    entityType: "product",
                    entityId: productId,
                    field: "description",
                    newSourceText: payload.description,
                    newSourceHash: payload.description_hash
                });
            }
            if (payload.notes_hash !== null) {
                await enqueueWithSilentError({
                    tenantId,
                    entityType: "product_notes",
                    entityId: productId,
                    field: "notes",
                    newSourceText: serializeNotes(payload.notes),
                    newSourceHash: payload.notes_hash
                });
            }
        }

        for (const cat of manifest.categories) {
            if (cat.existing_id !== null || cat.name_hash === null) continue;
            const categoryId = summary.category_ref_map[cat.ref];
            if (!categoryId) continue;
            await enqueueWithSilentError({
                tenantId,
                entityType: "category",
                entityId: categoryId,
                field: "name",
                newSourceText: cat.name,
                newSourceHash: cat.name_hash
            });
        }

        // Formats gap: la RPC non ritorna gli id di option_group/option_value, ma
        // i prodotti creati (summary.product_ids) sono nuovi → ogni gruppo/valore
        // con quel product_id appartiene a QUESTO import. Batch (non per-prodotto):
        // 2 SELECT + enqueue name per gruppo "Formati" (option_group) e per ogni
        // formato (option_value), mirror di productOptions.ts:142/307. name/name_hash
        // letti dal DB (inseriti verbatim dal manifest). Solo creati; i riusati
        // sono già tradotti e non compaiono in product_ids.
        if (summary.product_ids.length > 0) {
            const { data: groups, error: groupsErr } = await supabase
                .from("product_option_groups")
                .select("id, name, name_hash")
                .eq("tenant_id", tenantId)
                .in("product_id", summary.product_ids);
            if (groupsErr) throw groupsErr;

            const groupRows = (groups ?? []) as Array<{
                id: string;
                name: string;
                name_hash: string | null;
            }>;

            for (const g of groupRows) {
                if (g.name_hash === null) continue;
                await enqueueWithSilentError({
                    tenantId,
                    entityType: "option_group",
                    entityId: g.id,
                    field: "name",
                    newSourceText: g.name,
                    newSourceHash: g.name_hash
                });
            }

            const groupIds = groupRows.map(g => g.id);
            if (groupIds.length > 0) {
                const { data: values, error: valuesErr } = await supabase
                    .from("product_option_values")
                    .select("id, name, name_hash")
                    .eq("tenant_id", tenantId)
                    .in("option_group_id", groupIds);
                if (valuesErr) throw valuesErr;

                const valueRows = (values ?? []) as Array<{
                    id: string;
                    name: string;
                    name_hash: string | null;
                }>;

                for (const v of valueRows) {
                    if (v.name_hash === null) continue;
                    await enqueueWithSilentError({
                        tenantId,
                        entityType: "option_value",
                        entityId: v.id,
                        field: "name",
                        newSourceText: v.name,
                        newSourceHash: v.name_hash
                    });
                }
            }
        }
    } catch (err) {
        // enqueueWithSilentError già swallow-a; questo catch copre errori
        // inattesi (es. shape summary imprevista) senza rompere l'import.
        console.error("[aiImport] enqueue side-effects failed (non-blocking):", err);
    }

    void revalidatePublicCatalogForTenant(tenantId);
}
