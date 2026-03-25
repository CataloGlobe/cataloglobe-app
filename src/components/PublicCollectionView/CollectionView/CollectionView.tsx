import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Package } from "lucide-react";
import Text from "@/components/ui/Text/Text";
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
        }[];
    }[];
};

export type CollectionViewSection = {
    id: string;
    name: string;
    items: CollectionViewSectionItem[];
};

// ─── Scroll-offset constants — single source of truth ───────────────────────
// SCROLL_OFFSET: how far from the container top a section title lands after a
//   click-triggered scroll.  Matches CSS scroll-margin-top: 4.5rem (72px).
// STICKY_OFFSET: the threshold at which a section is considered "active" during
//   manual scrolling.  Must be ≥ SCROLL_OFFSET so a section is always detected
//   as active once a programmatic scroll settles.
const NAV_HEIGHT   = 56;                       // CollectionSectionNav (~3.5rem)
const VISUAL_GAP   = 16;                       // breathing room below sticky bar
const SCROLL_OFFSET = NAV_HEIGHT + VISUAL_GAP; // 72 px — heading fully visible
const STICKY_OFFSET = SCROLL_OFFSET + 4;       // 76 px — detection threshold
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
                container === window
                    ? 0
                    : (container as HTMLElement).getBoundingClientRect().top;

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
                                            {section.items.map(item => (
                                                <article
                                                    key={item.id}
                                                    role="listitem"
                                                    className={styles.card}
                                                    data-template={
                                                        style.cardTemplate as CardTemplate
                                                    }
                                                    onClick={() => setSelectedItem(item)}
                                                >
                                                    {style.cardTemplate !== "no-image" &&
                                                        (mode === "preview" || !item.image ? (
                                                            <div
                                                                className={styles.imagePlaceholder}
                                                                aria-hidden="true"
                                                            >
                                                                <Package
                                                                    size={24}
                                                                    strokeWidth={1.5}
                                                                    color="var(--pub-text-muted, var(--pub-text-secondary))"
                                                                />
                                                            </div>
                                                        ) : (
                                                            <img
                                                                src={item.image}
                                                                alt={item.name}
                                                                className={styles.cardImage}
                                                                loading="lazy"
                                                            />
                                                        ))}

                                                    <div className={styles.cardBody}>
                                                        <div className={styles.titleRow}>
                                                            <Text
                                                                variant="body"
                                                                weight={700}
                                                                className={styles.title}
                                                            >
                                                                {item.name}
                                                            </Text>
                                                            {item.original_price != null && (
                                                                <span className={styles.promoBadge}>
                                                                    Promo
                                                                </span>
                                                            )}
                                                        </div>

                                                        {item.from_price != null ? (
                                                            <Text
                                                                variant="caption"
                                                                colorVariant="muted"
                                                                className={styles.price}
                                                            >
                                                                <span
                                                                    className={styles.priceCurrent}
                                                                >
                                                                    da {item.from_price.toFixed(2)}{" "}
                                                                    €
                                                                </span>
                                                            </Text>
                                                        ) : (item.effective_price ?? item.price) !=
                                                          null ? (
                                                            <Text
                                                                variant="caption"
                                                                colorVariant="muted"
                                                                className={styles.price}
                                                            >
                                                                {item.original_price != null && (
                                                                    <span
                                                                        className={
                                                                            styles.priceOriginal
                                                                        }
                                                                    >
                                                                        €{" "}
                                                                        {item.original_price.toFixed(
                                                                            2
                                                                        )}
                                                                    </span>
                                                                )}
                                                                <span
                                                                    className={`${styles.priceCurrent}${item.original_price != null ? ` ${styles.promoPrice}` : ""}`}
                                                                >
                                                                    €{" "}
                                                                    {(
                                                                        item.effective_price ??
                                                                        item.price
                                                                    )?.toFixed(2)}
                                                                </span>
                                                            </Text>
                                                        ) : null}

                                                        {item.description && (
                                                            <Text
                                                                variant="caption"
                                                                colorVariant="muted"
                                                                className={styles.description}
                                                            >
                                                                {item.description}
                                                            </Text>
                                                        )}
                                                    </div>
                                                </article>
                                            ))}
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
