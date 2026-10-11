import { lazy, Suspense, type ComponentProps } from "react";
import CollectionView from "@/components/PublicCollectionView/CollectionView/CollectionView";
import Island from "./island/Island";
import type { HeaderSlot } from "./slots";

/**
 * Radice del redesign della pagina pubblica, scelta da `PublicCatalogReady`
 * solo con `PUBLIC_REDESIGN_ENABLED`. Per ora è uno scheletro: rende la pagina
 * di oggi. Le PR successive sostituiscono i pezzi uno alla volta (isola, barra,
 * fogli...) senza toccare `CollectionView.tsx`, che si spegne alla fine.
 *
 * Nei file di questa cartella non importare `.scss` finché serve: un modulo con
 * effetti di bordo non si elimina col flag spento e pesa nel bundle di tutti.
 */
// /*#__PURE__*/: senza, `lazy()` è un effetto di bordo e il chunk entra nel bundle anche col flag spento.
const ProvaTecnica = /*#__PURE__*/ lazy(() => import("./prova/ProvaTecnica"));

const renderIsland: HeaderSlot = context => <Island {...context} />;

export default function RedesignCollectionView(props: ComponentProps<typeof CollectionView>) {
    // Pagina di prova della PR 1: `?prova-tecnica=1` su una sede, solo con il flag.
    if (typeof window !== "undefined" && new URLSearchParams(window.location.search).has("prova-tecnica")) {
        return (
            <Suspense fallback={null}>
                <ProvaTecnica />
            </Suspense>
        );
    }
    return <CollectionView {...props} headerSlot={renderIsland} />;
}
