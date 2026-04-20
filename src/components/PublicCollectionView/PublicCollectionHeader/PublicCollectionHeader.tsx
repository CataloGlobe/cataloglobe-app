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
    /** Apre il SearchOverlay (la ricerca è gestita esternamente). */
    onSearchOpen: () => void;
    /** Chiamato quando il compact bar diventa visibile/invisibile. */
    onCompactVisibilityChange?: (visible: boolean) => void;
    /**
     * Chiamato ogni volta che l'altezza reale del compact bar cambia
     * (CollectionView aggiorna dinamicamente topOffset di CollectionSectionNav).
     */
    onCompactHeightChange?: (height: number) => void;
    /** Scroll container della preview (deviceScreen). Non usato in public. */
    scrollContainerEl?: HTMLElement | null;
    /** Hub navigation tab attiva. */
    activeTab: HubTab;
    /** Callback per cambio tab. */
    onTabChange: (tab: HubTab) => void;
    /** True se ci sono informazioni sede da mostrare (orari, pagamenti, servizi, contatti). */
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
    onCompactVisibilityChange,
    onCompactHeightChange,
    scrollContainerEl,
    activeTab,
    onTabChange,
    hasInfo,
    onInfoPress
}: PublicCollectionHeaderProps) {
    const heroAreaRef = useRef<HTMLDivElement | null>(null);
    const compactBarRef = useRef<HTMLDivElement | null>(null);

    // Senza cover image: compact visibile dall'inizio.
    // Con cover image: si attiva dopo lo scroll (sia public che preview).
    const [isCompact, setIsCompact] = useState(!showCoverImage);

    // ─── Rilevamento scroll per PREVIEW ───────────────────────────────────────
    // In preview usiamo un semplice scroll listener sul scrollContainerEl.
    // L'IntersectionObserver non si comporta in modo affidabile quando il root
    // è un container interno (deviceScreen) a causa del layout non stabile
    // al momento del mount.
    useEffect(() => {
        if (mode !== "preview") return;
        if (!showCoverImage) {
            setIsCompact(true);
            onCompactVisibilityChange?.(true);
            return;
        }
        if (!scrollContainerEl) return;

        const container = scrollContainerEl;

        const handleScroll = () => {
            // Stessa logica del rootMargin: attiva 60px prima che l'hero
            // sia completamente uscito, così la slide-in parte in anticipo.
            const heroHeight = heroAreaRef.current?.offsetHeight ?? 220;
            const compact = container.scrollTop >= heroHeight - 60;
            setIsCompact(compact);
            onCompactVisibilityChange?.(compact);
        };

        // Controllo iniziale: se l'overlay è già scrollato (es. hot-reload)
        handleScroll();

        container.addEventListener("scroll", handleScroll, { passive: true });
        return () => container.removeEventListener("scroll", handleScroll);
    }, [mode, showCoverImage, scrollContainerEl, onCompactVisibilityChange]);

    // ─── IntersectionObserver per PUBLIC ──────────────────────────────────────
    // rootMargin: "-60px 0px 0px 0px" restringe il root di 60px dall'alto.
    // Il compact bar si attiva quando restano ~60px di hero visibile, così
    // la slide-in (0.3s) è già in corso quando l'hero scompare → zero gap.
    useEffect(() => {
        if (mode !== "public") return;
        if (!showCoverImage) {
            setIsCompact(true);
            onCompactVisibilityChange?.(true);
            return;
        }

        const heroEl = heroAreaRef.current;
        if (!heroEl) return;

        const observer = new IntersectionObserver(
            ([entry]) => {
                const compact = !entry.isIntersecting;
                setIsCompact(compact);
                onCompactVisibilityChange?.(compact);
            },
            { root: null, threshold: 0, rootMargin: "-60px 0px 0px 0px" }
        );

        observer.observe(heroEl);
        return () => observer.disconnect();
    }, [mode, showCoverImage, onCompactVisibilityChange]);

    // ─── ResizeObserver ───────────────────────────────────────────────────────
    // Misura l'altezza reale del compact bar per il compactSpacer in public mode.
    useEffect(() => {
        const el = compactBarRef.current;
        if (!el || !onCompactHeightChange) return;

        const ro = new ResizeObserver(() => {
            onCompactHeightChange(el.getBoundingClientRect().height);
        });
        ro.observe(el);
        return () => ro.disconnect();
    }, [onCompactHeightChange]);

    const isPublic = mode === "public";

    const compactBarClass = [
        styles.compactBar,
        isPublic ? styles.compactFixed : styles.compactSticky,
        isCompact ? styles.compactVisible : ""
    ]
        .filter(Boolean)
        .join(" ");

    return (
        <div className={styles.root}>
            {/* ───────────── HERO AREA ───────────── */}
            {showCoverImage && (
                <div className={styles.heroArea} ref={heroAreaRef}>
                    {coverImageUrl ? (
                        <img
                            src={coverImageUrl}
                            alt=""
                            role="presentation"
                            className={styles.heroCoverImg}
                        />
                    ) : mode === "preview" ? (
                        <div className={styles.heroImgPlaceholder} aria-hidden>
                            <ImageIcon size={32} strokeWidth={1.5} />
                        </div>
                    ) : (
                        <div className={styles.heroImgPlaceholder} aria-hidden />
                    )}

                    {/* Card sovrapposta al hero */}
                    <div className={styles.infoCard}>
                        <div className={styles.infoCardTopRow}>
                            {showLogo && (
                                <>
                                    {logoUrl ? (
                                        <div className={styles.infoCardLogoWrapper}>
                                            <img
                                                src={logoUrl}
                                                alt={`Logo ${activityName}`}
                                                className={styles.infoCardLogo}
                                            />
                                        </div>
                                    ) : mode === "preview" ? (
                                        <div className={styles.infoCardLogoPlaceholder} />
                                    ) : null}
                                </>
                            )}

                            <div className={styles.infoCardText}>
                                <span className={styles.infoCardName}>{activityName}</span>
                                {activityAddress && (
                                    <span className={styles.infoCardAddress}>{activityAddress}</span>
                                )}
                                {showCatalogName && catalogName && (
                                    <span className={styles.infoCardCatalogName}>{catalogName}</span>
                                )}
                            </div>

                            <LanguageSelector variant="hero" />

                            {hasInfo && onInfoPress && (
                                <button
                                    type="button"
                                    className={styles.infoCardInfoBtn}
                                    onClick={onInfoPress}
                                    aria-label="Informazioni sede"
                                >
                                    <Info size={15} strokeWidth={2} />
                                </button>
                            )}

                            <button
                                type="button"
                                className={styles.infoCardSearchBtn}
                                onClick={onSearchOpen}
                                aria-label="Cerca nel catalogo"
                            >
                                <Search size={15} strokeWidth={2} />
                            </button>
                        </div>

                        <div className={[
                            styles.infoCardChips,
                            mode === "preview" ? styles.infoCardChipsPreview : ""
                        ].filter(Boolean).join(" ")}>
                            {HUB_TABS.map(t => (
                                <button
                                    key={t.id}
                                    type="button"
                                    className={[
                                        styles.infoCardChip,
                                        activeTab === t.id ? styles.infoCardChipActive : ""
                                    ].filter(Boolean).join(" ")}
                                    onClick={() => onTabChange(t.id)}
                                >
                                    {t.icon} {t.label}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* ───────────── COMPACT BAR (solo public) ───────────── */}
            {/*
             * PUBLIC  → compactBar usa position:fixed (sfugge al containing block sticky).
             *           La pagina usa il <compactSpacer> per compensare l'altezza.
             *
             * PREVIEW → il compact bar è renderizzato da CollectionView come figlio
             *           diretto di <main> (full-height). Qui non viene renderizzato
             *           perché il parent .root copre solo l'hero (~220px): il sticky
             *           smette di funzionare quando l'utente scrolla oltre quel limite.
             */}
            {mode === "public" && (
                <div className={styles.compactAnchor}>
                    <div className={compactBarClass} ref={compactBarRef}>
                        <div className={styles.compactInner}>
                            <div className={styles.compactTopRow}>
                                {showLogo && (
                                    <>
                                        {logoUrl ? (
                                            <div className={styles.compactLogoWrapper}>
                                                <img
                                                    src={logoUrl}
                                                    alt={`Logo ${activityName}`}
                                                    className={styles.compactLogo}
                                                />
                                            </div>
                                        ) : null}
                                    </>
                                )}

                                <span className={styles.compactName}>{activityName}</span>

                                <LanguageSelector variant="compact" />

                                {hasInfo && onInfoPress && (
                                    <button
                                        type="button"
                                        className={styles.compactInfoBtn}
                                        onClick={onInfoPress}
                                        aria-label="Informazioni sede"
                                    >
                                        <Info size={16} strokeWidth={2} />
                                    </button>
                                )}

                                <button
                                    type="button"
                                    className={styles.compactSearchBtn}
                                    onClick={onSearchOpen}
                                    aria-label="Cerca nel catalogo"
                                >
                                    <Search size={16} strokeWidth={2} />
                                </button>
                            </div>

                            <div className={styles.compactChips}>
                                {HUB_TABS.map(t => (
                                    <button
                                        key={t.id}
                                        type="button"
                                        className={[
                                            styles.compactChip,
                                            activeTab === t.id ? styles.compactChipActive : ""
                                        ].filter(Boolean).join(" ")}
                                        onClick={() => onTabChange(t.id)}
                                    >
                                        {t.icon} {t.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
