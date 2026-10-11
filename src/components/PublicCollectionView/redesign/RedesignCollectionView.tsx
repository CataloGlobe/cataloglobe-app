import { lazy, Suspense, useEffect, useState, type ComponentProps } from "react";
import CollectionView from "@/components/PublicCollectionView/CollectionView/CollectionView";
import Island from "./island/Island";
import BottomBar from "./bar/BottomBar";
import { useSheetState } from "./sheets/sheetStack";
import { openVenueSheet } from "./sheets/venueSheetPages";
import type { BottomBarSlot, HeaderSlot, SheetsSlot, SheetsSlotContext } from "./slots";

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

// Il foglio del locale arriva dopo il primo disegno: chunk a parte, scaldato
// quando il telefono è libero e comunque caricato al primo tocco che lo apre.
const loadVenueSheets = () => import("./sheets/VenueSheets");
const VenueSheets = /*#__PURE__*/ lazy(loadVenueSheets);

function LazyVenueSheets(context: SheetsSlotContext) {
    const isOpen = useSheetState().pages.length > 0;
    const [needed, setNeeded] = useState(false);
    if (isOpen && !needed) setNeeded(true);
    useEffect(() => {
        const warm = () => void loadVenueSheets();
        if (typeof window.requestIdleCallback === "function") {
            const id = window.requestIdleCallback(warm, { timeout: 3000 });
            return () => window.cancelIdleCallback(id);
        }
        const id = window.setTimeout(warm, 1500);
        return () => window.clearTimeout(id);
    }, []);
    if (!needed) return null;
    return (
        <Suspense fallback={null}>
            <VenueSheets {...context} />
        </Suspense>
    );
}

const renderIsland: HeaderSlot = context => <Island {...context} />;
const renderBottomBar: BottomBarSlot = context => <BottomBar {...context} />;
const sheetsSlot: SheetsSlot = {
    render: context => <LazyVenueSheets {...context} />,
    open: openVenueSheet
};

export default function RedesignCollectionView(props: ComponentProps<typeof CollectionView>) {
    // Pagina di prova della PR 1: `?prova-tecnica=1` su una sede, solo con il flag.
    if (typeof window !== "undefined" && new URLSearchParams(window.location.search).has("prova-tecnica")) {
        return (
            <Suspense fallback={null}>
                <ProvaTecnica />
            </Suspense>
        );
    }
    return <CollectionView {...props} headerSlot={renderIsland} bottomBarSlot={renderBottomBar} sheetsSlot={sheetsSlot} />;
}
