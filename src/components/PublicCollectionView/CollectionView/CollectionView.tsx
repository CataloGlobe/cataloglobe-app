import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { ChevronUp, Info, Package, Search } from "lucide-react";
import type { ResolvedAllergen, ResolvedIngredient } from "@/types/resolvedCollections";
import Text from "@/components/ui/Text/Text";
import { Pill } from "@/components/ui/Pill/Pill";
// NOTE: CollectionHero e PublicBrandHeader sono sostituiti da PublicCollectionHeader.
// I file originali restano nel progetto come fallback potenziale.
// import CollectionHero from "../CollectionHero/CollectionHero";
// import PublicBrandHeader from "../PublicBrandHeader/PublicBrandHeader";
import PublicCollectionHeader from "../PublicCollectionHeader/PublicCollectionHeader";
import CollectionSectionNav from "../CollectionSectionNav/CollectionSectionNav";
import type { CardTemplate, CollectionStyle } from "@/types/collectionStyle";
import styles from "./CollectionView.module.scss";
import ItemDetail from "../ItemDetail/ItemDetail";
import AllergenIcon from "@/components/ui/AllergenIcon/AllergenIcon";

type SectionNavItem = { id: string; name: string };

export type CollectionViewSectionItem = {
    id: string;
    name: string;
    description?: string | null;
    price?: number | null;
    effective_price?: number | null;
    original_price?: number | null;
    /** Min format price. When set, show "da X€" on card. */
    from_price?: number | null;
    image?: string | null;
    optionGroups?: {
        id: string;
        name: string;
        group_kind: "PRIMARY_PRICE" | "ADDON";
        pricing_mode: "ABSOLUTE" | "DELTA";
        isRequired: boolean;
        maxSelectable: number | null;
        values: {
            id: string;
            name: string;
            absolutePrice: number | null;
            priceModifier: number | null;
            /** Set when a value-level price override is active with show_original_price = true. */
            originalPrice?: number;
        }[];
    }[];
    /** Pre-computed attribute label/value pairs — only those with a value. */
    attributes?: { label: string; value: string }[];
    allergens?: ResolvedAllergen[];
    ingredients?: ResolvedIngredient[];
    /** Child variants (products with parent_product_id = this.id). */
    variants?: {
        id: string;
        name: string;
        price?: number;
        original_price?: number;
        from_price?: number;
        image?: string;
        description?: string;
        optionGroups?: CollectionViewSectionItem["optionGroups"];
    }[];
    parentSelected: boolean;
    is_disabled?: boolean;
};

export type CollectionViewSection = {
    id: string;
    name: string;
    items: CollectionViewSectionItem[];
};

// ─── getDisplayPrice — single pricing rule for all product types ─────────────
// If a product has more than one active price (from_price set) → "da €MIN"
// If it has exactly one active price → "€PRICE"
// Handles both parent products and variants identically.

type DisplayPrice =
    | { type: "from"; price: number; originalPrice?: number }
    | { type: "single"; price: number; originalPrice?: number }
    | { type: "none" };

function getDisplayPrice(opts: {
    fromPrice?: number | null;
    price?: number | null;
    effectivePrice?: number | null;
    originalPrice?: number | null;
}): DisplayPrice {
    if (opts.fromPrice != null) {
        return {
            type: "from",
            price: opts.fromPrice,
            ...(opts.originalPrice != null ? { originalPrice: opts.originalPrice } : {})
        };
    }
    const single = opts.effectivePrice ?? opts.price;
    if (single != null) {
        return {
            type: "single",
            price: single,
            ...(opts.originalPrice != null ? { originalPrice: opts.originalPrice } : {})
        };
    }
    return { type: "none" };
}

// ─── ProductRow — shared layout for parent products and variants ──────────────

type ProductRowProps = {
    name: string;
    fromPrice?: number | null;
    price?: number | null;
    effectivePrice?: number | null;
    originalPrice?: number | null;
    description?: string | null;
    image?: string | null;
    showImage: boolean;
    imageRight?: boolean;
    mode: "public" | "preview";
    onClick: (e: React.MouseEvent) => void;
    optionGroups?: CollectionViewSectionItem["optionGroups"];
    attributes?: CollectionViewSectionItem["attributes"];
    allergens?: ResolvedAllergen[];
};

function ProductRow({
    name,
    fromPrice,
    price,
    effectivePrice,
    originalPrice,
    description,
    image,
    showImage,
    imageRight = false,
    mode,
    onClick,
    optionGroups,
    attributes,
    allergens
}: ProductRowProps) {
    const hasConfigurations = optionGroups?.some(g => g.group_kind === "ADDON") ?? false;
    const hasAttributes = (attributes?.length ?? 0) > 0;
    const hasAllergens = (allergens?.length ?? 0) > 0;
    const MAX_ALLERGEN_EMOJIS = 6;
    const visibleAllergens = hasAllergens ? allergens!.slice(0, MAX_ALLERGEN_EMOJIS) : [];
    const hiddenCount = hasAllergens ? Math.max(0, allergens!.length - MAX_ALLERGEN_EMOJIS) : 0;
    const dp = getDisplayPrice({ fromPrice, price, effectivePrice, originalPrice });
    return (
        <div
            className={`${styles.productRow} ${imageRight ? styles.productRowImageRight : ""}`}
            onClick={onClick}
        >
            {showImage &&
                (mode === "preview" || !image ? (
                    <div className={styles.rowPlaceholder} aria-hidden="true">
                        <Package
                            size={24}
                            strokeWidth={1.5}
                            color="var(--pub-text-muted, var(--pub-text-secondary))"
                        />
                    </div>
                ) : (
                    <img src={image} alt={name} className={styles.rowImage} loading="lazy" />
                ))}
            <div className={styles.rowBody}>
                <div className={styles.titleRow}>
                    <div className={styles.titleRowLeft}>
                        <Text variant="body" weight={700} className={styles.title}>
                            {name}
                        </Text>
                        {dp.type !== "none" && dp.originalPrice != null && (
                            <span className={styles.promoBadge}>Promo</span>
                        )}
                    </div>
                    <span className={styles.infoIcon} aria-hidden="true">
                        <Info size={14} strokeWidth={2} />
                    </span>
                </div>

                {dp.type === "from" ? (
                    <Text variant="caption" colorVariant="muted" className={styles.price}>
                        {dp.originalPrice != null && (
                            <span className={styles.priceOriginal}>
                                da € {dp.originalPrice.toFixed(2)}
                            </span>
                        )}
                        <span
                            className={`${styles.priceCurrent}${dp.originalPrice != null ? ` ${styles.promoPrice}` : ""}`}
                        >
                            da € {dp.price.toFixed(2)}
                        </span>
                    </Text>
                ) : dp.type === "single" ? (
                    <Text variant="caption" colorVariant="muted" className={styles.price}>
                        {dp.originalPrice != null && (
                            <span className={styles.priceOriginal}>
                                € {dp.originalPrice.toFixed(2)}
                            </span>
                        )}
                        <span
                            className={`${styles.priceCurrent}${dp.originalPrice != null ? ` ${styles.promoPrice}` : ""}`}
                        >
                            € {dp.price.toFixed(2)}
                        </span>
                    </Text>
                ) : null}

                {description && (
                    <Text variant="caption" colorVariant="muted" className={styles.description}>
                        {description}
                    </Text>
                )}
                {hasConfigurations && (
                    <div
                        style={{
                            marginTop: 4,
                            width: "fit-content",
                            transform: "scale(0.85)",
                            transformOrigin: "left"
                        }}
                    >
                        {hasConfigurations && <Pill label="Configurazioni" />}
                    </div>
                )}
                {hasAttributes && (
                    <div
                        style={{
                            marginTop: 4,
                            width: "fit-content",
                            transform: "scale(0.85)",
                            transformOrigin: "left"
                        }}
                    >
                        {hasAttributes && <Pill label="Attributi" />}
                    </div>
                )}
                {hasAllergens && (
                    <div className={styles.allergenEmojis}>
                        {visibleAllergens.map(a => (
                            <span
                                key={a.id}
                                className={styles.allergenEmoji}
                            >
                                <AllergenIcon code={a.code} size={20} label={a.label_it} />
                            </span>
                        ))}
                        {hiddenCount > 0 && (
                            <span className={styles.allergenMore}>+{hiddenCount}</span>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

// ─── Scroll-offset constants ─────────────────────────────────────────────────
// NAV_HEIGHT: altezza sticky della CollectionSectionNav
// VISUAL_GAP: breathing room sotto la barra sticky
// SCROLL_OFFSET e STICKY_OFFSET sono ora calcolati dinamicamente in base
// all'altezza reale del compact header (via compactHeaderHeightRef).
const NAV_HEIGHT = 56;  // CollectionSectionNav (~3.5rem)
const VISUAL_GAP = 16;  // breathing room below sticky bar
// ─────────────────────────────────────────────────────────────────────────────

type Props = {
    businessName: string;
    businessImage: string | null;
    collectionTitle: string;
    sections: CollectionViewSection[];
    style: Required<CollectionStyle>;
    mode: "public" | "preview";
    contentId?: string;
    emptyState?: {
        title?: string;
        description?: string;
    };
    featuredHeroSlot?: ReactNode;
    featuredBeforeCatalogSlot?: ReactNode;
    /** Tenant logo URL da mostrare nel compact header. */
    tenantLogoUrl?: string | null;
    /** Explicit scroll container. Use when the component lives inside a custom
     *  scrollable element (e.g. the style-editor canvas). If omitted, the nearest
     *  scrollable ancestor is detected automatically; falls back to window. */
    scrollContainerEl?: HTMLElement | null;
    /** Indirizzo dell'attività (opzionale, mostrato nell'info card hero). */
    activityAddress?: string | null;
};

export default function CollectionView({
    businessName,
    businessImage,
    collectionTitle,
    sections,
    style,
    mode,
    contentId = "collection-content",
    emptyState,
    featuredHeroSlot,
    featuredBeforeCatalogSlot,
    tenantLogoUrl,
    scrollContainerEl,
    activityAddress
}: Props) {
    const [activeSectionId, setActiveSectionId] = useState<string | null>(
        () => sections[0]?.id ?? null
    );
    const sectionRefs = useRef<Record<string, HTMLElement | null>>({});
    const pageRef = useRef<HTMLElement | null>(null);
    const containerRef = useRef<HTMLElement | Window>(window);
    const pendingScrollTargetIdRef = useRef<string | null>(null);
    const safetyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [selectedItem, setSelectedItem] = useState<CollectionViewSectionItem | null>(null);

    // ── Search ──────────────────────────────────────────────────────────────
    const [searchQuery, setSearchQuery] = useState("");

    // ── Compact header state ────────────────────────────────────────────────
    // isCompactHeaderVisible: true = compact bar è visibile (nav deve scendere)
    // compactHeaderHeight: altezza reale del compact bar (aggiornata da ResizeObserver)
    const [isCompactHeaderVisible, setIsCompactHeaderVisible] = useState(
        mode === "preview"
    );
    const [compactHeaderHeight, setCompactHeaderHeight] = useState(0);
    // Ref per leggere l'altezza aggiornata nelle closure del scroll listener
    // senza dover ricreare l'effect ad ogni cambio di altezza.
    const compactHeaderHeightRef = useRef(0);

    const handleCompactVisibilityChange = useCallback((visible: boolean) => {
        setIsCompactHeaderVisible(visible);
    }, []);

    const handleCompactHeightChange = useCallback((h: number) => {
        compactHeaderHeightRef.current = h;
        setCompactHeaderHeight(h);
    }, []);

    // ── Scroll-to-top ───────────────────────────────────────────────────────
    const [showScrollToTop, setShowScrollToTop] = useState(false);

    // ── Keep first section active when sections load asynchronously ─────────
    useEffect(() => {
        if (!activeSectionId && sections.length > 0) {
            setActiveSectionId(sections[0].id);
        }
    }, [activeSectionId, sections]);

    // ── Main scroll effect: section tracking + scroll-to-top visibility ─────
    useEffect(() => {
        if (sections.length === 0) return;

        function findScrollContainer(el: HTMLElement | null): HTMLElement | Window {
            let node = el?.parentElement ?? null;
            while (node && node !== document.body) {
                const { overflow, overflowY } = getComputedStyle(node);
                if (/auto|scroll/.test(overflow + overflowY)) return node;
                node = node.parentElement;
            }
            return window;
        }

        const container: HTMLElement | Window =
            scrollContainerEl ?? findScrollContainer(pageRef.current);

        containerRef.current = container;

        function computeActiveSection() {
            // Offset dinamico: altezza reale compact header + nav + gap
            const dynamicStickyOffset =
                compactHeaderHeightRef.current + NAV_HEIGHT + VISUAL_GAP + 4;

            const containerTop =
                container === window ? 0 : (container as HTMLElement).getBoundingClientRect().top;

            let naturalActive = sections[0].id;
            for (const section of sections) {
                const el = sectionRefs.current[section.id];
                if (!el) continue;
                const sectionTop = el.getBoundingClientRect().top - containerTop;
                if (sectionTop <= dynamicStickyOffset) {
                    naturalActive = section.id;
                } else {
                    break;
                }
            }

            if (pendingScrollTargetIdRef.current !== null) {
                const targetId = pendingScrollTargetIdRef.current;
                const targetEl = sectionRefs.current[targetId];
                if (targetEl) {
                    const targetTop = targetEl.getBoundingClientRect().top - containerTop;
                    if (targetTop > dynamicStickyOffset) {
                        return;
                    }
                }
                pendingScrollTargetIdRef.current = null;
                if (safetyTimeoutRef.current !== null) {
                    clearTimeout(safetyTimeoutRef.current);
                    safetyTimeoutRef.current = null;
                }
            }

            setActiveSectionId(naturalActive);
        }

        function handleScroll() {
            computeActiveSection();
            // Scroll-to-top: visibile solo in mode="public"
            if (mode === "public") {
                const scrollTop =
                    container === window
                        ? window.scrollY
                        : (container as HTMLElement).scrollTop;
                setShowScrollToTop(scrollTop > 300);
            }
        }

        computeActiveSection();
        container.addEventListener("scroll", handleScroll, { passive: true });
        return () => {
            container.removeEventListener("scroll", handleScroll);
            if (safetyTimeoutRef.current !== null) {
                clearTimeout(safetyTimeoutRef.current);
                safetyTimeoutRef.current = null;
            }
            pendingScrollTargetIdRef.current = null;
        };
    }, [sections, scrollContainerEl, mode]);

    // ── Filtered sections (search) ──────────────────────────────────────────
    const filteredSections = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        if (!q) return sections;
        return sections
            .map(section => ({
                ...section,
                items: section.items.filter(
                    item =>
                        item.name.toLowerCase().includes(q) ||
                        (item.description?.toLowerCase().includes(q) ?? false)
                )
            }))
            .filter(section => section.items.length > 0);
    }, [sections, searchQuery]);

    const filteredNavItems: SectionNavItem[] = useMemo(
        () => filteredSections.map(s => ({ id: s.id, name: s.name })),
        [filteredSections]
    );

    // ── Scroll to section ───────────────────────────────────────────────────
    const scrollToSection = (sectionId: string) => {
        setActiveSectionId(sectionId);
        pendingScrollTargetIdRef.current = sectionId;

        if (safetyTimeoutRef.current !== null) clearTimeout(safetyTimeoutRef.current);
        safetyTimeoutRef.current = setTimeout(() => {
            pendingScrollTargetIdRef.current = null;
            safetyTimeoutRef.current = null;
        }, 1000);

        const el = sectionRefs.current[sectionId];
        if (!el) return;

        // Offset dinamico: compact header + nav + gap
        const dynamicScrollOffset =
            compactHeaderHeightRef.current + NAV_HEIGHT + VISUAL_GAP;

        const container = containerRef.current;

        if (container === window) {
            const top = el.getBoundingClientRect().top + window.scrollY - dynamicScrollOffset;
            window.scrollTo({ top, behavior: "smooth" });
        } else {
            const containerEl = container as HTMLElement;
            const top =
                el.getBoundingClientRect().top -
                containerEl.getBoundingClientRect().top +
                containerEl.scrollTop -
                dynamicScrollOffset;
            containerEl.scrollTo({ top, behavior: "smooth" });
        }
    };

    // ── Scroll to top handler ───────────────────────────────────────────────
    const handleScrollToTop = useCallback(() => {
        const container = containerRef.current;
        if (container === window) {
            window.scrollTo({ top: 0, behavior: "smooth" });
        } else {
            (container as HTMLElement).scrollTo({ top: 0, behavior: "smooth" });
        }
    }, []);

    // ── Derived values for render ───────────────────────────────────────────
    // In mode="public" il compact header è fixed → serve paddingTop per non
    // nascondere il contenuto sotto di esso.
    const mainPaddingTop =
        mode === "public" && isCompactHeaderVisible ? compactHeaderHeight : 0;

    const hasHeader =
        style.showLogo || style.showCoverImage || style.showActivityName || style.showCatalogName;

    const hasSearchResults = filteredSections.length > 0;
    const isSearchActive = searchQuery.trim().length > 0;

    return (
        <main
            className={styles.page}
            ref={pageRef}
            style={mainPaddingTop > 0 ? { paddingTop: mainPaddingTop } : undefined}
        >
            {/* Skip link (solo public) */}
            {mode === "public" && (
                <a className={styles.skipLink} href={`#${contentId}`}>
                    <Text variant="caption">Salta al contenuto</Text>
                </a>
            )}

            {/* ── HEADER: sostituisce PublicBrandHeader + CollectionHero ── */}
            {hasHeader && (
                <PublicCollectionHeader
                    logoUrl={tenantLogoUrl}
                    activityName={businessName}
                    activityAddress={activityAddress}
                    coverImageUrl={businessImage}
                    showCoverImage={style.showCoverImage}
                    showLogo={style.showLogo}
                    mode={mode}
                    searchQuery={searchQuery}
                    onSearchChange={setSearchQuery}
                    onCompactVisibilityChange={handleCompactVisibilityChange}
                    onCompactHeightChange={handleCompactHeightChange}
                    scrollContainerEl={scrollContainerEl}
                />
            )}

            {featuredHeroSlot}

            {/* ── NAV – sticky, topOffset dinamico ── */}
            {!emptyState && (
                <CollectionSectionNav
                    sections={filteredNavItems}
                    activeSectionId={activeSectionId}
                    onSelect={scrollToSection}
                    variant={mode === "public" ? "public" : "preview"}
                    style={{
                        shape: style.sectionNavShape,
                        navStyle: style.sectionNavStyle
                    }}
                    topOffset={isCompactHeaderVisible ? compactHeaderHeight : 0}
                />
            )}

            {/* ── FRAME – contenuto centrato e max-width responsivo ── */}
            <div className={styles.frame}>
                {emptyState ? (
                    <div className={styles.emptyState}>
                        {emptyState.title && (
                            <Text as="h2" variant="title-sm" weight={700}>
                                {emptyState.title}
                            </Text>
                        )}
                        {emptyState.description && (
                            <Text variant="body" colorVariant="muted">
                                {emptyState.description}
                            </Text>
                        )}
                    </div>
                ) : (
                    <>
                        {/* ── SEARCH EMPTY STATE ── */}
                        {isSearchActive && !hasSearchResults && (
                            <div className={styles.searchEmptyState}>
                                <div className={styles.searchEmptyIcon}>
                                    <Search
                                        size={28}
                                        strokeWidth={1.5}
                                        color="var(--pub-text-muted)"
                                    />
                                </div>
                                <Text as="p" variant="title-sm" weight={700}>
                                    Nessun risultato
                                </Text>
                                <Text variant="body" colorVariant="muted">
                                    Prova con un'altra parola chiave
                                </Text>
                            </div>
                        )}

                        <div
                            id={contentId}
                            className={styles.container}
                            data-card-layout={style.cardLayout ?? "list"}
                        >
                            {featuredBeforeCatalogSlot}
                            {filteredSections.map(section => {
                                if (section.items.length === 0) return null;

                                return (
                                    <section
                                        key={section.id}
                                        data-section-id={section.id}
                                        ref={el => {
                                            sectionRefs.current[section.id] = el;
                                        }}
                                        className={styles.section}
                                        aria-label={section.name}
                                    >
                                        <Text as="h2" variant="title-sm" weight={700}>
                                            {section.name}
                                        </Text>

                                        <div className={styles.grid} role="list">
                                            {section.items.map(item => {
                                                const isDisabled = item.is_disabled === true;
                                                return (
                                                <article
                                                    key={item.id}
                                                    role="listitem"
                                                    className={`${styles.card}${isDisabled ? ` ${styles.disabledCard}` : ""}`}
                                                >
                                                    {isDisabled && (
                                                        <span className={styles.unavailableBadge}>
                                                            Non disponibile
                                                        </span>
                                                    )}
                                                    {/* Case A/B: parent row — only if parentSelected */}
                                                    {item.parentSelected && (
                                                        <ProductRow
                                                            name={item.name}
                                                            fromPrice={item.from_price}
                                                            price={item.price}
                                                            effectivePrice={item.effective_price}
                                                            originalPrice={item.original_price}
                                                            description={item.description}
                                                            image={item.image}
                                                            showImage={
                                                                style.cardTemplate !== "no-image"
                                                            }
                                                            imageRight={style.cardTemplate === "right"}
                                                            mode={mode}
                                                            onClick={() => setSelectedItem(item)}
                                                            optionGroups={item.optionGroups}
                                                            attributes={item.attributes}
                                                            allergens={item.allergens}
                                                        />
                                                    )}

                                                    {/* Divider + variants */}
                                                    {(item.variants?.length ?? 0) > 0 && (
                                                        <>
                                                            <div className={styles.variantsDivider}>
                                                                {item.parentSelected && (
                                                                    <span
                                                                        className={
                                                                            styles.variantsLabel
                                                                        }
                                                                    >
                                                                        Varianti
                                                                    </span>
                                                                )}
                                                            </div>

                                                            {item.variants!.map(v => (
                                                                <ProductRow
                                                                    key={v.id}
                                                                    name={v.name}
                                                                    price={v.price}
                                                                    originalPrice={v.original_price}
                                                                    fromPrice={v.from_price}
                                                                    description={v.description}
                                                                    image={v.image}
                                                                    showImage={
                                                                        style.cardTemplate !==
                                                                        "no-image"
                                                                    }
                                                                    imageRight={style.cardTemplate === "right"}
                                                                    mode={mode}
                                                                    optionGroups={v.optionGroups}
                                                                    onClick={e => {
                                                                        e.stopPropagation();
                                                                        setSelectedItem({
                                                                            id: v.id,
                                                                            name: v.name,
                                                                            parentSelected: true,
                                                                            price: v.price ?? null,
                                                                            original_price:
                                                                                v.original_price ??
                                                                                null,
                                                                            from_price:
                                                                                v.from_price ??
                                                                                null,
                                                                            image: v.image ?? null,
                                                                            description:
                                                                                v.description ??
                                                                                null,
                                                                            ...(v.optionGroups &&
                                                                            v.optionGroups.length >
                                                                                0
                                                                                ? {
                                                                                      optionGroups:
                                                                                          v.optionGroups
                                                                                  }
                                                                                : {}),
                                                                            ...(item.ingredients &&
                                                                            item.ingredients.length >
                                                                                0
                                                                                ? {
                                                                                      ingredients:
                                                                                          item.ingredients
                                                                                  }
                                                                                : {})
                                                                        });
                                                                    }}
                                                                />
                                                            ))}
                                                        </>
                                                    )}
                                                </article>
                                                );
                                            })}
                                        </div>
                                    </section>
                                );
                            })}
                        </div>

                        <ItemDetail
                            item={selectedItem}
                            isOpen={!!selectedItem}
                            onClose={() => setSelectedItem(null)}
                            mode={mode}
                        />
                    </>
                )}
            </div>

            {/* ── SCROLL TO TOP — solo mode="public" ── */}
            {mode === "public" && showScrollToTop && (
                <button
                    type="button"
                    className={styles.scrollToTopBtn}
                    onClick={handleScrollToTop}
                    aria-label="Torna in cima"
                >
                    <ChevronUp size={20} strokeWidth={2.5} />
                </button>
            )}
        </main>
    );
}
