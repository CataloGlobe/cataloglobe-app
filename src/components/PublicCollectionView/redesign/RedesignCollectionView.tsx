import {
    Component,
    lazy,
    Suspense,
    useCallback,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
    type ComponentProps,
    type CSSProperties,
    type ReactNode
} from "react";
import CollectionView from "@/components/PublicCollectionView/CollectionView/CollectionView";
import Island, { type MenuSwitch } from "./island/Island";
import BottomBar from "./bar/BottomBar";
import FeaturedStrip from "./featured/FeaturedStrip";
import VenueFooter from "./footer/VenueFooter";
import { closeSheet, getSheetState, useSheetState } from "./sheets/sheetStack";
import { openVenueSheet } from "./sheets/venueSheetPages";
import { openProductSheet } from "./product/productSheet";
import { openRateSheet } from "./vote/rateSheet";
import { openBookingSheet } from "./booking/bookingSheet";
import { clearPreferences, keepPreferencesFor, matchesPreferences, usePreferences } from "./search/preferences";
import type { BookingConfig } from "./booking/bookingForm";
import AddedNotice from "./order/AddedNotice";
import { showAdded } from "./order/addedNoticeStore";
import type { BottomBarSlot, FeaturedSlot, FooterSlot, HeaderSlot, SheetsSlot, SheetsSlotContext } from "./slots";
import type { MenuSource } from "./menus/menuSource";
import { useMenuChoice } from "./menus/useMenuChoice";
import { reducedMotion, runMenuPassage } from "./menus/menuPassage";
import { nowMenus, shouldChoose } from "./menus/menuList";
import type { MenuSheetBinding } from "./menus/menuSheet";
import { EXIT_DURATION_MS } from "./sheets/sheetMotion";
import { useDemoMenus } from "./menus/provaMenu";
import type { PublicMenu } from "@/types/resolvedCollections";

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

// «Scegli il menu»: chunk a parte, serve solo alle sedi con più menu adesso.
const loadMenuChooser = () => import("./menus/MenuChooser");
const MenuChooser = /*#__PURE__*/ lazy(loadMenuChooser);
// Finché il chunk arriva, un fondo pieno copre il menu che sta sotto (niente lampo).
const CHOOSER_PLACEHOLDER: CSSProperties = { position: "fixed", inset: 0, zIndex: 200, background: "var(--pub-bg)" };

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

function LazyVenueSheets({
    booking,
    menus,
    ...context
}: SheetsSlotContext & { booking: BookingConfig | null; menus: MenuSheetBinding | undefined }) {
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
                        <Sheets {...context} booking={booking} menus={menus} />
                    </Suspense>
                </SheetsBoundary>
            ) : null}
        </>
    );
}

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
    menus,
    ...props
}: ComponentProps<typeof CollectionView> & { booking?: BookingConfig | null; menus?: MenuSource }) {
    const preferences = usePreferences();
    // «Scegli il menu» (spec §12): il menu scelto cambia solo le props del catalogo;
    // `CollectionView` non si rimonta, così il carrello (suo stato) resta.
    // Finché il giudice non manda l'elenco, `?prova-menu=1` ne costruisce uno finto.
    const demoMenus = useDemoMenus(menus?.catalog, !menus?.list);
    const menuList = menus?.list ?? demoMenus;
    const menuChoice = useMenuChoice(menuList, { preview: props.mode !== "public" });
    const chosenCatalog = menuChoice.menu?.catalog;
    const menuView = useMemo(
        () => (chosenCatalog && menus ? menus.view(chosenCatalog) : null),
        [chosenCatalog, menus]
    );
    const { choosing, choose, backToChooser } = menuChoice;
    const preview = props.mode !== "public";
    const chosenId = menuChoice.menu?.catalogId;
    const shownId = useRef(chosenId);
    // Chi aspetta il disegno del menu (o della scelta) per il passaggio animato.
    const drawnWaiters = useRef<Array<() => void>>([]);
    useLayoutEffect(() => {
        if (shownId.current !== chosenId) {
            shownId.current = chosenId;
            // Menu nuovo: si parte dalla cima (prima della fotografia d'arrivo del passaggio).
            window.scrollTo(0, 0);
        }
        drawnWaiters.current.splice(0).forEach(resolve => resolve());
    }, [chosenId, choosing]);
    const whenDrawn = useCallback(
        () =>
            new Promise<void>(resolve => {
                drawnWaiters.current.push(resolve);
                // Rete di sicurezza: il browser non resta fermo se il disegno non arriva.
                window.setTimeout(resolve, 600);
            }),
        []
    );
    const chooseFromChooser = useCallback(
        (menu: PublicMenu) => runMenuPassage("go", () => choose(menu.slug, "chooser"), whenDrawn),
        [choose, whenDrawn]
    );
    // «Tutti i menu» dal foglio: prima il foglio si chiude, poi il menu esce a destra e scopre la scelta.
    const showAllMenus = useCallback(() => {
        closeSheet();
        const chunk = loadMenuChooser().catch(() => undefined);
        window.setTimeout(
            () => void chunk.then(() => runMenuPassage("back", backToChooser, whenDrawn)),
            reducedMotion() ? 0 : EXIT_DURATION_MS + 20
        );
    }, [backToChooser, whenDrawn]);
    // Foglio «Menu disponibili ora», «Cambia menu» nel ⋯ e selettore nell'isola: solo con più menu adesso.
    const currentMenu = menuChoice.menu;
    const switchable = shouldChoose(menuList, { preview });
    const menuSheet = useMemo<MenuSheetBinding | undefined>(() => {
        if (!switchable) return undefined;
        return {
            menus: nowMenus(menuList),
            current: currentMenu,
            choose: menu => {
                closeSheet();
                if (menu.catalogId !== currentMenu?.catalogId) choose(menu.slug, "sheet");
            },
            showAll: showAllMenus
        };
    }, [switchable, menuList, currentMenu, choose, showAllMenus]);
    const menuSwitch = useMemo<MenuSwitch | undefined>(() => {
        if (!menuSheet) return undefined;
        const index = menuSheet.menus.findIndex(menu => menu.catalogId === currentMenu?.catalogId);
        return { position: index + 1, total: menuSheet.menus.length };
    }, [menuSheet, currentMenu]);
    const renderIsland = useCallback<HeaderSlot>(context => <Island {...context} menuSwitch={menuSwitch} />, [menuSwitch]);
    // Le card salgono in cascata solo la prima volta; tornando alla scelta restano ferme.
    const chooserSeen = useRef(false);
    const chooserEntrance = chooserSeen.current ? "still" : "rise";
    useEffect(() => {
        if (choosing) chooserSeen.current = true;
    }, [choosing]);
    useEffect(() => keepPreferencesFor(props.activityId), [props.activityId]);
    // Con la sede che prenota, «Prenota» apre i passi nel foglio invece della pagina /prenota.
    const sheetsSlot = useMemo<SheetsSlot>(
        () => ({
            ...baseSheetsSlot,
            render: context => <LazyVenueSheets {...context} booking={booking} menus={menuSheet} />,
            openBooking: booking ? openBookingSheet : undefined,
            preferenceFilter: {
                count: preferences.length,
                test: item => matchesPreferences(item, preferences),
                clear: clearPreferences
            }
        }),
        [booking, preferences, menuSheet]
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
        <>
            {choosing && menuList ? (
                <Suspense fallback={<div style={CHOOSER_PLACEHOLDER} />}>
                    <MenuChooser
                        menus={menuList}
                        onChoose={chooseFromChooser}
                        entrance={chooserEntrance}
                        activityName={props.businessName}
                        logoUrl={props.style.showLogo ? (props.tenantLogoUrl ?? null) : null}
                        coverImageUrl={props.style.showCoverImage ? props.businessImage : null}
                        openingHours={props.openingHours ?? []}
                        upcomingClosures={props.upcomingClosures ?? []}
                        onOpenBooking={booking ? openBookingSheet : undefined}
                    />
                </Suspense>
            ) : null}
            {/* Il menu resta montato sotto la scelta, inerte (il contenitore non ha box:
                la pagina si dispone come prima). I fogli stanno nel portale, fuori. */}
            <div style={{ display: "contents" }} inert={choosing}>
                <CollectionView
                    {...props}
                    {...menuView}
                    headerSlot={renderIsland}
                    bottomBarSlot={renderBottomBar}
                    sheetsSlot={sheetsSlot}
                    featuredSlot={renderFeatured}
                    footerSlot={renderFooter}
                />
            </div>
        </>
    );
}
