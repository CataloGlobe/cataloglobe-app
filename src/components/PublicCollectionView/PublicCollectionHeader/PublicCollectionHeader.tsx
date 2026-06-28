import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Bell, BookOpen, CalendarDays, ImageIcon, MessageSquareHeart, MoreHorizontal, Search, ShoppingBag } from "lucide-react";
import type { HubTab } from "@/types/collectionStyle";
import { buildCoverImageSet } from "@/utils/imageTransform";
import LanguageSelector from "@components/PublicCollectionView/LanguageSelector/LanguageSelector";
import styles from "./PublicCollectionHeader.module.scss";

// ⚠️ Visibilità tab "events" sincronizzata con PublicBottomBar.tsx (stesso filtro)
const HUB_TABS: { id: HubTab; icon: ReactNode; labelKey: string }[] = [
    { id: "menu", icon: <BookOpen size={14} />, labelKey: "hub.menu" },
    { id: "events", icon: <CalendarDays size={14} />, labelKey: "hub.events" },
    { id: "reviews", icon: <MessageSquareHeart size={14} />, labelKey: "hub.reviews" },
];

// ── Prototype constants (authoritative — do not change) ─────────────────────
const TRANSITION_END = 140;
const BASE_MARGIN_MOBILE = 10;
const BASE_MARGIN_DESKTOP = 16;
const CONTENT_MAX_WIDTH_FALLBACK = 1280; // mirrored in --pub-frame-max-desktop
const TOP_OFFSET = 8;

/** Reads --pub-frame-max-desktop from the given scope (or :root). */
function readContentMaxWidth(el?: HTMLElement | null): number {
    if (typeof document === "undefined") return CONTENT_MAX_WIDTH_FALLBACK;
    const target = el ?? document.documentElement;
    const value = getComputedStyle(target).getPropertyValue("--pub-frame-max-desktop").trim();
    const parsed = parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : CONTENT_MAX_WIDTH_FALLBACK;
}

export const HEADER_HEIGHT_MOBILE = 108;
export const HEADER_HEIGHT_DESKTOP = 116;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export type PublicCollectionHeaderProps = {
    logoUrl?: string | null;
    activityName: string;
    activityAddress?: string | null;
    showAddress?: boolean;
    catalogName?: string | null;
    showCatalogName?: boolean;
    coverImageUrl?: string | null;
    showCoverImage: boolean;
    showLogo: boolean;
    mode: "public" | "preview";
    /** Apre il SearchOverlay. Undefined in preview — nasconde i pulsanti di ricerca. */
    onSearchOpen?: () => void;
    /** Prefetch del chunk SearchOverlay su pointerdown del bottone (toglie
     *  latenza al primo open: il chunk arriva prima del tap-up). Undefined in preview. */
    onSearchPointerDown?: () => void;
    /** Scroll container della preview (deviceScreen). Non usato in public. */
    scrollContainerEl?: HTMLElement | null;
    /** Elemento di riferimento per misurare la larghezza viewport nella preview.
     *  Se presente, ResizeObserver sostituisce window.innerWidth per il calcolo
     *  di initialMargin e isMobile. Non passato in public → fallback a window. */
    viewportWidthEl?: HTMLElement | null;
    /** Border radius iniziale dell'header in px (da tokens.appearance.borderRadius via collectionStyle).
     *  Interpolato da lerp() verso 0 durante lo scroll. Fallback a 16/20 se assente. */
    headerRadius?: number;
    /** Hub navigation tab attiva. Obbligatoria solo quando showHubTabs !== false. */
    activeTab?: HubTab;
    /** Callback per cambio tab. Obbligatoria solo quando showHubTabs !== false. */
    onTabChange?: (tab: HubTab) => void;
    /** Conteggio allergeni filtrati attivi (per badge sul pulsante More). */
    allergensCount?: number;
    /** Apre il MoreSheet (allergeni + info). Undefined in preview. */
    onOpenMore?: () => void;
    /** Mostra le hub tabs (menu/eventi/recensioni). Default true (comportamento storico). */
    showHubTabs?: boolean;
    /** Mostra la tab "events". Default true (retrocompatibile). Filtrata via stessa
     *  logica di PublicBottomBar quando non ci sono featured da mostrare. */
    showEventsTab?: boolean;
    /** Mostra il LanguageSelector. Default true (comportamento storico). */
    showLanguageSelector?: boolean;
    /** Slot opzionale a destra del titolo (es. link "Menu" per pagine non-catalogo). */
    actionSlot?: ReactNode;
    // ── Azioni tavolo desktop (solo public, nascoste ≤640px via @media) ─────────
    // Lo split CSS-driven le mostra >640px e lascia spazio alla bottom-bar mobile
    // ≤640px. I per-button gate (orderVisible/supportVisible) restano dal parent.
    /** Conteggio ordine per il badge del bottone Ordine. */
    selectionCount?: number;
    /** Mostra il bottone Ordine (carrello). */
    orderVisible?: boolean;
    /** Apre il drawer ordine. Undefined ⇒ bottone non renderizzato. */
    onOpenOrder?: () => void;
    /** Mostra il bottone Assistenza (campanello). */
    supportVisible?: boolean;
    /** Apre il drawer Assistenza. Undefined ⇒ bottone non renderizzato. */
    onOpenSupport?: () => void;
    /** Dot promemoria recensione sulla tab "Dicci la tua" (riusa valutaVisible). */
    reviewDot?: boolean;
    /** Solo preview: device emulato dal toggle Mobile/Desktop. Settato come
     *  attributo data-preview-device sul .root → pilota lo split CSS in anteprima
     *  (hub tab nascosti in mobile-preview). Undefined in runtime. */
    previewDevice?: "mobile" | "desktop";
};

export default function PublicCollectionHeader({
    logoUrl,
    activityName,
    activityAddress,
    showAddress = false,
    catalogName,
    showCatalogName = false,
    coverImageUrl,
    showCoverImage,
    showLogo,
    mode,
    onSearchOpen,
    onSearchPointerDown,
    scrollContainerEl,
    viewportWidthEl,
    headerRadius,
    activeTab,
    onTabChange,
    allergensCount = 0,
    onOpenMore,
    showHubTabs = true,
    showEventsTab = true,
    showLanguageSelector = true,
    actionSlot,
    selectionCount = 0,
    orderVisible = false,
    onOpenOrder,
    supportVisible = false,
    onOpenSupport,
    reviewDot = false,
    previewDevice,
}: PublicCollectionHeaderProps) {
    const { t } = useTranslation("public");
    // ── ResizeObserver: write --pub-header-height on <main> ancestor ────────────
    const headerRef = useRef<HTMLElement | null>(null);

    useEffect(() => {
        const el = headerRef.current;
        if (!el) return;

        const pageEl = el.closest("main") as HTMLElement | null;
        if (!pageEl) return;

        const setHeight = (h: number) => {
            pageEl.style.setProperty("--pub-header-height", `${h}px`);
        };

        setHeight(el.offsetHeight);

        const ro = new ResizeObserver(entries => {
            for (const entry of entries) {
                setHeight((entry.target as HTMLElement).offsetHeight);
            }
        });
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    // ── Scroll tracking (from prototype) ───────────────────────────────────────
    const [scrollY, setScrollY] = useState(0);
    const [viewportWidth, setViewportWidth] = useState<number>(
        typeof window !== "undefined" ? document.documentElement.clientWidth : 1024
    );
    const [isMobile, setIsMobile] = useState<boolean>(
        typeof window !== "undefined" ? window.innerWidth < 768 : false
    );

    useEffect(() => {
        if (viewportWidthEl) {
            // Modalità preview: misura la larghezza del device frame
            const update = (w: number) => {
                setViewportWidth(w);
                setIsMobile(w < 768);
            };
            update(viewportWidthEl.getBoundingClientRect().width);
            const ro = new ResizeObserver(entries => {
                const entry = entries[0];
                if (entry) update(entry.contentRect.width);
            });
            ro.observe(viewportWidthEl);
            return () => ro.disconnect();
        }
        // Modalità pubblica: comportamento invariato
        const handleResize = () => {
            const w = document.documentElement.clientWidth;
            setViewportWidth(w);
            setIsMobile(w < 768);
        };
        handleResize();
        window.addEventListener("resize", handleResize, { passive: true });
        return () => window.removeEventListener("resize", handleResize);
    }, [viewportWidthEl]);

    useEffect(() => {
        const target = scrollContainerEl ?? window;
        const readScroll = () => {
            let y: number;
            if (scrollContainerEl) {
                // Preview: container interno, non affetto dal body lock
                y = scrollContainerEl.scrollTop;
            } else {
                // Pubblico: se il body è locked da PublicSheet (position:fixed),
                // window.scrollY è 0 su iOS Safari anche se la pagina era scrollata.
                // Il valore reale è salvato in body.style.top come "-Npx".
                const bodyTop = document.body.style.top;
                if (document.body.style.position === "fixed" && bodyTop) {
                    const parsed = parseInt(bodyTop, 10);
                    y = Number.isNaN(parsed) ? window.scrollY : -parsed;
                } else {
                    y = window.scrollY;
                }
            }
            setScrollY(y);
        };
        readScroll();
        target.addEventListener("scroll", readScroll, { passive: true });
        return () => target.removeEventListener("scroll", readScroll);
    }, [scrollContainerEl]);

    // ── Animation values (from prototype) ─────────────────────────────────────
    const progress = Math.max(0, Math.min(1, scrollY / TRANSITION_END));

    const initialMargin = isMobile
        ? BASE_MARGIN_MOBILE
        : Math.max((viewportWidth - readContentMaxWidth(viewportWidthEl)) / 2 + BASE_MARGIN_DESKTOP, BASE_MARGIN_DESKTOP);
    // Fallback deterministico (no isMobile): l'unico call site passa sempre
    // headerRadius da token, il fallback non deve dipendere dalla viewport
    // o il markup server divergerebbe da quello client (hydration mismatch).
    const initialRadius = headerRadius ?? 20;

    const currentMargin = lerp(initialMargin, 0, progress);
    const currentRadius = lerp(initialRadius, 0, progress);
    const currentTopOffset = lerp(TOP_OFFSET, 0, progress);
    const currentGap = lerp(8, 0, progress);

    // Hydration deterministica: a riposo (scrollY=0, server e primo render
    // client) gli stili viewport-dependent vengono dal CSS (.root nel modulo
    // SCSS: margin-inline, margin-top via data-cover, top). Il primo scroll
    // event è per definizione post-hydration: da lì gli inline style del lerp
    // sovrascrivono il CSS partendo dagli stessi valori al pixel (stessa
    // formula, stessa var --pub-frame-max-desktop).
    const engaged = scrollY > 0;

    return (
        <>
            {/* COVER IMAGE — scrolls away normally */}
            {showCoverImage && (
                <div className={styles.coverImage}>
                    {coverImageUrl ? (
                        (() => {
                            // Responsive cover via Supabase transform: serve la variante
                            // sized al viewport (srcset/sizes), non il raw 1280w. Il preload
                            // SSR (publicShell) usa lo stesso set → nessun doppio download.
                            // Passthrough (set null) per URL non-storage → src raw, no srcset.
                            const coverSet = buildCoverImageSet(coverImageUrl);
                            return (
                                <img
                                    src={coverSet?.src ?? coverImageUrl}
                                    srcSet={coverSet?.srcset}
                                    sizes={coverSet?.sizes}
                                    alt=""
                                    role="presentation"
                                    className={styles.coverImg}
                                    fetchPriority="high"
                                    decoding="async"
                                    width={1920}
                                    height={1080}
                                />
                            );
                        })()
                    ) : mode === "preview" ? (
                        <div className={styles.coverPlaceholder} aria-hidden>
                            <ImageIcon size={32} strokeWidth={1.5} />
                        </div>
                    ) : (
                        <div className={styles.coverPlaceholder} aria-hidden />
                    )}
                </div>
            )}

            {/* HEADER STICKY — single element, scroll-driven animation via inline style.
                A riposo: solo borderRadius (da token, deterministico); il resto viene
                dal CSS. Engaged (scroll > 0): il lerp prende il controllo via inline. */}
            <header
                ref={headerRef}
                className={styles.root}
                data-cover={showCoverImage || undefined}
                data-bottombar={mode === "public" || undefined}
                data-preview-device={mode === "preview" ? previewDevice : undefined}
                style={
                    engaged
                        ? {
                              top: currentTopOffset,
                              marginLeft: currentMargin,
                              marginRight: currentMargin,
                              borderRadius: currentRadius,
                          }
                        : { borderRadius: initialRadius }
                }
            >
                <div className={styles.inner}>
                    <div className={styles.topRow}>
                        {showLogo && logoUrl && (
                            <div className={styles.logoWrapper}>
                                <img
                                    src={logoUrl}
                                    alt={`Logo ${activityName}`}
                                    className={styles.logo}
                                    decoding="async"
                                    width={80}
                                    height={80}
                                />
                            </div>
                        )}
                        {showLogo && !logoUrl && mode === "preview" && (
                            <div className={styles.logoPlaceholder} />
                        )}

                        <div className={styles.textBlock}>
                            <span className={styles.name}>{activityName}</span>
                            {showAddress && activityAddress && (
                                <span className={styles.address}>{activityAddress}</span>
                            )}
                            {showCatalogName && catalogName && (
                                <span className={styles.catalogName}>{catalogName}</span>
                            )}
                        </div>

                        {mode !== "preview" && showLanguageSelector && (
                            <LanguageSelector scrollContainerEl={scrollContainerEl} />
                        )}
                        {/* Preview: stand-in statico del selettore lingua (il vero
                            LanguageSelector richiede LanguageProvider, assente in
                            anteprima). Solo visivo, inerte via .root[data-preview-device]. */}
                        {mode === "preview" && showLanguageSelector && (
                            <span className={styles.langPreview} aria-hidden="true">IT</span>
                        )}

                        {actionSlot}

                        {/* Ricerca: in preview renderizzata inerte (onSearchOpen
                            undefined → nessun handler) per fedeltà del cluster. */}
                        {(onSearchOpen || mode === "preview") && (
                            <button
                                type="button"
                                className={styles.iconBtn}
                                onClick={onSearchOpen}
                                onPointerDown={onSearchPointerDown}
                                aria-label={t("header.search_aria")}
                                tabIndex={mode === "preview" ? -1 : undefined}
                            >
                                <Search size={15} strokeWidth={2} />
                            </button>
                        )}

                        {/* "Altro" (allergeni + info): in preview inerte (onOpenMore
                            undefined → nessun handler). */}
                        {(onOpenMore || mode === "preview") && (
                            <button
                                type="button"
                                className={styles.iconBtn}
                                onClick={onOpenMore}
                                aria-label={t("header.more_aria")}
                                tabIndex={mode === "preview" ? -1 : undefined}
                            >
                                <MoreHorizontal size={16} strokeWidth={2} />
                                {allergensCount > 0 && (
                                    <span className={styles.iconBtnBadge} aria-hidden>
                                        {allergensCount}
                                    </span>
                                )}
                            </button>
                        )}

                        {/* Gruppo azioni desktop (Assistenza/Ordine). Sotto flag
                            bottom-bar è montato sempre ma nascosto ≤640px via @media
                            (la bottom-bar mobile porta le stesse azioni). */}
                        {((onOpenSupport && supportVisible) || (onOpenOrder && orderVisible)) && (
                            <div className={styles.headerActions}>
                                {/* Divisore tra gruppo utility (IT/search/···) e azioni. */}
                                <span className={styles.actionsDivider} aria-hidden="true" />

                                {/* Assistenza (campanello) — entry point desktop, stessa
                                    condizione del campanello mobile (supportVisible). */}
                                {onOpenSupport && supportVisible && (
                                    <button
                                        type="button"
                                        className={styles.iconBtn}
                                        onClick={onOpenSupport}
                                        aria-label="Assistenza al tavolo"
                                        title="Assistenza"
                                    >
                                        <Bell size={15} strokeWidth={2} />
                                    </button>
                                )}

                                {/* Ordine (carrello) — apre il drawer ordine, badge conteggio.
                                    Tinta accent quando ci sono articoli (data-accent). */}
                                {onOpenOrder && orderVisible && (
                                    <button
                                        type="button"
                                        className={styles.iconBtn}
                                        data-accent={selectionCount > 0 ? "true" : undefined}
                                        onClick={onOpenOrder}
                                        aria-label={
                                            selectionCount > 0
                                                ? t("fab.cart_aria_count", { count: selectionCount })
                                                : t("fab.cart_aria")
                                        }
                                        title="Ordine"
                                    >
                                        <ShoppingBag size={15} strokeWidth={2} />
                                        {selectionCount > 0 && (
                                            <span className={styles.iconBtnBadge} aria-hidden>
                                                {selectionCount}
                                            </span>
                                        )}
                                    </button>
                                )}
                            </div>
                        )}
                    </div>

                    {showHubTabs && (
                        <div
                            className={[
                                styles.chips,
                                mode === "preview" ? styles.chipsPreview : "",
                            ]
                                .filter(Boolean)
                                .join(" ")}
                        >
                            {HUB_TABS.filter(tab => tab.id !== "events" || showEventsTab).map(tab => (
                                <button
                                    key={tab.id}
                                    type="button"
                                    className={[
                                        styles.chip,
                                        activeTab === tab.id ? styles.chipActive : "",
                                    ]
                                        .filter(Boolean)
                                        .join(" ")}
                                    onClick={() => onTabChange?.(tab.id)}
                                >
                                    {tab.icon} {t(tab.labelKey)}
                                    {tab.id === "reviews" && reviewDot && activeTab !== "reviews" && (
                                        <span className={styles.chipDot} aria-hidden="true" />
                                    )}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </header>

            {/* Animated gap between header and pill bar */}
            <div aria-hidden style={{ height: currentGap }} />
        </>
    );
}
