import { supabase } from "@/services/supabase/client";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { getProductAttributes, setProductAttributeValue } from "./attributes";
import { getProductAllergens, setProductAllergens } from "./allergens";
import { getProductGroupAssignments, assignProductToGroup } from "./productGroups";
import { computeFieldHash, computeNotesHash } from "@/services/translation/hashUtils";
import {
    enqueueWithSilentError,
    serializeNotes,
    deleteTranslationJobsForEntity
} from "./translationJobs";
import { deleteTranslationsForEntity } from "./translations";
import { deleteProductImageBestEffort } from "./upload";
import { revalidatePublicCatalogForTenant } from "@services/publicCatalog/revalidatePublicCatalog";

export type ProductType = "simple" | "formats" | "configurable";

export type VariantStrategy = "manual" | "matrix";

/** Single key-value note attached to a product. */
export type ProductNote = {
    label: string;
    value: string;
};

export type V2Product = {
    id: string;
    tenant_id: string;
    name: string;
    description: string | null;
    base_price: number | null;
    parent_product_id: string | null;
    image_url: string | null;
    product_type: ProductType;
    variant_strategy?: VariantStrategy;
    /**
     * Structured notes. Always an array (DB DEFAULT '[]'). Validated by
     * `validateProductNotes()` at create/update time.
     */
    notes: ProductNote[];
    /** Hash dei source field per traduzioni (Prompt 7+). Esposto da getProduct (SELECT *). */
    description_hash?: string | null;
    notes_hash?: string | null;
    created_at: string;
    updated_at: string;
    // Joined
    variants?: V2Product[];
};

const MAX_NOTES_PER_PRODUCT = 10;
const MAX_NOTE_LABEL_LENGTH = 100;
const MAX_NOTE_VALUE_LENGTH = 500;

/**
 * Normalizes and validates a product `notes` payload before write.
 *
 * - Returns an empty array for null/undefined input (treated as "clear notes").
 * - Trims label and value of each entry; entries with both empty are dropped.
 * - Rejects entries with empty label.
 * - Rejects array longer than 10 entries, labels > 100 chars, values > 500 chars.
 *
 * Throws Error with a human-readable Italian message on validation failure.
 */
export function validateProductNotes(notes: unknown): ProductNote[] {
    if (notes === undefined || notes === null) return [];
    if (!Array.isArray(notes)) {
        throw new Error("Le note devono essere un array di oggetti {label, value}.");
    }
    if (notes.length > MAX_NOTES_PER_PRODUCT) {
        throw new Error(`Massimo ${MAX_NOTES_PER_PRODUCT} note per prodotto.`);
    }
    const cleaned: ProductNote[] = [];
    for (const item of notes) {
        if (!item || typeof item !== "object") continue;
        const candidate = item as { label?: unknown; value?: unknown };
        const label = String(candidate.label ?? "").trim();
        const value = String(candidate.value ?? "").trim();
        if (label === "" && value === "") continue;
        if (label === "") {
            throw new Error("Ogni nota deve avere un'etichetta non vuota.");
        }
        if (label.length > MAX_NOTE_LABEL_LENGTH) {
            throw new Error(`L'etichetta della nota è troppo lunga (max ${MAX_NOTE_LABEL_LENGTH} caratteri).`);
        }
        if (value.length > MAX_NOTE_VALUE_LENGTH) {
            throw new Error(`Il valore della nota è troppo lungo (max ${MAX_NOTE_VALUE_LENGTH} caratteri).`);
        }
        cleaned.push({ label, value });
    }
    return cleaned;
}

export type ProductListMetadata = {
    formatsCount: number;
    configurationsCount: number;
    catalogsCount: number;
    fromPrice: number | null;
};

type ProductOptionGroupListRow = {
    id: string;
    product_id: string;
    group_kind: "PRIMARY_PRICE" | "ADDON";
};

type ProductOptionValueListRow = {
    option_group_id: string;
    absolute_price: number | null;
};

type CatalogCategoryProductListRow = {
    product_id: string;
    catalog_id: string;
};

export async function getProductListMetadata(
    tenantId: string,
    productIds: string[]
): Promise<Record<string, ProductListMetadata>> {
    const uniqueProductIds = Array.from(new Set(productIds.filter(Boolean)));
    const metadataByProductId: Record<string, ProductListMetadata> = {};

    for (const productId of uniqueProductIds) {
        metadataByProductId[productId] = {
            formatsCount: 0,
            configurationsCount: 0,
            catalogsCount: 0,
            fromPrice: null
        };
    }

    if (uniqueProductIds.length === 0) {
        return metadataByProductId;
    }

    const [groupsRes, catalogItemsRes] = await Promise.all([
        supabase
            .from("product_option_groups")
            .select("id, product_id, group_kind")
            .eq("tenant_id", tenantId)
            .in("product_id", uniqueProductIds),
        supabase
            .from("catalog_category_products")
            .select("product_id, catalog_id")
            .eq("tenant_id", tenantId)
            .in("product_id", uniqueProductIds)
    ]);

    if (groupsRes.error) throw groupsRes.error;
    if (catalogItemsRes.error) throw catalogItemsRes.error;

    const primaryGroupToProductId = new Map<string, string>();
    const groups = (groupsRes.data ?? []) as ProductOptionGroupListRow[];

    for (const group of groups) {
        const meta = metadataByProductId[group.product_id];
        if (!meta) continue;

        if (group.group_kind === "ADDON") {
            meta.configurationsCount += 1;
            continue;
        }

        primaryGroupToProductId.set(group.id, group.product_id);
    }

    if (primaryGroupToProductId.size > 0) {
        const primaryGroupIds = Array.from(primaryGroupToProductId.keys());
        const { data: values, error: valuesError } = await supabase
            .from("product_option_values")
            .select("option_group_id, absolute_price")
            .eq("tenant_id", tenantId)
            .in("option_group_id", primaryGroupIds);

        if (valuesError) throw valuesError;

        for (const value of (values ?? []) as ProductOptionValueListRow[]) {
            const productId = primaryGroupToProductId.get(value.option_group_id);
            if (!productId) continue;

            const meta = metadataByProductId[productId];
            if (!meta) continue;

            meta.formatsCount += 1;

            if (typeof value.absolute_price === "number") {
                meta.fromPrice =
                    meta.fromPrice === null
                        ? value.absolute_price
                        : Math.min(meta.fromPrice, value.absolute_price);
            }
        }
    }

    const catalogIdsByProductId = new Map<string, Set<string>>();
    const catalogItems = (catalogItemsRes.data ?? []) as CatalogCategoryProductListRow[];

    for (const item of catalogItems) {
        const catalogIds = catalogIdsByProductId.get(item.product_id) ?? new Set<string>();
        catalogIds.add(item.catalog_id);
        catalogIdsByProductId.set(item.product_id, catalogIds);
    }

    for (const [productId, catalogIds] of catalogIdsByProductId.entries()) {
        const meta = metadataByProductId[productId];
        if (!meta) continue;
        meta.catalogsCount = catalogIds.size;
    }

    return metadataByProductId;
}

/**
 * Validates cross-tenant and nested variant conditions application-side
 * before hitting the database (which would also block it via the new trigger).
 */
async function validateParentBeforeSave(tenantId: string, parentId?: string | null) {
    if (!parentId) return;

    const { data: parent, error } = await supabase
        .from("products")
        .select("tenant_id, parent_product_id")
        .eq("id", parentId)
        .single();

    if (error) {
        if (error.code === "PGRST116") {
            throw new Error(`Parent product ${parentId} not found.`);
        }
        throw error;
    }

    if (parent.tenant_id !== tenantId) {
        throw new Error("Cannot link product to a parent belonging to a different tenant.");
    }

    if (parent.parent_product_id !== null) {
        throw new Error(
            "Cannot create a variant of a variant. The chosen parent is already a variant."
        );
    }
}

/**
 * Recomputes and persists product_type for a base product based on its actual data:
 *   - "configurable" if it has child variants
 *   - "formats"      if it has a PRIMARY_PRICE option group
 *   - "simple"       otherwise
 *
 * Must only be called on base products (parent_product_id IS NULL).
 * Not exported — called internally after every write that changes pricing structure.
 */
async function recomputeProductType(productId: string, tenantId: string): Promise<void> {
    const { count: variantCount, error: vcErr } = await supabase
        .from("products")
        .select("id", { count: "exact", head: true })
        .eq("parent_product_id", productId)
        .eq("tenant_id", tenantId);
    if (vcErr) throw vcErr;

    if ((variantCount ?? 0) > 0) {
        const { error } = await supabase
            .from("products")
            .update({ product_type: "configurable" as ProductType })
            .eq("id", productId)
            .eq("tenant_id", tenantId);
        if (error) throw error;
        return;
    }

    const { count: fmtCount, error: fmtErr } = await supabase
        .from("product_option_groups")
        .select("id", { count: "exact", head: true })
        .eq("product_id", productId)
        .eq("group_kind", "PRIMARY_PRICE");
    if (fmtErr) throw fmtErr;

    const newType: ProductType = (fmtCount ?? 0) > 0 ? "formats" : "simple";
    const { error } = await supabase
        .from("products")
        .update({ product_type: newType })
        .eq("id", productId)
        .eq("tenant_id", tenantId);
    if (error) throw error;
}

export async function listBaseProductsWithVariants(tenantId: string): Promise<V2Product[]> {
    const { data, error } = await supabase
        .from("products")
        .select(
            `
            *,
            variants:products!parent_product_id(*)
        `
        )
        .eq("tenant_id", tenantId)
        .is("parent_product_id", null) // Only fetch base products at root level
        .order("created_at", { ascending: false });

    if (error) throw error;
    return data || [];
}

export async function getProduct(id: string, tenantId: string): Promise<V2Product> {
    const { data, error } = await supabase
        .from("products")
        .select(
            `
            *,
            variants:products!parent_product_id(*)
        `
        )
        .eq("id", id)
        .eq("tenant_id", tenantId)
        .single();

    if (error) throw error;
    return data;
}

export async function createProduct(
    tenantId: string,
    data: {
        name: string;
        description?: string | null;
        base_price?: number | null;
        image_url?: string | null;
        product_type?: ProductType;
        notes?: ProductNote[];
    },
    parentId?: string | null
): Promise<V2Product> {
    await validateParentBeforeSave(tenantId, parentId);

    const resolvedProductType: ProductType = data.product_type ?? "simple";
    const validatedNotes = validateProductNotes(data.notes);
    const description = data.description || null;

    // Hash translation fields (canonical form) prima dell'INSERT.
    const descriptionHash = await computeFieldHash(description);
    const notesHash = await computeNotesHash(validatedNotes);

    const { data: newProduct, error } = await supabase
        .from("products")
        .insert({
            id: crypto.randomUUID(),
            tenant_id: tenantId,
            name: data.name,
            description,
            base_price: data.base_price ?? null,
            parent_product_id: parentId || null,
            image_url: data.image_url ?? null,
            product_type: resolvedProductType,
            notes: validatedNotes,
            description_hash: descriptionHash,
            notes_hash: notesHash
        })
        .select()
        .single();

    if (error) throw error;

    // When a variant is created, the parent transitions to "configurable".
    if (parentId) {
        await recomputeProductType(parentId, tenantId);
    }

    // Enqueue translation jobs (fire-and-forget, silent error).
    if (descriptionHash !== null) {
        await enqueueWithSilentError({
            tenantId,
            entityType: "product",
            entityId: newProduct.id,
            field: "description",
            newSourceText: description,
            newSourceHash: descriptionHash
        });
    }
    if (notesHash !== null) {
        await enqueueWithSilentError({
            tenantId,
            entityType: "product_notes",
            entityId: newProduct.id,
            field: "notes",
            newSourceText: serializeNotes(validatedNotes),
            newSourceHash: notesHash
        });
    }

    void revalidatePublicCatalogForTenant(tenantId);

    return newProduct;
}

export async function updateProduct(
    id: string,
    tenantId: string,
    data: {
        name?: string;
        description?: string | null;
        base_price?: number | null;
        image_url?: string | null;
        product_type?: ProductType;
        notes?: ProductNote[];
    },
    parentId?: string | null
): Promise<V2Product & { queuedLanguages: number }> {
    await validateParentBeforeSave(tenantId, parentId);

    // When base_price is being set to a real value, formats become invalid —
    // delete any existing PRIMARY_PRICE group so only one pricing mode remains.
    if (data.base_price !== undefined && data.base_price !== null) {
        const { data: primaryGroups, error: pgErr } = await supabase
            .from("product_option_groups")
            .select("id")
            .eq("product_id", id)
            .eq("group_kind", "PRIMARY_PRICE");
        if (pgErr) throw pgErr;
        for (const g of primaryGroups ?? []) {
            const { error: delErr } = await supabase
                .from("product_option_groups")
                .delete()
                .eq("id", g.id);
            if (delErr) throw delErr;
        }
    }

    const updatePayload: Partial<{
        name: string;
        description: string | null;
        base_price: number | null;
        image_url: string | null;
        product_type: ProductType;
        parent_product_id: string | null;
        notes: ProductNote[];
        updated_at: string;
    }> = {
        updated_at: new Date().toISOString()
    };
    // Track presenza dei field tradotti per enqueue post-UPDATE.
    const descriptionInData = "description" in data;
    const notesInData = "notes" in data;
    let descriptionHash: string | null = null;
    let notesHash: string | null = null;
    let validatedNotes: ProductNote[] | undefined;

    if (data.name !== undefined) updatePayload.name = data.name;
    if (descriptionInData) {
        updatePayload.description = data.description ?? null;
        descriptionHash = await computeFieldHash(data.description ?? null);
        (updatePayload as Record<string, unknown>).description_hash = descriptionHash;
    }
    if (data.base_price !== undefined) updatePayload.base_price = data.base_price;
    if (data.image_url !== undefined) updatePayload.image_url = data.image_url;
    if (data.product_type !== undefined) updatePayload.product_type = data.product_type;
    if (parentId !== undefined) updatePayload.parent_product_id = parentId;
    if (notesInData) {
        validatedNotes = validateProductNotes(data.notes);
        updatePayload.notes = validatedNotes;
        notesHash = await computeNotesHash(validatedNotes);
        (updatePayload as Record<string, unknown>).notes_hash = notesHash;
    }

    const { data: updatedProduct, error } = await supabase
        .from("products")
        .update(updatePayload)
        .eq("id", id)
        .eq("tenant_id", tenantId)
        .select()
        .single();

    if (error) throw error;

    // Keep product_type in sync whenever base_price or product structure changes.
    // Only applies to base products (variants are always "simple").
    if (!updatedProduct.parent_product_id) {
        await recomputeProductType(id, tenantId);
    }

    // Enqueue translation jobs solo per i field effettivamente changed.
    // Solo il conteggio della descrizione risale (toast "Traduzioni in
    // aggiornamento in N lingue"): le note hanno un handler separato.
    let queuedLanguages = 0;
    if (descriptionInData) {
        queuedLanguages = await enqueueWithSilentError({
            tenantId,
            entityType: "product",
            entityId: id,
            field: "description",
            newSourceText: data.description ?? null,
            newSourceHash: descriptionHash
        });
    }
    if (notesInData) {
        await enqueueWithSilentError({
            tenantId,
            entityType: "product_notes",
            entityId: id,
            field: "notes",
            newSourceText: serializeNotes(validatedNotes ?? null),
            newSourceHash: notesHash
        });
    }

    void revalidatePublicCatalogForTenant(tenantId);

    return { ...updatedProduct, queuedLanguages };
}

export interface ProductDeleteImpact {
    /** Distinct catalogs containing the product (via catalog_category_products). */
    catalogs: number;
    /** Distinct featured contents containing the product. */
    featured: number;
    /** Distinct schedules with price/visibility overrides on the product. */
    schedules: number;
    /** Direct child variants. */
    variants: number;
}

/**
 * Counts the entities that reference the product, used to render an informative
 * confirmation in the delete drawer. Pure read, safe to call repeatedly.
 */
export async function countProductDeleteImpact(
    productId: string,
    tenantId: string
): Promise<ProductDeleteImpact> {
    const [catRes, featRes, priceRes, visRes, varRes] = await Promise.all([
        supabase
            .from("catalog_category_products")
            .select("catalog_id")
            .eq("tenant_id", tenantId)
            .eq("product_id", productId),
        supabase
            .from("featured_content_products")
            .select("featured_content_id")
            .eq("tenant_id", tenantId)
            .eq("product_id", productId),
        supabase
            .from("schedule_price_overrides")
            .select("schedule_id")
            .eq("tenant_id", tenantId)
            .eq("product_id", productId),
        supabase
            .from("schedule_visibility_overrides")
            .select("schedule_id")
            .eq("tenant_id", tenantId)
            .eq("product_id", productId),
        supabase
            .from("products")
            .select("id", { count: "exact", head: true })
            .eq("tenant_id", tenantId)
            .eq("parent_product_id", productId)
    ]);

    if (catRes.error) throw catRes.error;
    if (featRes.error) throw featRes.error;
    if (priceRes.error) throw priceRes.error;
    if (visRes.error) throw visRes.error;
    if (varRes.error) throw varRes.error;

    const distinct = <T extends Record<string, unknown>>(rows: T[], key: keyof T) =>
        new Set(rows.map(r => r[key] as string)).size;

    const scheduleIds = new Set<string>([
        ...(priceRes.data ?? []).map(r => r.schedule_id as string),
        ...(visRes.data ?? []).map(r => r.schedule_id as string)
    ]);

    return {
        catalogs: distinct(catRes.data ?? [], "catalog_id"),
        featured: distinct(featRes.data ?? [], "featured_content_id"),
        schedules: scheduleIds.size,
        variants: varRes.count ?? 0
    };
}

/**
 * Deletes a product and all its dependencies via ON DELETE CASCADE.
 * Cascades to: variants, catalog items, featured content products,
 * activity overrides, schedule overrides, allergens, attributes, ingredients.
 *
 * Polymorphic cleanup (translations, translation_jobs) and storage cleanup
 * (product image) are best-effort and never block the logical delete.
 */
export async function deleteProduct(id: string, tenantId: string): Promise<void> {
    // Fetch before delete: parent_product_id for product_type recomputation,
    // image_url to derive the storage path post-delete.
    const { data: existing } = await supabase
        .from("products")
        .select("parent_product_id, image_url")
        .eq("id", id)
        .eq("tenant_id", tenantId)
        .single();

    const { error } = await supabase
        .from("products")
        .delete()
        .eq("id", id)
        .eq("tenant_id", tenantId);

    // All FKs on products.id are ON DELETE CASCADE — 23503 cannot occur here.
    if (error) throw error;

    // If a variant was deleted, the parent may revert from "configurable" to "simple"/"formats".
    if (existing?.parent_product_id) {
        await recomputeProductType(existing.parent_product_id, tenantId);
    }

    // Cleanup polimorfici (entity_id TEXT, no FK CASCADE → cleanup manuale).
    // Silent: il prodotto è già stato cancellato, eventuali fallimenti
    // non devono propagare; al massimo restano righe orfane (cleanable in batch).
    try {
        await deleteTranslationsForEntity(tenantId, "product", id, "description");
        await deleteTranslationsForEntity(tenantId, "product_notes", id, "notes");
        await deleteTranslationJobsForEntity(tenantId, "product", id, "description");
        await deleteTranslationJobsForEntity(tenantId, "product_notes", id, "notes");
    } catch (err) {
        console.warn("[translations] cleanup on deleteProduct failed:", err);
    }

    // Storage cleanup best-effort: niente FK su storage.objects.
    try {
        await deleteProductImageBestEffort(tenantId, id, existing?.image_url ?? null);
    } catch (err) {
        console.warn("[storage] product image cleanup failed:", err);
    }

    void revalidatePublicCatalogForTenant(tenantId);
}

import {
    getProductOptionGroups,
    getOptionValues,
    createProductOptionGroup,
    createOptionValue
} from "./productOptions";
import { getProductIngredients, setProductIngredients } from "./ingredients";

export async function duplicateProduct(productId: string, tenantId: string): Promise<V2Product> {
    // NOTA traduzioni: il duplicato eredita description/notes dall'originale.
    // L'enqueue dei translation_jobs avviene automaticamente al passo 2 sotto
    // tramite createProduct (Prompt 9 hook). Niente lazy-at-first-edit: il
    // duplicato ha translations subito allineate al primo cron tick.
    // 1. Fetch original product
    const original = await getProduct(productId, tenantId);
    if (!original) {
        throw new Error(`Product ${productId} not found.`);
    }

    // 2. Create new product
    const newProduct = await createProduct(
        tenantId,
        {
            name: `${original.name} (Copia)`,
            description: original.description,
            base_price: original.base_price,
            image_url: original.image_url,
            product_type: original.product_type,
            notes: original.notes ?? []
        },
        null // parent_product_id = null
    );

    // 3. Copy attributes
    const originalAttributes = await getProductAttributes(productId, tenantId);
    for (const attr of originalAttributes) {
        await setProductAttributeValue(tenantId, newProduct.id, attr.attribute_definition_id, {
            value_text: attr.value_text || undefined,
            value_number: attr.value_number !== null ? attr.value_number : undefined,
            value_boolean: attr.value_boolean !== null ? attr.value_boolean : undefined,
            value_json: attr.value_json || undefined
        });
    }

    // 4. Copy allergens
    const originalAllergens = await getProductAllergens(productId, tenantId);
    if (originalAllergens.length > 0) {
        await setProductAllergens(tenantId, newProduct.id, originalAllergens);
    }

    // 5. Copy groups
    const originalGroups = await getProductGroupAssignments(productId);
    for (const group of originalGroups) {
        await assignProductToGroup({
            productId: newProduct.id,
            groupId: group.group_id,
            tenantId: tenantId
        });
    }

    // 6. Copy ingredients
    const originalIngredients = await getProductIngredients(productId);
    if (originalIngredients.length > 0) {
        await setProductIngredients(
            tenantId,
            newProduct.id,
            originalIngredients.map(i => i.ingredient_id)
        );
    }

    // 7. Copy product options
    const originalOptionGroups = await getProductOptionGroups(productId);
    for (const group of originalOptionGroups) {
        const newGroup = await createProductOptionGroup({
            tenant_id: tenantId,
            product_id: newProduct.id,
            name: group.name,
            is_required: group.is_required,
            max_selectable: group.max_selectable,
            group_kind: group.group_kind,
            pricing_mode: group.pricing_mode
        });

        const originalValues = await getOptionValues(group.id);
        for (const val of originalValues) {
            await createOptionValue({
                tenant_id: tenantId,
                option_group_id: newGroup.id,
                name: val.name,
                price_modifier: val.price_modifier,
                absolute_price: val.absolute_price
            });
        }
    }

    return newProduct;
}

export type ProductPickerItem = {
    id: string;
    name: string;
    image_url: string | null;
    base_price: number | null;
};

/**
 * Lightweight fetch for the product-group picker.
 * Returns only base products (no variants) with minimal fields.
 */
export async function listBaseProductsForPicker(tenantId: string): Promise<ProductPickerItem[]> {
    const { data, error } = await supabase
        .from("products")
        .select("id, name, image_url, base_price")
        .eq("tenant_id", tenantId)
        .is("parent_product_id", null)
        .order("name", { ascending: true });

    if (error) throw error;
    return data ?? [];
}

/**
 * Generate an Italian product description via the stateless `product-ai-enrich`
 * edge function. Pure read path: it does NOT write the product — the caller
 * pre-fills the form field and saves through createProduct/updateProduct as usual.
 *
 * Throws an Error with `.code` (from the edge body, e.g. "rate_limit_rpd",
 * "invalid_input", "SERVER_ERROR") so the UI can branch the toast. No client-side
 * retry — the edge function already retries transient failures up to 3 times.
 */
export async function generateProductDescription(
    tenantId: string,
    input: { name: string; verticalType?: string; categoryName?: string }
): Promise<string> {
    const { data, error } = await supabase.functions.invoke<{
        success: boolean;
        data?: { description: string };
        error?: string;
        code?: string;
    }>("product-ai-enrich", {
        body: { ...input, tenantId }
    });

    if (error) {
        let code = "SERVER_ERROR";
        let message: string | undefined;
        if (error instanceof FunctionsHttpError) {
            try {
                const body = (await error.context.clone().json()) as {
                    code?: unknown;
                    error?: unknown;
                };
                if (typeof body?.code === "string") code = body.code;
                if (typeof body?.error === "string") message = body.error;
            } catch {
                // body not JSON → keep defaults
            }
        }
        const err = new Error(message ?? "Generazione descrizione non riuscita");
        (err as Error & { code?: string }).code = code;
        throw err;
    }

    const description = data?.data?.description;
    if (!description || typeof description !== "string") {
        const err = new Error("Risposta vuota dal servizio AI");
        (err as Error & { code?: string }).code = "SERVER_ERROR";
        throw err;
    }
    return description.trim();
}
