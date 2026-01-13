import { PublicCollection } from "@/types/collectionPublic";
import { supabase } from "./client";
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
import { getBusinessOverridesForItems } from "./overrides";

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

export async function getPublicCollectionById(collectionId: string): Promise<PublicCollection> {
    const { data: collection } = await supabase
        .from("collections")
        .select("id, name, style")
        .eq("id", collectionId)
        .single();

    if (!collection) throw new Error("Collection not found");

    const sections = await listSections(collectionId);
    const items = await getCollectionItemsWithData(collectionId);

    const itemsBySection = new Map<string, typeof items>();

    for (const it of items) {
        if (!it.visible) continue;
        const arr = itemsBySection.get(it.section_id) ?? [];
        arr.push(it);
        itemsBySection.set(it.section_id, arr);
    }

    const publicSections = sections
        .map(section => {
            const sectionItems = itemsBySection.get(section.id) ?? [];
            return {
                id: section.id,
                name: section.label,
                items: sectionItems.map(it => ({
                    id: it.id,
                    name: it.item.name,
                    description: it.item.description ?? null,
                    image: it.item.metadata?.image ?? null,
                    price: it.item.base_price ?? null
                }))
            };
        })
        .filter(s => s.items.length > 0);

    const resolvedStyle = resolveCollectionStyle(safeCollectionStyle(collection.style ?? null), {});

    return {
        title: collection.name,
        sections: publicSections,
        style: resolvedStyle
    };
}

export async function getPublicBusinessCollection(
    businessId: string,
    collectionId: string
): Promise<PublicCollection> {
    const { data: collection } = await supabase
        .from("collections")
        .select("id, name, style")
        .eq("id", collectionId)
        .single();

    if (!collection) throw new Error("Collection not found");

    const sections = await listSections(collectionId);
    const items = await getCollectionItemsWithData(collectionId);

    // 🔹 carica override
    const itemIds = items.map(it => it.item.id);
    const overrides = await getBusinessOverridesForItems(businessId, itemIds);

    const itemsBySection = new Map<string, typeof items>();

    for (const it of items) {
        const override = overrides[it.item.id];

        // visibilità finale
        const visible = override?.visible_override ?? it.visible ?? true;

        if (!visible) continue;

        const arr = itemsBySection.get(it.section_id) ?? [];
        arr.push({
            ...it,
            item: {
                ...it.item,
                base_price: override?.price_override ?? it.item.base_price
            }
        });
        itemsBySection.set(it.section_id, arr);
    }

    const publicSections = sections
        .map(section => {
            const sectionItems = itemsBySection.get(section.id) ?? [];
            return {
                id: section.id,
                name: section.label,
                items: sectionItems.map(it => ({
                    id: it.id,
                    name: it.item.name,
                    description: it.item.description ?? null,
                    image: it.item.metadata?.image ?? null,
                    price: it.item.base_price ?? null
                }))
            };
        })
        .filter(s => s.items.length > 0);

    const resolvedStyle = resolveCollectionStyle(safeCollectionStyle(collection.style ?? null), {});

    return {
        title: collection.name,
        sections: publicSections,
        style: resolvedStyle
    };
}
