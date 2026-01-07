import CollectionView from "@/components/PublicCollectionView/CollectionView/CollectionView";
import type { PublicCollection } from "@/types/collectionPublic";
import type { Business } from "@/types/database";

type Props = {
    business: Pick<Business, "name" | "cover_image">;
    collection: PublicCollection;
    overlayCollection?: PublicCollection | null;
};

export default function PublicCollectionView({ business, collection, overlayCollection }: Props) {
    /* ============================
       BUILD SECTIONS
    ============================ */

    const overlaySections =
        overlayCollection?.sections.map(s => ({
            id: `overlay-${s.id}`,
            name: s.name,
            items: s.items.map(it => ({
                id: it.id,
                name: it.name,
                description: it.description ?? null,
                image: it.image ?? null,
                price: it.price ?? null
            }))
        })) ?? [];

    const primarySections = collection.sections.map(s => ({
        id: s.id,
        name: s.name,
        items: s.items.map(it => ({
            id: it.id,
            name: it.name,
            description: it.description ?? null,
            image: it.image ?? null,
            price: it.price ?? null
        }))
    }));

    const sections = [
        ...(overlaySections.length > 0
            ? [
                  {
                      id: "__overlay__",
                      name: "In evidenza",
                      items: []
                  }
              ]
            : []),
        ...overlaySections,
        ...primarySections
    ];

    return (
        <CollectionView
            mode="public"
            businessName={business.name}
            businessImage={business.cover_image ?? null}
            collectionTitle={collection.title}
            sections={sections}
            style={collection.style}
        />
    );
}
