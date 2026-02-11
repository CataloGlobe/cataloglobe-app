import type { SupabaseClient } from "@supabase/supabase-js";
import {
    resolveCollectionStyle,
    safeCollectionStyle,
    type CollectionStyle
} from "../../src/types/collectionStyle";

type PdfItem = {
    id: string;
    name: string;
    description: string | null;
    price: number | null;
    image: string | null;
};

export type PdfSection = {
    id: string;
    name: string;
    items: PdfItem[];
};

export type CatalogPdfData = {
    business: {
        id: string;
        name: string;
        slug: string;
        address: string | null;
        city: string | null;
        coverImage: string | null;
    };
    collection: {
        id: string;
        name: string;
    };
    style: Required<CollectionStyle>;
    sections: PdfSection[];
};

type RawItemRow = {
    id: string;
    section_id: string;
    order_index: number;
    visible: boolean;
    item:
        | {
              id: string;
              name: string;
              description: string | null;
              base_price: number | string | null;
              metadata: unknown;
          }
        | {
              id: string;
              name: string;
              description: string | null;
              base_price: number | string | null;
              metadata: unknown;
          }[];
};

type OverrideRow = {
    item_id: string;
    price_override: number | string | null;
    visible_override: boolean | null;
};

function toNumber(value: number | string | null | undefined): number | null {
    if (value === null || value === undefined) return null;
    const parsed = typeof value === "number" ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

function getImageFromMetadata(metadata: unknown): string | null {
    if (!metadata) return null;

    if (typeof metadata === "string") {
        try {
            const parsed = JSON.parse(metadata);
            if (isRecord(parsed) && typeof parsed.image === "string") return parsed.image;
        } catch {
            return null;
        }
    }

    if (isRecord(metadata) && typeof metadata.image === "string") {
        return metadata.image;
    }

    return null;
}

export async function fetchCatalogPdfData(params: {
    supabase: SupabaseClient;
    userId: string;
    businessId: string;
    catalogId: string;
}): Promise<CatalogPdfData> {
    const { supabase, userId, businessId, catalogId } = params;

    const [businessRes, collectionRes, associationRes] = await Promise.all([
        supabase
            .from("businesses")
            .select("id, name, slug, address, city, cover_image")
            .eq("id", businessId)
            .eq("user_id", userId)
            .single(),
        supabase
            .from("collections")
            .select("id, name, style")
            .eq("id", catalogId)
            .eq("user_id", userId)
            .single(),
        supabase
            .from("business_collection_schedules")
            .select("id", { count: "exact", head: true })
            .eq("business_id", businessId)
            .eq("collection_id", catalogId)
    ]);

    if (businessRes.error || !businessRes.data) {
        throw new Error("Attività non trovata.");
    }

    if (collectionRes.error || !collectionRes.data) {
        throw new Error("Catalogo non trovato.");
    }

    if (associationRes.error) throw associationRes.error;

    if ((associationRes.count ?? 0) === 0) {
        throw new Error("Catalogo non associato all'attività.");
    }

    const [sectionsRes, itemsRes] = await Promise.all([
        supabase
            .from("collection_sections")
            .select("id, label, order_index")
            .eq("collection_id", catalogId)
            .order("order_index"),
        supabase
            .from("collection_items")
            .select(
                `
                id,
                section_id,
                order_index,
                visible,
                item:items (
                  id,
                  name,
                  description,
                  base_price,
                  metadata
                )
                `
            )
            .eq("collection_id", catalogId)
            .order("order_index")
    ]);

    if (sectionsRes.error) throw sectionsRes.error;
    if (itemsRes.error) throw itemsRes.error;

    const rawItems = (itemsRes.data ?? []) as RawItemRow[];

    const itemIds = rawItems.map(row => {
        const rawItem = Array.isArray(row.item) ? row.item[0] : row.item;
        return rawItem?.id;
    }).filter(Boolean) as string[];

    const overridesRes = itemIds.length
        ? await supabase
              .from("business_item_overrides")
              .select("item_id, price_override, visible_override")
              .eq("business_id", businessId)
              .in("item_id", itemIds)
        : { data: [] as OverrideRow[], error: null };

    if (overridesRes.error) throw overridesRes.error;

    const overridesByItem = new Map<string, OverrideRow>();
    for (const row of overridesRes.data ?? []) {
        overridesByItem.set(row.item_id, row);
    }

    const itemsBySection = new Map<string, PdfItem[]>();

    for (const row of rawItems) {
        const rawItem = Array.isArray(row.item) ? row.item[0] : row.item;
        if (!rawItem) continue;

        const override = overridesByItem.get(rawItem.id);
        const visible = override?.visible_override ?? row.visible ?? true;
        if (!visible) continue;

        const price = toNumber(override?.price_override ?? rawItem.base_price ?? null);

        const entry: PdfItem = {
            id: rawItem.id,
            name: rawItem.name,
            description: rawItem.description ?? null,
            price,
            image: getImageFromMetadata(rawItem.metadata)
        };

        const list = itemsBySection.get(row.section_id) ?? [];
        list.push(entry);
        itemsBySection.set(row.section_id, list);
    }

    const sections = (sectionsRes.data ?? [])
        .map(section => ({
            id: section.id,
            name: section.label,
            items: itemsBySection.get(section.id) ?? []
        }))
        .filter(section => section.items.length > 0);

    const resolvedStyle = resolveCollectionStyle(
        safeCollectionStyle(collectionRes.data.style ?? null),
        {}
    );

    return {
        business: {
            id: businessRes.data.id,
            name: businessRes.data.name,
            slug: businessRes.data.slug,
            address: businessRes.data.address,
            city: businessRes.data.city,
            coverImage: businessRes.data.cover_image
        },
        collection: {
            id: collectionRes.data.id,
            name: collectionRes.data.name
        },
        style: resolvedStyle,
        sections
    };
}
