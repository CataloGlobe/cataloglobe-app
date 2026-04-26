import { useEffect, useRef, useState, type ReactNode } from "react";
import { BookOpen, CalendarDays, ImageIcon, Info, MessageSquareHeart, Search } from "lucide-react";
import type { HubTab } from "@/types/collectionStyle";
import LanguageSelector from "@components/PublicCollectionView/LanguageSelector/LanguageSelector";
import styles from "./PublicCollectionHeader.module.scss";

const HUB_TABS: { id: HubTab; icon: ReactNode; label: string }[] = [
    { id: "menu", icon: <BookOpen size={14} />, label: "Menu" },
    { id: "events", icon: <CalendarDays size={14} />, label: "Eventi & Promo" },
    { id: "reviews", icon: <MessageSquareHeart size={14} />, label: "Dicci la tua" },
];

// ── Prototype constants (authoritative — do not change) ─────────────────────
const TRANSITION_END = 140;
const BASE_MARGIN_MOBILE = 10;
const BASE_MARGIN_DESKTOP = 16;
const CONTENT_MAX_WIDTH = 1024; // allineato a .frame / .inner
const TOP_OFFSET = 8;

export const HEADER_HEIGHT_MOBILE = 108;
export const HEADER_HEIGHT_DESKTOP = 116;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export type PublicCollectionHeaderProps = {
    logoUrl?: string | null;
    activityName: string;
    activityAddress?: string | null;
    catalogName?: string | null;
    showCatalogName?: boolean;
    coverImageUrl?: string | null;
    showCoverImage: boolean;
    showLogo: boolean;
    mode: "public" | "preview";
    /** Apre il SearchOverlay. Undefined in preview — nasconde i pulsanti di ricerca. */
    onSearchOpen?: () => void;
    /** Scroll container della preview (deviceScreen). Non usato in public. */
    scrollContainerEl?: HTMLElement | null;
    /** Elemento di riferimento per misurare la larghezza viewport nella preview.
     *  Se presente, ResizeObserver sostituisce window.innerWidth per il calcolo
     *  di initialMargin e isMobile. Non passato in public → fallback a window. */
    viewportWidthEl?: HTMLElement | null;
    /** Border radius iniziale dell'header in px (da tokens.appearance.borderRadius via collectionStyle).
     *  Interpolato da lerp() verso 0 durante lo scroll. Fallback a 16/20 se assente. */
    headerRadius?: number;
    /** Hub navigation tab attiva. */
    activeTab: HubTab;
    /** Callback per cambio tab. */
    onTabChange: (tab: HubTab) => void;
    /** True se ci sono informazioni sede da mostrare. */
    hasInfo?: boolean;
    /** Chiamato al tap sull'icona info. */
    onInfoPress?: () => void;
};

export default function PublicCollectionHeader({
    logoUrl,
    activityName,
    activityAddress,
    catalogName,
    showCatalogName = false,
    coverImageUrl,
    showCoverImage,
    showLogo,
    mode,
    onSearchOpen,
    scrollContainerEl,
    viewportWidthEl,
    headerRadius,
    activeTab,
    onTabChange,
    hasInfo,
    onInfoPress,
}: PublicCollectionHeaderProps) {
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
        typeof window !== "undefined" ? window.innerWidth : 1024
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
            const w = window.innerWidth;
            setViewportWidth(w);
            setIsMobile(w < 768);
        };
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
        : Math.max((viewportWidth - CONTENT_MAX_WIDTH) / 2 + BASE_MARGIN_DESKTOP, BASE_MARGIN_DESKTOP);
    const initialRadius = headerRadius ?? (isMobile ? 16 : 20);
    const headerHeight = isMobile ? HEADER_HEIGHT_MOBILE : HEADER_HEIGHT_DESKTOP;

    const currentMargin = lerp(initialMargin, 0, progress);
    const currentRadius = lerp(initialRadius, 0, progress);
    const currentTopOffset = lerp(TOP_OFFSET, 0, progress);
    const currentGap = lerp(8, 0, progress);

    // Negative margin-top overlaps the header onto the cover image
    const coverOverlap = showCoverImage
        ? -(headerHeight + TOP_OFFSET + 4)
        : 0;

    return (
        <>
            {/* COVER IMAGE — scrolls away normally */}
            {showCoverImage && (
                <div className={styles.coverImage}>
                    {coverImageUrl ? (
                        <img
                            src={coverImageUrl}
                            alt=""
                            role="presentation"
                            className={styles.coverImg}
                            fetchPriority="high"
                            decoding="async"
                            width={1920}
                            height={1080}
                        />
                    ) : mode === "preview" ? (
                        <div className={styles.coverPlaceholder} aria-hidden>
                            <ImageIcon size={32} strokeWidth={1.5} />
                        </div>
                    ) : (
                        <div className={styles.coverPlaceholder} aria-hidden />
                    )}
                </div>
            )}

            {/* HEADER STICKY — single element, scroll-driven animation via inline style */}
            <header
                ref={headerRef}
                className={styles.root}
                style={{
                    position: "sticky",
                    top: currentTopOffset,
                    zIndex: 30,
                    marginLeft: currentMargin,
                    marginRight: currentMargin,
                    marginTop: coverOverlap,
                    borderRadius: currentRadius,
                    overflow: "hidden",
                }}
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
                            {activityAddress && (
                                <span className={styles.address}>{activityAddress}</span>
                            )}
                            {showCatalogName && catalogName && (
                                <span className={styles.catalogName}>{catalogName}</span>
                            )}
                        </div>

                        {mode !== "preview" && <LanguageSelector variant="hero" />}

                        {mode !== "preview" && hasInfo && onInfoPress && (
                            <button
                                type="button"
                                className={styles.iconBtn}
                                onClick={onInfoPress}
                                aria-label="Informazioni sede"
                            >
                                <Info size={15} strokeWidth={2} />
                            </button>
                        )}

                        {onSearchOpen && (
                            <button
                                type="button"
                                className={styles.iconBtn}
                                onClick={onSearchOpen}
                                aria-label="Cerca nel catalogo"
                            >
                                <Search size={15} strokeWidth={2} />
                            </button>
                        )}
                    </div>

                    <div
                        className={[
                            styles.chips,
                            mode === "preview" ? styles.chipsPreview : "",
                        ]
                            .filter(Boolean)
                            .join(" ")}
                    >
                        {HUB_TABS.map(t => (
                            <button
                                key={t.id}
                                type="button"
                                className={[
                                    styles.chip,
                                    activeTab === t.id ? styles.chipActive : "",
                                ]
                                    .filter(Boolean)
                                    .join(" ")}
                                onClick={() => onTabChange(t.id)}
                            >
                                {t.icon} {t.label}
                            </button>
                        ))}
                    </div>
                </div>
            </header>

            {/* Animated gap between header and pill bar */}
            <div aria-hidden style={{ height: currentGap }} />
        </>
    );
}
