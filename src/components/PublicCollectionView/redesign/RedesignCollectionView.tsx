import {
    Component,
    lazy,
    Suspense,
    useCallback,
    useContext,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
    type ComponentProps,
    type CSSProperties,
    type ReactNode
} from "react";
import { useNavigate } from "react-router-dom";
import CollectionView from "@/components/PublicCollectionView/CollectionView/CollectionView";
import { LanguageContext } from "@/context/Language/LanguageContext";
import Island, { type MenuSwitch } from "./island/Island";
import { MENU_BUTTON_ID } from "./island/anchors";
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
import type { BottomBarSlot, FeaturedSlot, FooterSlot, HeaderSlot, SheetsSlot, SheetsSlotContext, StorySlot } from "./slots";
import type { MenuSource } from "./menus/menuSource";
import { useMenuChoice } from "./menus/useMenuChoice";
import { animateBrowserBack, passageRunning, runMenuPassage } from "./menus/menuPassage";
import { nowMenus, shouldChoose } from "./menus/menuList";
import type { MenuSheetBinding } from "./menus/menuSheet";
import { useDemoMenus } from "./menus/provaMenu";
import { findInMenus, otherNowCatalogs } from "./menus/menuProducts";
import type { PublicMenu } from "@/types/resolvedCollections";

/**
 * Radice della pagina pubblica, montata sempre da `PublicCatalogReady` (dalla
 * PR 13). Monta `CollectionView` e le passa gli slot del redesign (isola, barra,
 * fogli, In evidenza, fondo); la pagina vecchia si toglie con la PR di pulizia.
 *
 * Nei file di questa cartella non importare `.scss` finché serve: un modulo con
 * effetti di bordo entra nel bundle iniziale e pesa al primo caricamento.
 */
// /*#__PURE__*/: senza, `lazy()` è un effetto di bordo e non si elimina dove non serve.
const ProvaTecnica = /*#__PURE__*/ lazy(() => import("./prova/ProvaTecnica"));

// Il foglio del locale arriva dopo il primo disegno: chunk a parte, scaldato
// quando il telefono è libero e comunque caricato al primo tocco che lo apre.
const loadVenueSheets = () => import("./sheets/VenueSheets");
const VenueSheets = /*#__PURE__*/ lazy(loadVenueSheets);
const StoryTab = /*#__PURE__*/ lazy(() => import("./story/StoryTab"));

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
    const wasChoosing = useRef(choosing);
    const chooserSeen = useRef(false);
    const focusAfterChoice = useRef(false);
    // Chi aspetta il disegno del menu (o della scelta) per il passaggio animato.
    const drawnWaiters = useRef<Array<() => void>>([]);
    useLayoutEffect(() => {
        const leftChooser = wasChoosing.current && !choosing;
        wasChoosing.current = choosing;
        // Uscita dalla scelta: le volte dopo le card restano ferme.
        if (leftChooser) chooserSeen.current = true;
        if (shownId.current !== chosenId || leftChooser) {
            shownId.current = chosenId;
            // Menu nuovo, o appena scelto: si parte dalla cima (prima della fotografia d'arrivo del passaggio).
            window.scrollTo(0, 0);
        }
        // Dopo il tocco su una card il fuoco va al selettore del menu, non resta sul body.
        if (leftChooser && focusAfterChoice.current) {
            focusAfterChoice.current = false;
            document.getElementById(MENU_BUTTON_ID)?.focus({ preventScroll: true });
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
        (menu: PublicMenu) =>
            runMenuPassage(
                "go",
                () => {
                    focusAfterChoice.current = true;
                    choose(menu.slug, "chooser");
                },
                whenDrawn
            ),
        [choose, whenDrawn]
    );
    // «Tutti i menu» dal foglio: il menu esce subito a destra col foglio sopra e scopre la scelta.
    // Il foglio c'è solo nella fotografia di partenza: in quella d'arrivo è già nascosto
    // (`data-sheet-off`), mentre si chiude davvero sotto il passaggio.
    const showAllMenus = useCallback(() => {
        const root = document.documentElement;
        void loadMenuChooser()
            .catch(() => undefined)
            .then(() =>
                runMenuPassage(
                    "back",
                    () => {
                        root.dataset.sheetOff = "";
                        closeSheet();
                        backToChooser();
                    },
                    whenDrawn,
                    () => delete root.dataset.sheetOff
                )
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
        // Il nome viene dal menu, non dal titolo del catalogo: il selettore c'è anche negli
        // stili che nascondono il nome del catalogo.
        return { position: index + 1, total: menuSheet.menus.length, name: currentMenu?.name ?? null };
    }, [menuSheet, currentMenu]);
    const renderIsland = useCallback<HeaderSlot>(context => <Island {...context} menuSwitch={menuSwitch} />, [menuSwitch]);
    // Il locale ha la copertina: la foto del cappello la sostituisce nell'isola invece di stare nel cappello.
    const hasVenueCover = !!(props.style.showCoverImage && props.businessImage);
    const renderStory = useCallback<StorySlot>(
        context => <StoryTab {...context} activityName={props.businessName} hasVenueCover={hasVenueCover} />,
        [props.businessName, hasVenueCover]
    );
    // Le card salgono in cascata solo la prima volta; tornando alla scelta restano ferme.
    // Dall'indietro del browser la scelta rientra da sinistra (vedi `animateBrowserBack`).
    // Si decide quando la scelta compare e poi resta: un nuovo render non la ricalcola.
    const entranceRef = useRef<"rise" | "still" | "back">("rise");
    if (choosing && !wasChoosing.current) {
        entranceRef.current = !chooserSeen.current
            ? "rise"
            : !passageRunning() && animateBrowserBack()
              ? "back"
              : "still";
    }
    const chooserEntrance = entranceRef.current;
    useEffect(() => keepPreferencesFor(props.activityId), [props.activityId]);
    // Storia (v38): quando il menu è pronto, in sottofondo, il chunk e l'elenco; il primo tocco non aspetta.
    const storySlug = props.mode === "public" && props.hasStory ? props.slug : undefined;
    useEffect(() => {
        if (!storySlug) return;
        const warm = () => void import("./story/storyStore").then(store => store.prefetchStories(storySlug));
        if (typeof window.requestIdleCallback === "function") {
            const id = window.requestIdleCallback(warm, { timeout: 3000 });
            return () => window.cancelIdleCallback(id);
        }
        const id = window.setTimeout(warm, 1500);
        return () => window.clearTimeout(id);
    }, [storySlug]);
    // «Prenota un tavolo» nella scelta: i passi nel foglio se la sede prenota lì,
    // altrimenti la pagina /prenota, come il ⋯ e il fondo pagina.
    const navigate = useNavigate();
    const langCtx = useContext(LanguageContext);
    const { enableReservations, slug } = props;
    const openReservation = useMemo(() => {
        if (booking) return openBookingSheet;
        if (!enableReservations || !slug) return undefined;
        return () => {
            const lang = langCtx?.currentLang;
            const base = langCtx?.baseLanguage;
            navigate(lang && lang !== base ? `/${slug}/${lang}/prenota` : `/${slug}/prenota`);
        };
    }, [booking, enableReservations, slug, langCtx?.currentLang, langCtx?.baseLanguage, navigate]);
    // Con la sede che prenota, «Prenota» apre i passi nel foglio invece della pagina /prenota.
    // Gli altri menu di adesso, per il carrello: si ordina da tutti (piano 9b, passo 4).
    const otherMenuGroups = useMemo(
        () =>
            menus
                ? otherNowCatalogs(menuList, chosenId, menus.catalog).map(catalog => menus.view(catalog).sectionGroups)
                : [],
        [menus, menuList, chosenId]
    );
    const sheetsSlot = useMemo<SheetsSlot>(
        () => ({
            ...baseSheetsSlot,
            render: context => (
                <LazyVenueSheets
                    {...context}
                    product={{ ...context.product, findProduct: findInMenus(context.product.findProduct, otherMenuGroups) }}
                    booking={booking}
                    menus={menuSheet}
                />
            ),
            openBooking: booking ? openBookingSheet : undefined,
            preferenceFilter: {
                count: preferences.length,
                test: item => matchesPreferences(item, preferences),
                clear: clearPreferences
            }
        }),
        [booking, preferences, menuSheet, otherMenuGroups]
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
                        onOpenBooking={openReservation}
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
                    storySlot={renderStory}
                />
            </div>
        </>
    );
}
