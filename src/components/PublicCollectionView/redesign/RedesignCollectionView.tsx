import type { ComponentProps } from "react";
import CollectionView from "@/components/PublicCollectionView/CollectionView/CollectionView";

/**
 * Radice del redesign della pagina pubblica, scelta da `PublicCatalogReady`
 * solo con `PUBLIC_REDESIGN_ENABLED`. Per ora è uno scheletro: rende la pagina
 * di oggi. Le PR successive sostituiscono i pezzi uno alla volta (isola, barra,
 * fogli...) senza toccare `CollectionView.tsx`, che si spegne alla fine.
 *
 * Nei file di questa cartella non importare `.scss` finché serve: un modulo con
 * effetti di bordo non si elimina col flag spento e pesa nel bundle di tutti.
 */
export default function RedesignCollectionView(props: ComponentProps<typeof CollectionView>) {
    return <CollectionView {...props} />;
}
