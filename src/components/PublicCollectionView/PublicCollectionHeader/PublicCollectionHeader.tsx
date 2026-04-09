import { useEffect, useRef, useState, useCallback } from "react";
import { ImageIcon, Search, X } from "lucide-react";
import styles from "./PublicCollectionHeader.module.scss";

export type PublicCollectionHeaderProps = {
    logoUrl?: string | null;
    activityName: string;
    activityAddress?: string | null;
    coverImageUrl?: string | null;
    showCoverImage: boolean;
    showLogo: boolean;
    mode: "public" | "preview";
    searchQuery: string;
    onSearchChange: (q: string) => void;
    /** Chiamato quando il compact bar diventa visibile/invisibile (public mode). */
    onCompactVisibilityChange?: (visible: boolean) => void;
    /**
     * Chiamato ogni volta che l'altezza reale del compact bar cambia
     * (es. apertura/chiusura search bar). CollectionView usa questo valore
     * per aggiornare dinamicamente topOffset di CollectionSectionNav.
     */
    onCompactHeightChange?: (height: number) => void;
    /** Scroll container per IntersectionObserver root (preview con container custom). */
    scrollContainerEl?: HTMLElement | null;
};

export default function PublicCollectionHeader({
    logoUrl,
    activityName,
    activityAddress,
    coverImageUrl,
    showCoverImage,
    showLogo,
    mode,
    searchQuery,
    onSearchChange,
    onCompactVisibilityChange,
    onCompactHeightChange,
    scrollContainerEl
}: PublicCollectionHeaderProps) {
    const sentinelRef = useRef<HTMLDivElement | null>(null);
    const compactBarRef = useRef<HTMLDivElement | null>(null);
    const searchInputRef = useRef<HTMLInputElement | null>(null);

    // In preview compact è sempre visibile; in public si attiva dopo lo scroll
    const [isCompact, setIsCompact] = useState(mode === "preview" || !showCoverImage);
    const [isSearchOpen, setIsSearchOpen] = useState(false);

    // ─── IntersectionObserver: rileva quando il sentinel hero esce dal viewport ──
    useEffect(() => {
        if (mode === "preview" || !showCoverImage) {
            // In preview o senza cover: compact sempre attivo
            setIsCompact(true);
            onCompactVisibilityChange?.(true);
            return;
        }

        const sentinel = sentinelRef.current;
        if (!sentinel) return;

        // root null = viewport (public); elemento = container preview
        const root = scrollContainerEl ?? null;

        const observer = new IntersectionObserver(
            ([entry]) => {
                const compactVisible = !entry.isIntersecting;
                setIsCompact(compactVisible);
                onCompactVisibilityChange?.(compactVisible);
            },
            { root, threshold: 0, rootMargin: "0px" }
        );

        observer.observe(sentinel);
        return () => observer.disconnect();
    }, [mode, showCoverImage, scrollContainerEl, onCompactVisibilityChange]);

    // ─── ResizeObserver: misura l'altezza reale del compact bar ─────────────────
    // Chiamato ogni volta che la dimensione cambia (es. search aperto/chiuso).
    useEffect(() => {
        const el = compactBarRef.current;
        if (!el || !onCompactHeightChange) return;

        const ro = new ResizeObserver(() => {
            onCompactHeightChange(el.getBoundingClientRect().height);
        });
        ro.observe(el);
        return () => ro.disconnect();
    }, [onCompactHeightChange]);

    // ─── Toggle search bar ───────────────────────────────────────────────────────
    const toggleSearch = useCallback(() => {
        setIsSearchOpen(prev => {
            const next = !prev;
            if (next) {
                // Focus dopo che la transizione CSS ha avuto tempo di avviarsi
                requestAnimationFrame(() => {
                    searchInputRef.current?.focus();
                });
            } else {
                onSearchChange("");
            }
            return next;
        });
    }, [onSearchChange]);

    const isPublic = mode === "public";

    const compactBarClass = [
        styles.compactBar,
        isPublic ? styles.compactFixed : styles.compactSticky,
        isCompact && isPublic ? styles.compactVisible : ""
    ]
        .filter(Boolean)
        .join(" ");

    return (
        <div className={styles.root}>
            {/* ───────────── HERO AREA ───────────── */}
            {showCoverImage && (
                <div className={styles.heroArea}>
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
                        </div>

                        <button
                            type="button"
                            className={styles.infoCardSearchBtn}
                            onClick={toggleSearch}
                            aria-label="Cerca nel catalogo"
                        >
                            <Search size={15} strokeWidth={2} />
                        </button>
                    </div>

                    {/* Sentinel a fine hero per IntersectionObserver */}
                    <div ref={sentinelRef} className={styles.heroSentinel} aria-hidden />
                </div>
            )}

            {/* ───────────── COMPACT BAR ───────────── */}
            <div className={compactBarClass} ref={compactBarRef}>
                <div className={styles.compactInner}>
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
                            ) : mode === "preview" ? (
                                <div className={styles.compactLogoPlaceholder} />
                            ) : null}
                        </>
                    )}

                    <span className={styles.compactName}>{activityName}</span>

                    <button
                        type="button"
                        className={`${styles.compactSearchBtn}${isSearchOpen ? ` ${styles.searchActive}` : ""}`}
                        onClick={toggleSearch}
                        aria-label={isSearchOpen ? "Chiudi ricerca" : "Cerca nel catalogo"}
                        aria-expanded={isSearchOpen}
                    >
                        {isSearchOpen ? (
                            <X size={16} strokeWidth={2} />
                        ) : (
                            <Search size={16} strokeWidth={2} />
                        )}
                    </button>
                </div>

                {/* Search bar espandibile */}
                <div
                    className={`${styles.searchBar}${isSearchOpen ? ` ${styles.searchBarOpen}` : ""}`}
                    aria-hidden={!isSearchOpen}
                >
                    <div className={styles.searchInner}>
                        <input
                            ref={searchInputRef}
                            type="search"
                            className={styles.searchInput}
                            placeholder="Cerca nel catalogo…"
                            value={searchQuery}
                            onChange={e => onSearchChange(e.target.value)}
                            tabIndex={isSearchOpen ? 0 : -1}
                        />
                        {searchQuery && (
                            <button
                                type="button"
                                className={styles.searchClearBtn}
                                onClick={() => onSearchChange("")}
                                aria-label="Cancella ricerca"
                            >
                                <X size={14} strokeWidth={2} />
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
