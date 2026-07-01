import { supabase } from "@/services/supabase/client";
import { computeFieldHash } from "@/services/translation/hashUtils";
import { enqueueWithSilentError, deleteTranslationJobsForEntity } from "./translationJobs";
import { deleteTranslationsForEntity } from "./translations";
import { deleteFeaturedContentImageBestEffort } from "./upload";
import { revalidatePublicCatalogForTenant } from "@services/publicCatalog/revalidatePublicCatalog";
import type { MediaFraming, MediaFillMode } from "@/components/ui/ImageReframeEditor/types";

// Re-export the canonical framing types so consumers can pull them from the
// service alongside FeaturedContent (single source of truth stays in the editor).
export type { MediaFraming, MediaFillMode };

// Field di featured_contents tradotti via pipeline (Prompt 9 hook).
const FEATURED_TRANSLATABLE_FIELDS = ["title", "subtitle", "description", "cta_text"] as const;
type FeaturedTranslatableField = (typeof FEATURED_TRANSLATABLE_FIELDS)[number];

/**
 * Calcola gli hash dei field tradotti presenti in `data`. Ritorna una mappa
 * field → hash + il payload aggiornato con le colonne `<field>_hash` settate.
 *
 * Solo i field presenti in `data` (check `'X' in data`) entrano nella mappa.
 * Niente hash → niente enqueue al chiamante.
 */
async function buildFeaturedTranslatableHashes(
    data: Partial<FeaturedContent>
): Promise<{
    hashes: Map<FeaturedTranslatableField, string | null>;
    hashColumns: Record<string, string | null>;
}> {
    const hashes = new Map<FeaturedTranslatableField, string | null>();
    const hashColumns: Record<string, string | null> = {};

    for (const field of FEATURED_TRANSLATABLE_FIELDS) {
        if (!(field in data)) continue;
        const value = data[field] as string | null | undefined;
        const hash = await computeFieldHash(value ?? null);
        hashes.set(field, hash);
        hashColumns[`${field}_hash`] = hash;
    }

    return { hashes, hashColumns };
}

export type FeaturedContentStatus = "draft" | "published";
export type FeaturedContentPricingMode = "none" | "per_item" | "bundle";
export type FeaturedContentType = "announcement" | "event" | "promo" | "bundle";

export interface FeaturedContent {
    id: string;
    tenant_id: string;
    internal_name: string;
    title: string;
    subtitle: string | null;
    description: string | null;
    media_id: string | null;
    media_focal_x: number;
    media_focal_y: number;
    media_zoom: number;
    media_fill_mode: "blur" | "dominant" | "color" | "none";
    media_fill_color: string | null;
    cta_text: string | null;
    cta_url: string | null;
    status: FeaturedContentStatus;
    layout_style: string | null;
    pricing_mode: FeaturedContentPricingMode;
    content_type: FeaturedContentType;
    bundle_price: number | null;
    show_original_total: boolean;
    created_at: string;
    updated_at: string;
}

/** Default framing, mirrors the DB column defaults (centered cover, blur fill). */
const FRAMING_DEFAULTS: MediaFraming = {
    focalX: 0.5,
    focalY: 0.5,
    zoom: 1,
    fillMode: "blur",
    fillColor: null
};

/** MediaFraming (camelCase) → featured_contents columns (snake_case). */
export function framingToColumns(f: MediaFraming): {
    media_focal_x: number;
    media_focal_y: number;
    media_zoom: number;
    media_fill_mode: MediaFillMode;
    media_fill_color: string | null;
} {
    return {
        media_focal_x: f.focalX,
        media_focal_y: f.focalY,
        media_zoom: f.zoom,
        media_fill_mode: f.fillMode,
        media_fill_color: f.fillColor
    };
}

/**
 * featured_contents columns → MediaFraming. Tolerates null/undefined columns
 * (featured saved before framing existed) by falling back to FRAMING_DEFAULTS.
 */
export function columnsToFraming(
    row: Partial<
        Pick<
            FeaturedContent,
            "media_focal_x" | "media_focal_y" | "media_zoom" | "media_fill_mode" | "media_fill_color"
        >
    >
): MediaFraming {
    return {
        focalX: row.media_focal_x ?? FRAMING_DEFAULTS.focalX,
        focalY: row.media_focal_y ?? FRAMING_DEFAULTS.focalY,
        zoom: row.media_zoom ?? FRAMING_DEFAULTS.zoom,
        fillMode: row.media_fill_mode ?? FRAMING_DEFAULTS.fillMode,
        fillColor: row.media_fill_color ?? FRAMING_DEFAULTS.fillColor
    };
}

export interface FeaturedContentProduct {
    id: string;
    tenant_id: string;
    featured_content_id: string;
    product_id: string;
    sort_order: number;
    note: string | null;
    created_at: string;
}

export interface FeaturedContentWithProducts extends FeaturedContent {
    products_count?: number;
    products?: (FeaturedContentProduct & {
        product?: {
            id: string;
            name: string;
            description?: string;
            base_price?: number;
        };
    })[];
}

type FeaturedContentListRaw = FeaturedContent & {
    products: [{ count: number }] | null;
};

export interface FeaturedContentProductRow {
    id: string;
    featured_content_id: string;
    product_id: string;
    sort_order: number;
    note: string | null;
    products: {
        id: string;
        name: string;
        base_price: number | null;
        option_groups: Array<{
            group_kind: string;
            values: Array<{ absolute_price: number | null }>;
        }> | null;
    } | null;
}

export async function listFeaturedContents(tenantId: string): Promise<FeaturedContentWithProducts[]> {
    const { data, error } = await supabase
        .from("featured_contents")
        .select(
            `
            *,
            products:featured_content_products (count)
        `
        )
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false });

    if (error) throw error;

    return (data as unknown as FeaturedContentListRaw[]).map(item => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { products: _products, ...rest } = item;
        return { ...rest, products_count: item.products?.[0]?.count || 0 };
    });
}

export async function getFeaturedContentById(id: string, tenantId: string): Promise<FeaturedContentWithProducts> {
    const { data: content, error: contentError } = await supabase
        .from("featured_contents")
        .select(`*`)
        .eq("id", id)
        .eq("tenant_id", tenantId)
        .single();

    if (contentError) throw contentError;

    const { data: products, error: productsError } = await supabase
        .from("featured_content_products")
        .select(
            `
            *,
            product:product_id (id, name, description, base_price)
        `
        )
        .eq("featured_content_id", id)
        .eq("tenant_id", tenantId)
        .order("sort_order", { ascending: true });

    if (productsError) throw productsError;

    return { ...content, products };
}

export async function createFeaturedContent(
    tenantId: string,
    contentData: Partial<FeaturedContent>,
    productsData: Partial<FeaturedContentProduct>[] = []
) {
    const { hashes, hashColumns } = await buildFeaturedTranslatableHashes(contentData);

    const { data: content, error: contentError } = await supabase
        .from("featured_contents")
        .insert({
            ...contentData,
            ...hashColumns,
            tenant_id: tenantId
        })
        .select()
        .single();

    if (contentError) throw contentError;

    let insertedProducts: FeaturedContentProduct[] = [];
    if (productsData.length > 0) {
        // Compute note_hash per ogni product item (note opzionale).
        const productsToInsert = await Promise.all(
            productsData.map(async (p, index) => ({
                ...p,
                tenant_id: tenantId,
                featured_content_id: content.id,
                sort_order: p.sort_order ?? index,
                note_hash: await computeFieldHash(p.note ?? null)
            }))
        );

        const { data: insertedRows, error: productsError } = await supabase
            .from("featured_content_products")
            .insert(productsToInsert)
            .select();

        if (productsError) throw productsError;
        insertedProducts = (insertedRows ?? []) as FeaturedContentProduct[];
    }

    // Enqueue translation jobs (silent error).
    for (const field of FEATURED_TRANSLATABLE_FIELDS) {
        if (!hashes.has(field)) continue;
        const hash = hashes.get(field) ?? null;
        if (hash === null) continue;
        const sourceText = (contentData[field] as string | null | undefined) ?? null;
        await enqueueWithSilentError({
            tenantId,
            entityType: "featured",
            entityId: content.id,
            field,
            newSourceText: sourceText,
            newSourceHash: hash
        });
    }

    for (const row of insertedProducts) {
        if (!row.note) continue;
        const noteHash = await computeFieldHash(row.note);
        if (noteHash === null) continue;
        await enqueueWithSilentError({
            tenantId,
            entityType: "featured_product",
            entityId: row.id,
            field: "note",
            newSourceText: row.note,
            newSourceHash: noteHash
        });
    }

    void revalidatePublicCatalogForTenant(tenantId);

    return content;
}

/**
 * Aggiorna SOLO i field di `featured_contents` (titolo, sottotitolo, descrizione,
 * cta_text, cta_url, media_id, status, layout_style, pricing_mode, ecc.).
 *
 * NON gestisce il lifecycle dei `featured_content_products`. Pattern delta-based
 * con id stabili — i prodotti hanno helper dedicati:
 *
 *   - `syncFeaturedContentProducts(featuredId, tenantId, toRemoveIds, toAddItems)`
 *     → add/remove (id stabili: nuove righe ricevono id nuovi, rimosse vengono
 *     cancellate puntualmente per id; le righe NON toccate conservano l'id).
 *   - `updateFeaturedContentProductNote(id, tenantId, note)` → update per-row.
 *   - `updateFeaturedContentProductsSortOrder(rows, tenantId)` → update per-row.
 *
 * Razionale: l'id di `featured_content_products` deve restare stabile attraverso
 * gli edit del parent featured_content. Precondizione P4 per il sistema
 * traduzioni (Prompt 9): le translation della colonna `note` saranno linkate
 * via `entity_id = featured_content_products.id`. Un DELETE+REINSERT al save
 * di featured_contents perderebbe l'id e renderebbe orfane le translation.
 */
export async function updateFeaturedContent(
    id: string,
    tenantId: string,
    contentData: Partial<FeaturedContent>
): Promise<FeaturedContent> {
    const { hashes, hashColumns } = await buildFeaturedTranslatableHashes(contentData);

    const { data: content, error: contentError } = await supabase
        .from("featured_contents")
        .update({ ...contentData, ...hashColumns })
        .eq("id", id)
        .eq("tenant_id", tenantId)
        .select()
        .single();

    if (contentError) throw contentError;

    // Enqueue translation jobs solo per i field effettivamente presenti
    // in contentData (controllato da buildFeaturedTranslatableHashes).
    for (const field of FEATURED_TRANSLATABLE_FIELDS) {
        if (!hashes.has(field)) continue;
        const hash = hashes.get(field) ?? null;
        const sourceText = (contentData[field] as string | null | undefined) ?? null;
        await enqueueWithSilentError({
            tenantId,
            entityType: "featured",
            entityId: id,
            field,
            newSourceText: sourceText,
            newSourceHash: hash
        });
    }

    void revalidatePublicCatalogForTenant(tenantId);

    return content as FeaturedContent;
}

export interface FeaturedContentDeleteImpact {
    /** Distinct featured rules referencing this content via schedule_featured_contents. */
    rules: number;
    /** Products linked through featured_content_products. */
    products: number;
}

/**
 * Counts entities referencing a featured content. Pure read, used to render
 * an informative confirmation in the delete drawer.
 */
export async function countFeaturedContentDeleteImpact(
    contentId: string,
    tenantId: string
): Promise<FeaturedContentDeleteImpact> {
    const [rulesRes, productsRes] = await Promise.all([
        supabase
            .from("schedule_featured_contents")
            .select("schedule_id")
            .eq("tenant_id", tenantId)
            .eq("featured_content_id", contentId),
        supabase
            .from("featured_content_products")
            .select("id", { count: "exact", head: true })
            .eq("tenant_id", tenantId)
            .eq("featured_content_id", contentId)
    ]);

    if (rulesRes.error) throw rulesRes.error;
    if (productsRes.error) throw productsRes.error;

    const ruleIds = new Set<string>(
        (rulesRes.data ?? []).map(r => r.schedule_id as string)
    );

    return {
        rules: ruleIds.size,
        products: productsRes.count ?? 0
    };
}

export interface DeleteFeaturedContentResult {
    /** Featured rules left empty after delete and toggled to enabled=false. */
    schedules_disabled: number;
}

/**
 * Deletes a featured content and all DB dependencies via ON DELETE CASCADE
 * (featured_content_products, schedule_featured_contents).
 *
 * Side effects beyond the cascade:
 *   - Storage cleanup on bucket `featured-contents` (best-effort, silent).
 *   - Polymorphic translations + translation_jobs cleanup for entity_type
 *     "featured" (parent) and "featured_product" (each linked FCP id).
 *   - Featured rules left without any content row are toggled to enabled=false
 *     so they appear under "Bozze" in the scheduling list.
 *
 * Returns the number of rules disabled so callers can render an informative
 * toast.
 */
export async function deleteFeaturedContent(
    contentId: string,
    tenantId: string
): Promise<DeleteFeaturedContentResult> {
    // Pre-DELETE snapshot: media path, FCP ids (for translations cleanup),
    // schedule ids (for post-cascade emptiness check).
    const { data: existing } = await supabase
        .from("featured_contents")
        .select("media_id")
        .eq("id", contentId)
        .eq("tenant_id", tenantId)
        .maybeSingle();

    const { data: fcpRows } = await supabase
        .from("featured_content_products")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("featured_content_id", contentId);

    const fcpIds: string[] = (fcpRows ?? []).map(r => r.id as string);

    const { data: sfcRows } = await supabase
        .from("schedule_featured_contents")
        .select("schedule_id")
        .eq("tenant_id", tenantId)
        .eq("featured_content_id", contentId);

    const scheduleIds: string[] = Array.from(
        new Set((sfcRows ?? []).map(r => r.schedule_id as string))
    );

    // CASCADE wipes featured_content_products and schedule_featured_contents.
    const { error } = await supabase
        .from("featured_contents")
        .delete()
        .eq("id", contentId)
        .eq("tenant_id", tenantId);

    if (error) throw error;

    // Storage cleanup (best-effort, silent).
    try {
        await deleteFeaturedContentImageBestEffort(
            tenantId,
            contentId,
            existing?.media_id ?? null
        );
    } catch (err) {
        console.warn("[storage] featured content image cleanup failed:", err);
    }

    // Polymorphic translations cleanup. Wildcard call (no field arg) wipes
    // title/subtitle/description/cta_text in one shot for the parent entity.
    try {
        await deleteTranslationsForEntity(tenantId, "featured", contentId);
        await deleteTranslationJobsForEntity(tenantId, "featured", contentId);
        for (const fcpId of fcpIds) {
            await deleteTranslationsForEntity(tenantId, "featured_product", fcpId, "note");
            await deleteTranslationJobsForEntity(tenantId, "featured_product", fcpId, "note");
        }
    } catch (err) {
        console.warn("[translations] cleanup on deleteFeaturedContent failed:", err);
    }

    // Disable featured rules left without any content row. Race condition
    // (concurrent insert between count and update) is accepted — same trade-off
    // as delete-business cleanup.
    let schedulesDisabled = 0;
    for (const scheduleId of scheduleIds) {
        try {
            const { count, error: countErr } = await supabase
                .from("schedule_featured_contents")
                .select("id", { count: "exact", head: true })
                .eq("schedule_id", scheduleId);

            if (countErr) {
                console.warn(
                    "[scheduling] residual count failed for schedule",
                    scheduleId,
                    countErr
                );
                continue;
            }

            if ((count ?? 0) > 0) continue;

            const { error: updErr } = await supabase
                .from("schedules")
                .update({ enabled: false })
                .eq("id", scheduleId)
                .eq("tenant_id", tenantId)
                .eq("rule_type", "featured");

            if (updErr) {
                console.warn("[scheduling] disable failed for schedule", scheduleId, updErr);
                continue;
            }

            schedulesDisabled += 1;
        } catch (err) {
            console.warn("[scheduling] cleanup failed for schedule", scheduleId, err);
        }
    }

    void revalidatePublicCatalogForTenant(tenantId);

    return { schedules_disabled: schedulesDisabled };
}

export async function listFeaturedContentProducts(
    featuredId: string,
    tenantId: string
): Promise<FeaturedContentProductRow[]> {
    const { data, error } = await supabase
        .from("featured_content_products")
        .select(
            `
            id,
            featured_content_id,
            product_id,
            sort_order,
            note,
            products (id, name, base_price, option_groups:product_option_groups(group_kind, values:product_option_values(absolute_price)))
        `
        )
        .eq("featured_content_id", featuredId)
        .eq("tenant_id", tenantId)
        .order("sort_order", { ascending: true });

    if (error) throw error;
    return (data as unknown as FeaturedContentProductRow[]) ?? [];
}

export async function deleteFeaturedContentProduct(id: string, tenantId: string): Promise<void> {
    const { error } = await supabase
        .from("featured_content_products")
        .delete()
        .eq("id", id)
        .eq("tenant_id", tenantId);

    if (error) throw error;

    // Cleanup translations associate (entity_id senza FK CASCADE).
    try {
        await deleteTranslationsForEntity(tenantId, "featured_product", id, "note");
    } catch (err) {
        console.error("[translations] cleanup on deleteFeaturedContentProduct failed:", err);
    }

    void revalidatePublicCatalogForTenant(tenantId);
}

export async function updateFeaturedContentProductNote(
    id: string,
    tenantId: string,
    note: string | null
): Promise<void> {
    const noteHash = await computeFieldHash(note);

    const { error } = await supabase
        .from("featured_content_products")
        .update({ note, note_hash: noteHash })
        .eq("id", id)
        .eq("tenant_id", tenantId);

    if (error) throw error;

    await enqueueWithSilentError({
        tenantId,
        entityType: "featured_product",
        entityId: id,
        field: "note",
        newSourceText: note,
        newSourceHash: noteHash
    });

    void revalidatePublicCatalogForTenant(tenantId);
}

export async function updateFeaturedContentProductsSortOrder(
    rows: { id: string; sort_order: number }[],
    tenantId: string
): Promise<void> {
    const results = await Promise.all(
        rows.map(row =>
            supabase
                .from("featured_content_products")
                .update({ sort_order: row.sort_order })
                .eq("id", row.id)
                .eq("tenant_id", tenantId)
        )
    );
    const failed = results.find(r => r.error);
    if (failed?.error) throw failed.error;
    void revalidatePublicCatalogForTenant(tenantId);
}

export async function syncFeaturedContentProducts(
    featuredId: string,
    tenantId: string,
    toRemoveIds: string[],
    toAddItems: { productId: string; sortOrder: number }[]
): Promise<void> {
    const ops: Promise<void>[] = [];

    if (toRemoveIds.length > 0) {
        ops.push(
            Promise.resolve(
                supabase
                    .from("featured_content_products")
                    .delete()
                    .in("id", toRemoveIds)
                    .eq("tenant_id", tenantId)
                    .then(({ error }) => {
                        if (error) throw error;
                    })
            )
        );
    }

    if (toAddItems.length > 0) {
        // ADD: note hardcoded a null → niente translation_jobs da enqueue al
        // momento dell'aggiunta. La nota viene popolata in seguito via
        // updateFeaturedContentProductNote che gestisce hash + enqueue.
        const payload = toAddItems.map(item => ({
            tenant_id: tenantId,
            featured_content_id: featuredId,
            product_id: item.productId,
            sort_order: item.sortOrder,
            note: null
        }));
        ops.push(
            Promise.resolve(
                supabase
                    .from("featured_content_products")
                    .insert(payload)
                    .then(({ error }) => {
                        if (error) throw error;
                    })
            )
        );
    }

    await Promise.all(ops);

    // Cleanup translations dei product rimossi (entity_id senza FK CASCADE).
    // Eseguito DOPO le ops principali per non bloccare il sync se fallisce.
    if (toRemoveIds.length > 0) {
        for (const removedId of toRemoveIds) {
            try {
                await deleteTranslationsForEntity(tenantId, "featured_product", removedId, "note");
            } catch (err) {
                console.error("[translations] cleanup on syncFeaturedContentProducts remove failed:", err);
            }
        }
    }

    void revalidatePublicCatalogForTenant(tenantId);
}
