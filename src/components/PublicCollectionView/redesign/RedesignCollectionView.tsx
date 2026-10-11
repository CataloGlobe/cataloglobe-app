import { Component, lazy, Suspense, useEffect, useMemo, useState, type ComponentProps, type ReactNode } from "react";
import CollectionView from "@/components/PublicCollectionView/CollectionView/CollectionView";
import Island from "./island/Island";
import BottomBar from "./bar/BottomBar";
import FeaturedStrip from "./featured/FeaturedStrip";
import VenueFooter from "./footer/VenueFooter";
import { closeSheet, getSheetState, useSheetState } from "./sheets/sheetStack";
import { openVenueSheet } from "./sheets/venueSheetPages";
import { openProductSheet } from "./product/productSheet";
import { openRateSheet } from "./vote/rateSheet";
import { openBookingSheet } from "./booking/bookingSheet";
import type { BookingConfig } from "./booking/bookingForm";
import AddedNotice from "./order/AddedNotice";
import { showAdded } from "./order/addedNoticeStore";
import type { BottomBarSlot, FeaturedSlot, FooterSlot, HeaderSlot, SheetsSlot, SheetsSlotContext } from "./slots";

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

/**
 * Il chunk del foglio che non arriva (rete giù, file vecchi dopo un deploy) non
 * deve far cadere la pagina intera su `PublicErrorBoundary`: il foglio si chiude
 * e al tocco dopo si riprova.
 */
class SheetsBoundary extends Component<{ children: ReactNode; onError: () => void }, { failed: boolean }> {
    state = { failed: false };
    static getDerivedStateFromError() {
        return { failed: true };
    }
    componentDidCatch() {
        closeSheet();
        this.props.onError();
    }
    render() {
        return this.state.failed ? null : this.props.children;
    }
}

function LazyVenueSheets({ booking, ...context }: SheetsSlotContext & { booking: BookingConfig | null }) {
    const isOpen = useSheetState().pages.length > 0;
    const [needed, setNeeded] = useState(false);
    // Dopo un errore un `lazy` nuovo: quello vecchio tiene la promessa fallita.
    const [Sheets, setSheets] = useState(() => VenueSheets);
    const [attempt, setAttempt] = useState(0);
    if (isOpen && !needed) setNeeded(true);
    useEffect(() => {
        // Senza rete il preriscaldamento fallisce in silenzio: ci pensa il tocco.
        const warm = () => void loadVenueSheets().catch(() => undefined);
        if (typeof window.requestIdleCallback === "function") {
            const id = window.requestIdleCallback(warm, { timeout: 3000 });
            return () => window.cancelIdleCallback(id);
        }
        const id = window.setTimeout(warm, 1500);
        return () => window.clearTimeout(id);
    }, []);
    // L'avviso «Aggiunto» vive fuori dal foglio: resta a vista dopo la chiusura e serve anche al + della lista.
    return (
        <>
            <AddedNotice />
            {needed ? (
                <SheetsBoundary
                    key={attempt}
                    onError={() => {
                        setNeeded(false);
                        setSheets(() => lazy(loadVenueSheets));
                        setAttempt(value => value + 1);
                    }}
                >
                    <Suspense fallback={null}>
                        <Sheets {...context} booking={booking} />
                    </Suspense>
                </SheetsBoundary>
            ) : null}
        </>
    );
}

const renderIsland: HeaderSlot = context => <Island {...context} />;
const renderBottomBar: BottomBarSlot = context => <BottomBar {...context} />;
const renderFeatured: FeaturedSlot = context => <FeaturedStrip {...context} />;
const renderFooter: FooterSlot = context => <VenueFooter {...context} />;
const baseSheetsSlot: Omit<SheetsSlot, "render"> = {
    open: openVenueSheet,
    openProduct: openProductSheet,
    isOpen: () => getSheetState().pages.length > 0,
    notifyAdded: showAdded,
    openRate: openRateSheet
};

export default function RedesignCollectionView({
    booking = null,
    ...props
}: ComponentProps<typeof CollectionView> & { booking?: BookingConfig | null }) {
    // Con la sede che prenota, «Prenota» apre i passi nel foglio invece della pagina /prenota.
    const sheetsSlot = useMemo<SheetsSlot>(
        () => ({
            ...baseSheetsSlot,
            render: context => <LazyVenueSheets {...context} booking={booking} />,
            openBooking: booking ? openBookingSheet : undefined
        }),
        [booking]
    );
    // Pagina di prova della PR 1: `?prova-tecnica=1` su una sede, solo con il flag.
    if (typeof window !== "undefined" && new URLSearchParams(window.location.search).has("prova-tecnica")) {
        return (
            <Suspense fallback={null}>
                <ProvaTecnica />
            </Suspense>
        );
    }
    return (
        <CollectionView
            {...props}
            headerSlot={renderIsland}
            bottomBarSlot={renderBottomBar}
            sheetsSlot={sheetsSlot}
            featuredSlot={renderFeatured}
            footerSlot={renderFooter}
        />
    );
}
