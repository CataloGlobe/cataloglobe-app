import type { PublicCollection } from "@/types/collectionPublic";

type ApiPublicItem = {
    id: string;
    name: string;
    description?: string;
    price?: number;
    image?: string;
    category_id: string;
};

type ApiPublicCollectionData = {
    categories: { id: string; name: string; order_index: number }[];
    items: Record<string, ApiPublicItem[]>;
};

export function mapGetPublicCollectionToView(params: {
    title: string;
    api: ApiPublicCollectionData;
}): PublicCollection {
    const { title, api } = params;

    const sections = [...api.categories]
        .sort((a, b) => a.order_index - b.order_index)
        .map(cat => ({
            id: cat.id,
            name: cat.name,
            items: (api.items[cat.id] ?? []).map(it => ({
                id: it.id,
                name: it.name,
                description: it.description ?? null,
                price: it.price ?? null,
                image: it.image ?? null
            }))
        }));

    // style “default” per ora: lo agganceremo allo style della collection nello STEP D
    return {
        title,
        sections,
        style: {
            backgroundColor: "#ffffff",
            cardRadius: 16,
            cardTemplate: "left"
        }
    };
}
