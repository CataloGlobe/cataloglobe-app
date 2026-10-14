import type { ComponentProps } from "react";
import type CollectionView from "@/components/PublicCollectionView/CollectionView/CollectionView";
import type { PublicMenu, ResolvedCatalog } from "@/types/resolvedCollections";

/** Le props di `CollectionView` che cambiano col menu scelto. */
export type CatalogViewProps = Pick<
    ComponentProps<typeof CollectionView>,
    "collectionTitle" | "sectionGroups" | "catalogCharacteristics"
>;

/**
 * Ciò che serve al redesign per «Scegli il menu», da `PublicCatalogReady`:
 * l'elenco dei menu (assente finché il giudice non lo manda), il catalogo di oggi
 * (per i menu finti di `?prova-menu=1`) e come trasformare un catalogo nelle props.
 */
export type MenuSource = {
    list: PublicMenu[] | undefined;
    catalog: ResolvedCatalog | undefined;
    view: (catalog: ResolvedCatalog | undefined) => CatalogViewProps;
};
