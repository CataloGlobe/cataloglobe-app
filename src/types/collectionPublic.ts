import type { CollectionStyle } from "@/types/collectionStyle";

export type PublicCollectionSectionItem = {
    id: string;
    name: string;
    description: string | null;
    image?: string | null;
    price: number | null;
};

export type PublicCollectionSection = {
    id: string;
    name: string;
    items: PublicCollectionSectionItem[];
};

export type PublicCollection = {
    title: string;
    sections: PublicCollectionSection[];
    style: Required<CollectionStyle>;
};
