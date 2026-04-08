import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Info, Package } from "lucide-react";
import type { ResolvedAllergen, ResolvedIngredient } from "@/types/resolvedCollections";
import Text from "@/components/ui/Text/Text";
import { Pill } from "@/components/ui/Pill/Pill";
import CollectionHero from "../CollectionHero/CollectionHero";
import CollectionSectionNav from "../CollectionSectionNav/CollectionSectionNav";
import PublicBrandHeader from "../PublicBrandHeader/PublicBrandHeader";
import type { CardTemplate, CollectionStyle } from "@/types/collectionStyle";
import styles from "./CollectionView.module.scss";
import ItemDetail from "../ItemDetail/ItemDetail";

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

const ALLERGEN_EMOJI: Record<string, string> = {
    gluten: "🌾",
    eggs: "🥚",
    fish: "🐟",
    crustaceans: "🦐",
    shellfish: "🦐",
    peanuts: "🥜",
    soybeans: "🫘",
    soy: "🫘",
    milk: "🥛",
    dairy: "🥛",
    nuts: "🌰",
    tree_nuts: "🌰",
    celery: "🌿",
    mustard: "🌱",
    sesame: "🫙",
    sulphites: "❗",
    sulfur_dioxide: "❗",
    lupin: "🌸",
    molluscs: "🐚",
    mollusks: "🐚"
};

type ProductRowProps = {
    name: string;
    fromPrice?: number | null;
    price?: number | null;
    effectivePrice?: number | null;
    originalPrice?: number | null;
    description?: string | null;
    image?: string | null;
    showImage: boolean;
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
        <div className={styles.productRow} onClick={onClick}>
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
                                title={a.label_it}
                                aria-label={a.label_it}
                            >
                                {ALLERGEN_EMOJI[a.code] ?? "⚠️"}
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

// ─── Scroll-offset constants — single source of truth ───────────────────────
// SCROLL_OFFSET: how far from the container top a section title lands after a
//   click-triggered scroll.  Matches CSS scroll-margin-top: 4.5rem (72px).
// STICKY_OFFSET: the threshold at which a section is considered "active" during
//   manual scrolling.  Must be ≥ SCROLL_OFFSET so a section is always detected
//   as active once a programmatic scroll settles.
const NAV_HEIGHT = 56; // CollectionSectionNav (~3.5rem)
const VISUAL_GAP = 16; // breathing room below sticky bar
const SCROLL_OFFSET = NAV_HEIGHT + VISUAL_GAP; // 72 px — heading fully visible
const STICKY_OFFSET = SCROLL_OFFSET + 4; // 76 px — detection threshold
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
    /** Tenant logo URL to display above the hero in public mode. */
    tenantLogoUrl?: string | null;
    /** Explicit scroll container. Use when the component lives inside a custom
     *  scrollable element (e.g. the style-editor canvas). If omitted, the nearest
     *  scrollable ancestor is detected automatically; falls back to window. */
    scrollContainerEl?: HTMLElement | null;
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
    scrollContainerEl
}: Props) {
    const [activeSectionId, setActiveSectionId] = useState<string | null>(
        () => sections[0]?.id ?? null
    );
    const sectionRefs = useRef<Record<string, HTMLElement | null>>({});
    const pageRef = useRef<HTMLElement | null>(null);
    // Holds the resolved scroll container so scrollToSection can use it
    // without re-walking the DOM on every click.
    const containerRef = useRef<HTMLElement | Window>(window);
    // pendingScrollTargetIdRef: set on pill click, cleared when the target section
    // actually reaches STICKY_OFFSET.  Prevents ping-pong during smooth scroll.
    const pendingScrollTargetIdRef = useRef<string | null>(null);
    // Safety fallback: releases the guard if the scroll never settles (e.g. the
    // section is already on-screen, a layout shift occurs, etc.).
    const safetyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [selectedItem, setSelectedItem] = useState<CollectionViewSectionItem | null>(null);

    // Keep first section active as default when sections load asynchronously
    useEffect(() => {
        if (!activeSectionId && sections.length > 0) {
            setActiveSectionId(sections[0].id);
        }
    }, [activeSectionId, sections]);

    useEffect(() => {
        if (sections.length === 0) return;

        // Resolve scroll container: explicit prop takes precedence.
        // Fallback: walk up the DOM to find the nearest overflow:auto/scroll
        // ancestor (handles the public page → window case automatically).
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

        // Persist so scrollToSection can compute the target without re-detecting.
        containerRef.current = container;

        function computeActiveSection() {
            // Compute which section is naturally active based on scroll position.
            const containerTop =
                container === window ? 0 : (container as HTMLElement).getBoundingClientRect().top;

            let naturalActive = sections[0].id;
            for (const section of sections) {
                const el = sectionRefs.current[section.id];
                if (!el) continue;
                const sectionTop = el.getBoundingClientRect().top - containerTop;
                if (sectionTop <= STICKY_OFFSET) {
                    naturalActive = section.id;
                } else {
                    break;
                }
            }

            // Click-navigation guard ─────────────────────────────────────────
            // Keep the clicked category active until the target section has
            // physically reached STICKY_OFFSET from the container top.
            // This is threshold-based (not timeout-only) to prevent ping-pong.
            if (pendingScrollTargetIdRef.current !== null) {
                const targetId = pendingScrollTargetIdRef.current;
                const targetEl = sectionRefs.current[targetId];
                if (targetEl) {
                    const targetTop = targetEl.getBoundingClientRect().top - containerTop;
                    if (targetTop > STICKY_OFFSET) {
                        // Target not yet reached — suppress natural detection.
                        return;
                    }
                }
                // Target reached (or element gone) — release the guard.
                pendingScrollTargetIdRef.current = null;
                if (safetyTimeoutRef.current !== null) {
                    clearTimeout(safetyTimeoutRef.current);
                    safetyTimeoutRef.current = null;
                }
            }
            // ────────────────────────────────────────────────────────────────

            setActiveSectionId(naturalActive);
        }

        computeActiveSection();
        container.addEventListener("scroll", computeActiveSection, { passive: true });
        return () => {
            container.removeEventListener("scroll", computeActiveSection);
            // Clean up on unmount / effect re-run so refs don't leak.
            if (safetyTimeoutRef.current !== null) {
                clearTimeout(safetyTimeoutRef.current);
                safetyTimeoutRef.current = null;
            }
            pendingScrollTargetIdRef.current = null;
        };
    }, [sections, scrollContainerEl]);

    const navItems: SectionNavItem[] = useMemo(
        () => sections.map(s => ({ id: s.id, name: s.name })),
        [sections]
    );

    const scrollToSection = (sectionId: string) => {
        // 1. Activate pill immediately — don't wait for scroll to settle.
        setActiveSectionId(sectionId);

        // 2. Arm the threshold-based click-navigation guard.
        //    computeActiveSection will suppress natural detection until the target
        //    section physically reaches STICKY_OFFSET from the container top.
        pendingScrollTargetIdRef.current = sectionId;

        // 3. Safety timeout: releases the guard if the scroll never settles
        //    (section already on-screen, layout shift, or scroll interrupted).
        if (safetyTimeoutRef.current !== null) clearTimeout(safetyTimeoutRef.current);
        safetyTimeoutRef.current = setTimeout(() => {
            pendingScrollTargetIdRef.current = null;
            safetyTimeoutRef.current = null;
        }, 1000);

        const el = sectionRefs.current[sectionId];
        if (!el) return;

        // 4. Scroll the section to SCROLL_OFFSET from the container top.
        //    VISUAL_GAP (16px) of breathing room below the sticky bar keeps the
        //    heading fully readable.  SCROLL_OFFSET (72) < STICKY_OFFSET (76) so
        //    the section is guaranteed to be detected active once scroll settles.
        const container = containerRef.current;

        if (container === window) {
            const top = el.getBoundingClientRect().top + window.scrollY - SCROLL_OFFSET;
            window.scrollTo({ top, behavior: "smooth" });
        } else {
            const containerEl = container as HTMLElement;
            const top =
                el.getBoundingClientRect().top -
                containerEl.getBoundingClientRect().top +
                containerEl.scrollTop -
                SCROLL_OFFSET;
            containerEl.scrollTo({ top, behavior: "smooth" });
        }
    };

    return (
        <main className={styles.page} ref={pageRef}>
            {/* Skip link (solo public) */}
            {mode === "public" && (
                <a className={styles.skipLink} href={`#${contentId}`}>
                    <Text variant="caption">Salta al contenuto</Text>
                </a>
            )}

            {/* BRAND HEADER – logo sopra la hero (solo public, se presente) */}
            {mode === "public" && tenantLogoUrl && (
                <PublicBrandHeader logoUrl={tenantLogoUrl} brandName={businessName} />
            )}

            {/* HERO – full-bleed, fuori dal frame */}
            <CollectionHero
                title={businessName}
                subtitle={collectionTitle}
                imageUrl={businessImage}
                variant={mode === "public" ? "public" : "preview"}
            />

            {featuredHeroSlot}

            {/* NAV – sticky, full-bleed, fuori dal frame */}
            {!emptyState && (
                <CollectionSectionNav
                    sections={navItems}
                    activeSectionId={activeSectionId}
                    onSelect={scrollToSection}
                    variant={mode === "public" ? "public" : "preview"}
                    style={{
                        shape: style.sectionNavShape,
                        navStyle: style.sectionNavStyle
                    }}
                />
            )}

            {/* FRAME – contenuto centrato e max-width responsivo */}
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
                        <div
                            id={contentId}
                            className={styles.container}
                            data-card-layout={style.cardLayout ?? "list"}
                        >
                            {featuredBeforeCatalogSlot}
                            {sections.map(section => {
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
                                                            mode={mode}
                                                            onClick={() => setSelectedItem(item)}
                                                            optionGroups={item.optionGroups}
                                                            attributes={item.attributes}
                                                            allergens={item.allergens}
                                                        />
                                                    )}

                                                    {/* Divider + variants: only if there are variants to show */}
                                                    {(item.variants?.length ?? 0) > 0 && (
                                                        <>
                                                            {/* Divider with label only in Case A (parent + variants).
                                                                Case B (no parent): still render divider but without label */}
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
        </main>
    );
}
