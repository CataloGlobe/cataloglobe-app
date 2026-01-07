import type { CollectionSection, CollectionItemWithItem } from "@/types/database";
import type { PublicCollection } from "@/types/collectionPublic";
import type { CollectionStyle } from "@/types/collectionStyle";

export function mapCollectionToPublic(params: {
    title: string;
    sections: CollectionSection[];
    items: CollectionItemWithItem[];
    style: Required<CollectionStyle>;
}): PublicCollection {
    const { title, sections, items, style } = params;

    const itemsBySection = new Map<string, CollectionItemWithItem[]>();

    for (const it of items) {
        if (!it.visible) continue;
        if (!it.section_id) continue;

        const arr = itemsBySection.get(it.section_id) ?? [];
        arr.push(it);
        itemsBySection.set(it.section_id, arr);
    }

    return {
        title,
        style,
        sections: sections.map(section => ({
            id: section.id,
            name: section.name,
            items: (itemsBySection.get(section.id) ?? [])
                .sort((a, b) => a.order_index - b.order_index)
                .map(it => ({
                    id: it.id,
                    name: it.item.name,
                    description: it.item.description ?? null,
                    price: it.item.base_price ?? null
                }))
        }))
    };
}
