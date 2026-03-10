import { PublicCollection } from "@/types/collectionPublic";
import { supabase } from "@/services/supabase/client";
import type {
    Collection,
    CollectionSection,
    CollectionItem,
    Item,
    CollectionItemWithItem,
    ItemCategory
} from "@/types/database";
import { resolveCollectionStyle, safeCollectionStyle } from "@/types/collectionStyle";
import { CatalogType } from "@/types/catalog";
import { findActivePriceRuleScheduleId } from "./v2/resolveActivityCatalogsV2";

/* ============================
   COLLECTIONS (CRUD)
============================ */

export async function listCollections(): Promise<Collection[]> {
    const { data, error } = await supabase
        .from("collections")
        .select("*")
        .order("created_at", { ascending: true });

    if (error) throw error;
    return data ?? [];
}

export async function createCollection(data: {
    name: string;
    description?: string;
    collection_type: CatalogType;
    kind?: "standard" | "special";
}): Promise<Collection> {
    const { data: collection, error } = await supabase
        .from("collections")
        .insert({
            name: data.name,
            description: data.description ?? null,
            collection_type: data.collection_type,
            kind: data.kind ?? "standard"
        })
        .select()
        .single();

    if (error) throw error;
    return collection;
}

export async function updateCollection(
    id: string,
    fields: Partial<Pick<Collection, "name" | "description" | "style" | "kind">>
): Promise<Collection> {
    const { data, error } = await supabase
        .from("collections")
        .update(fields)
        .eq("id", id)
        .select()
        .single();

    if (error) throw error;
    return data;
}

export async function deleteCollection(id: string): Promise<void> {
    const { error } = await supabase.from("collections").delete().eq("id", id);
    if (error) throw error;
}

export async function isCollectionDeletable(collectionId: string): Promise<boolean> {
    const { count, error } = await supabase
        .from("business_collection_schedules")
        .select("id", { count: "exact", head: true })
        .eq("collection_id", collectionId)
        .eq("is_active", true);

    if (error) throw error;

    return (count ?? 0) === 0;
}

export async function duplicateCollection(
    sourceCollectionId: string,
    newName: string,
    duplicateItems: boolean
): Promise<string> {
    const { data, error } = await supabase.rpc("duplicate_collection", {
        p_source_collection_id: sourceCollectionId,
        p_new_name: newName,
        p_duplicate_items: duplicateItems
    });

    if (error) throw error;
    return data as string;
}

/* ============================
   SECTIONS (DERIVED)
============================ */

export async function listSections(collectionId: string): Promise<CollectionSection[]> {
    const { data, error } = await supabase
        .from("collection_sections")
        .select("id, collection_id, base_category_id, label, order_index")
        .eq("collection_id", collectionId)
        .order("order_index");

    if (error) throw error;
    return data ?? [];
}

export async function updateSectionLabel(
    sectionId: string,
    label: string
): Promise<CollectionSection> {
    const { data, error } = await supabase
        .from("collection_sections")
        .update({ label })
        .eq("id", sectionId)
        .select()
        .single();

    if (error) throw error;
    return data;
}

export async function deleteSectionAndItems(sectionId: string): Promise<void> {
    const { error: itemsError } = await supabase
        .from("collection_items")
        .delete()
        .eq("section_id", sectionId);

    if (itemsError) throw itemsError;

    const { error: sectionError } = await supabase
        .from("collection_sections")
        .delete()
        .eq("id", sectionId);

    if (sectionError) throw sectionError;
}

export async function updateSectionOrder(sectionId: string, order_index: number) {
    const { data, error } = await supabase
        .from("collection_sections")
        .update({ order_index })
        .eq("id", sectionId)
        .select()
        .single();
    if (error) throw error;
    return data;
}

/* ============================
   ITEM CATEGORIES
============================ */

export async function listItemCategories(): Promise<ItemCategory[]> {
    const { data, error } = await supabase.from("item_categories").select("*").order("name");

    if (error) throw error;
    return data ?? [];
}

/* ============================
   ITEMS (GLOBAL)
============================ */

export async function searchItems(query: string, type: CatalogType) {
    const { data, error } = await supabase
        .from("items")
        .select(
            `
            *,
            category:item_categories ( id, name, slug )
            `
        )
        .eq("type", type)
        .ilike("name", `%${query}%`)
        .limit(20);

    if (error) throw error;
    return data ?? [];
}

export async function listItems(type: CatalogType, limit = 50) {
    const { data, error } = await supabase
        .from("items")
        .select(
            `
            *,
            category:item_categories ( id, name, slug )
            `
        )
        .eq("type", type)
        .order("created_at", { ascending: false })
        .limit(limit);

    if (error) throw error;
    return data ?? [];
}

export async function createItem(data: {
    name: string;
    description?: string;
    base_price?: number;
    duration?: number;
    type: CatalogType;
    category_id: string;
}): Promise<Item> {
    const { data: item, error } = await supabase
        .from("items")
        .insert({
            name: data.name,
            description: data.description ?? null,
            base_price: data.base_price ?? null,
            duration: data.duration ?? null,
            type: data.type,
            category_id: data.category_id
        })
        .select()
        .single();

    if (error) throw error;
    return item;
}

export async function updateItem(
    id: string,
    fields: Partial<Pick<Item, "name" | "description" | "base_price" | "duration" | "metadata">>
): Promise<Item> {
    const { data, error } = await supabase
        .from("items")
        .update(fields)
        .eq("id", id)
        .select()
        .single();

    if (error) throw error;
    return data;
}

export async function deleteItem(id: string): Promise<void> {
    const { error } = await supabase.from("items").delete().eq("id", id);
    if (error) throw error;
}

/* ============================
   COLLECTION ITEMS (SMART)
============================ */

export async function addItemToCollection(
    collectionId: string,
    itemId: string
): Promise<CollectionItem> {
    // 1) categoria item
    const { data: item, error: itemError } = await supabase
        .from("items")
        .select("id, category_id")
        .eq("id", itemId)
        .single();

    if (itemError) throw itemError;
    if (!item) throw new Error("Item not found");

    // 2) section esistente
    const { data: existingSection } = await supabase
        .from("collection_sections")
        .select("id")
        .eq("collection_id", collectionId)
        .eq("base_category_id", item.category_id)
        .maybeSingle();

    let sectionId = existingSection?.id;

    // 3) crea section se non esiste
    if (!sectionId) {
        const { data: category, error: catError } = await supabase
            .from("item_categories")
            .select("name")
            .eq("id", item.category_id)
            .single();

        if (catError) throw catError;

        const { data: newSection, error: secError } = await supabase
            .from("collection_sections")
            .insert({
                collection_id: collectionId,
                base_category_id: item.category_id,
                label: category?.name ?? "Categoria"
            })
            .select("id")
            .single();

        if (secError) throw secError;
        sectionId = newSection.id;
    }

    // 4) inserimento collection_item
    const { data, error } = await supabase
        .from("collection_items")
        .insert({
            collection_id: collectionId,
            item_id: itemId,
            section_id: sectionId
        })
        .select()
        .single();

    if (error) throw error;
    return data;
}

export async function updateCollectionItem(
    id: string,
    fields: Partial<Pick<CollectionItem, "order_index" | "visible">>
): Promise<CollectionItem> {
    const { data, error } = await supabase
        .from("collection_items")
        .update(fields)
        .eq("id", id)
        .select()
        .single();

    if (error) throw error;
    return data;
}

export async function removeItemFromCollection(id: string): Promise<void> {
    const { error } = await supabase.from("collection_items").delete().eq("id", id);
    if (error) throw error;
}

/* ============================
   BUILDER / PREVIEW
============================ */

export async function getCollectionBuilderData(collectionId: string) {
    const [{ data: collection }, { data: sections }, { data: items }] = await Promise.all([
        supabase.from("collections").select("*").eq("id", collectionId).single(),
        supabase
            .from("collection_sections")
            .select("id, collection_id, base_category_id, label, order_index")
            .eq("collection_id", collectionId)
            .order("order_index"),
        supabase
            .from("collection_items")
            .select("*")
            .eq("collection_id", collectionId)
            .order("order_index")
    ]);

    if (!collection) throw new Error("Collection not found");

    return {
        collection,
        sections: sections ?? [],
        items: items ?? []
    };
}

export async function getCollectionItemsWithData(
    collectionId: string
): Promise<CollectionItemWithItem[]> {
    const { data, error } = await supabase
        .from("collection_items")
        .select(
            `
            id,
            collection_id,
            section_id,
            order_index,
            visible,
            item:items (
              id,
              name,
              description,
              base_price,
              duration,
              metadata,
              created_at,
              updated_at,
              category_id,
              category:item_categories ( id, name, slug, type, created_at )
            )
            `
        )
        .eq("collection_id", collectionId)
        .order("order_index");

    if (error) throw error;

    return (data ?? []).map(row => {
        const rawItem = Array.isArray(row.item) ? row.item[0] : row.item;
        const rawCategory = Array.isArray(rawItem.category)
            ? rawItem.category[0]
            : rawItem.category;

        if (!rawItem || !rawCategory) {
            throw new Error("Item or category relation missing");
        }

        return {
            id: row.id,
            collection_id: row.collection_id,
            section_id: row.section_id,
            order_index: row.order_index,
            visible: row.visible,
            item: {
                id: rawItem.id,
                name: rawItem.name,
                description: rawItem.description,
                base_price: rawItem.base_price,
                duration: rawItem.duration,
                metadata: rawItem.metadata ?? {},
                category_id: rawItem.category_id,
                category: {
                    id: rawCategory.id,
                    name: rawCategory.name,
                    slug: rawCategory.slug,
                    type: rawCategory.type,
                    created_at: rawCategory.created_at
                },
                created_at: rawItem.created_at,
                updated_at: rawItem.updated_at
            }
        };
    });
}

type PriceAwareCollectionItem = Item & {
    price?: number | null;
    effective_price?: number | null;
    original_price?: number | null;
};

function mapPublicSectionItem(row: CollectionItemWithItem) {
    const item = row.item as PriceAwareCollectionItem;
    const effectivePrice = item.effective_price ?? item.price ?? item.base_price ?? null;

    return {
        id: row.id,
        name: item.name,
        description: item.description ?? null,
        image: item.metadata?.image ?? null,
        price: effectivePrice,
        effective_price: item.effective_price ?? null,
        original_price: item.original_price ?? null
    };
}

type RawV2ProductRow = {
    id: string;
    name: string;
    description: string | null;
    base_price: number | null;
};

type RawV2CatalogItemRow = {
    id: string;
    order_index: number | null;
    visible: boolean | null;
    product: RawV2ProductRow | RawV2ProductRow[] | null;
};

type RawV2CatalogSectionRow = {
    id: string;
    label: string | null;
    order_index: number | null;
    items: RawV2CatalogItemRow[] | RawV2CatalogItemRow | null;
};

type RawV2CatalogRow = {
    id: string;
    name: string;
    style: unknown;
    sections: RawV2CatalogSectionRow[] | RawV2CatalogSectionRow | null;
};

type RawV2ActivityProductOverrideRow = {
    product_id: string;
    visible_override: boolean | null;
};

type RawV2SchedulePriceOverrideRow = {
    product_id: string;
    override_price: number;
    show_original_price: boolean;
};

function normalizeOne<T>(value: T | T[] | null | undefined): T | null {
    if (!value) return null;
    return Array.isArray(value) ? (value[0] ?? null) : value;
}

function normalizeMany<T>(value: T[] | T | null | undefined): T[] {
    if (!value) return [];
    return Array.isArray(value) ? value : [value];
}

export async function getPublicBusinessCollection(
    activityId: string,
    catalogId: string
): Promise<PublicCollection> {
    const { data: catalogData, error: catalogError } = await supabase
        .from("v2_catalogs")
        .select(
            `
            id,
            name,
            style,
            sections:v2_catalog_sections(
              id,
              label,
              order_index,
              items:v2_catalog_items(
                id,
                order_index,
                visible,
                product:v2_products(
                  id,
                  name,
                  description,
                  base_price
                )
              )
            )
            `
        )
        .eq("id", catalogId)
        .maybeSingle();

    if (catalogError) throw catalogError;
    if (!catalogData) throw new Error("Collection not found");

    const catalog = catalogData as RawV2CatalogRow;
    const sections = normalizeMany(catalog.sections)
        .slice()
        .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));

    const productIds = Array.from(
        new Set(
            sections.flatMap(section =>
                normalizeMany(section.items)
                    .map(item => normalizeOne(item.product)?.id ?? null)
                    .filter((id): id is string => Boolean(id))
            )
        )
    );

    const visibleOverridesByProductId: Record<string, RawV2ActivityProductOverrideRow> = {};
    if (productIds.length > 0) {
        const { data: visibleOverridesData, error: visibleOverridesError } = await supabase
            .from("v2_activity_product_overrides")
            .select("product_id, visible_override")
            .eq("activity_id", activityId)
            .in("product_id", productIds);

        if (visibleOverridesError) throw visibleOverridesError;

        for (const row of (visibleOverridesData ?? []) as RawV2ActivityProductOverrideRow[]) {
            visibleOverridesByProductId[row.product_id] = row;
        }
    }

    const priceOverridesByProductId: Record<string, RawV2SchedulePriceOverrideRow> = {};
    const activePriceRuleScheduleId = await findActivePriceRuleScheduleId(activityId, new Date());
    if (activePriceRuleScheduleId && productIds.length > 0) {
        const { data: priceOverridesData, error: priceOverridesError } = await supabase
            .from("v2_schedule_price_overrides")
            .select("product_id, override_price, show_original_price")
            .eq("schedule_id", activePriceRuleScheduleId)
            .in("product_id", productIds);

        if (priceOverridesError) throw priceOverridesError;

        for (const row of (priceOverridesData ?? []) as RawV2SchedulePriceOverrideRow[]) {
            priceOverridesByProductId[row.product_id] = row;
        }
    }

    const publicSections = sections
        .map(section => {
            const items = normalizeMany(section.items)
                .slice()
                .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))
                .flatMap(item => {
                    const product = normalizeOne(item.product);
                    if (!product) return [];

                    const visibleOverride =
                        visibleOverridesByProductId[product.id]?.visible_override;
                    const visible = visibleOverride ?? item.visible ?? true;
                    if (!visible) return [];

                    const priceOverride = priceOverridesByProductId[product.id];
                    const effectivePrice =
                        priceOverride?.override_price ?? product.base_price ?? null;
                    const originalPrice = priceOverride?.show_original_price
                        ? (product.base_price ?? null)
                        : null;

                    return [
                        {
                            id: item.id,
                            name: product.name,
                            description: product.description ?? null,
                            image: null,
                            price: effectivePrice,
                            effective_price: effectivePrice,
                            original_price: originalPrice
                        }
                    ];
                });

            return {
                id: section.id,
                name: section.label ?? "Senza categoria",
                items
            };
        })
        .filter(section => section.items.length > 0);

    const resolvedStyle = resolveCollectionStyle(safeCollectionStyle(catalog.style ?? null), {});

    return {
        title: catalog.name,
        sections: publicSections,
        style: resolvedStyle
    };
}
