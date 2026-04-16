import { useState, useRef, useEffect, useCallback } from "react";
import styles from "./FeaturedBlock.module.scss";
import type { V2FeaturedContent } from "@/types/resolvedCollections";
import { FeaturedPreviewModal } from "./FeaturedPreviewModal";
import { trackEvent } from "@/services/analytics/publicAnalytics";

type Props = {
    blocks: V2FeaturedContent[];
    activityId?: string;
    slot?: string;
};

function formatPrice(price: number): string {
    return new Intl.NumberFormat("it-IT", {
        style: "currency",
        currency: "EUR",
        minimumFractionDigits: 2
    }).format(price);
}

function getTagLabel(pricingMode: string | null): string {
    switch (pricingMode) {
        case "bundle": return "BUNDLE";
        case "per_item": return "PROMO";
        default: return "EVENTO";
    }
}

function getTagClass(pricingMode: string | null): string {
    switch (pricingMode) {
        case "bundle": return styles.tagBundle;
        case "per_item": return styles.tagPromo;
        default: return styles.tagEvento;
    }
}

function getPlaceholderDarkClass(pricingMode: string | null): string {
    switch (pricingMode) {
        case "bundle": return styles.heroBgBundle;
        case "per_item": return styles.heroBgPromo;
        default: return styles.heroBgEvento;
    }
}

function getPlaceholderLightClass(pricingMode: string | null): string {
    switch (pricingMode) {
        case "bundle": return styles.thumbBgBundle;
        case "per_item": return styles.thumbBgPromo;
        default: return styles.thumbBgEvento;
    }
}

function getEmoji(pricingMode: string | null): string {
    switch (pricingMode) {
        case "bundle": return "\uD83C\uDF81"; // 🎁
        case "per_item": return "\uD83D\uDD25"; // 🔥
        default: return "\uD83C\uDFA4"; // 🎤
    }
}

/* ══════════════════════════════════════════════════════════════════════════
   COMPONENT
   ══════════════════════════════════════════════════════════════════════════ */

export default function FeaturedBlock({ blocks, activityId, slot }: Props) {
    const [previewBlock, setPreviewBlock] = useState<V2FeaturedContent | null>(null);
    const trackRef = useRef<HTMLDivElement>(null);
    const [activeIndex, setActiveIndex] = useState(0);
    const [needsScroll, setNeedsScroll] = useState(false);

    // ResizeObserver to detect if carousel is actually scrollable
    useEffect(() => {
        const el = trackRef.current;
        if (!el) return;
        const check = () => setNeedsScroll(el.scrollWidth > el.clientWidth + 4);
        check();
        const ro = new ResizeObserver(check);
        ro.observe(el);
        return () => ro.disconnect();
    }, [blocks.length]);

    const handleScroll = useCallback(() => {
        const el = trackRef.current;
        if (!el || !el.firstElementChild) return;
        const firstCard = el.firstElementChild as HTMLElement;
        const cardWidth = firstCard.offsetWidth;
        const gap = 10;
        const idx = Math.round(el.scrollLeft / (cardWidth + gap));
        setActiveIndex(idx);
    }, []);

    useEffect(() => {
        const el = trackRef.current;
        if (!el) return;
        el.addEventListener("scroll", handleScroll, { passive: true });
        return () => el.removeEventListener("scroll", handleScroll);
    }, [handleScroll]);

    if (!blocks || blocks.length === 0) return null;

    const handleCardClick = (block: V2FeaturedContent) => {
        setPreviewBlock(block);
        if (activityId) {
            trackEvent(activityId, "featured_click", {
                featured_id: block.id,
                title: block.title,
                slot
            });
        }
    };

    const handleDotClick = (idx: number) => {
        const el = trackRef.current;
        if (!el || !el.firstElementChild) return;
        const firstCard = el.firstElementChild as HTMLElement;
        const cardWidth = firstCard.offsetWidth;
        const gap = 10;
        el.scrollTo({ left: idx * (cardWidth + gap), behavior: "smooth" });
    };

    const isSingle = blocks.length === 1;

    /* ── CASO 1: Un solo contenuto → Hero banner ──────────────────────── */
    if (isSingle) {
        const block = blocks[0];
        const hasImage = !!block.media_id;

        return (
            <>
            <div className={styles.wrapper}>
                <button
                    type="button"
                    className={`${styles.hero} ${hasImage ? "" : getPlaceholderDarkClass(block.pricing_mode)}`}
                    onClick={() => handleCardClick(block)}
                >
                    {hasImage ? (
                        <img
                            src={block.media_id!}
                            alt={block.title}
                            className={styles.heroBgImg}
                            loading="lazy"
                        />
                    ) : (
                        <span className={styles.heroEmoji}>{getEmoji(block.pricing_mode)}</span>
                    )}
                    <div className={styles.heroGradient} />
                    <div className={styles.heroContent}>
                        <span className={styles.heroTag}>{getTagLabel(block.pricing_mode)}</span>
                        <span className={styles.heroTitle}>{block.title}</span>
                        {block.subtitle && (
                            <span className={styles.heroSubtitle}>{block.subtitle}</span>
                        )}
                        {block.pricing_mode === "bundle" && block.bundle_price != null && (
                            <span className={styles.heroPrice}>{formatPrice(block.bundle_price)}</span>
                        )}
                    </div>
                </button>
            </div>
            <FeaturedPreviewModal
                block={previewBlock}
                isOpen={!!previewBlock}
                onClose={() => setPreviewBlock(null)}
            />
            </>
        );
    }

    /* ── CASO 2+3: Più contenuti → Carousel mobile / Grid desktop ───── */
    const cardWidthClass = blocks.length === 2 ? styles.cardWide : styles.cardNarrow;
    const gridCols = Math.min(blocks.length, 3);

    return (
        <>
        <div className={styles.wrapper}>
            {/* Mobile: carousel | Desktop: grid */}
            <div
                className={styles.track}
                ref={trackRef}
                style={{ "--grid-cols": gridCols } as React.CSSProperties}
            >
                {blocks.map((block) => {
                    const hasImage = !!block.media_id;
                    return (
                        <button
                            key={block.id}
                            type="button"
                            className={`${styles.card} ${cardWidthClass}`}
                            onClick={() => handleCardClick(block)}
                        >
                            {/* Thumbnail */}
                            <div className={styles.cardThumb}>
                                {hasImage ? (
                                    <img
                                        src={block.media_id!}
                                        alt={block.title}
                                        className={styles.cardThumbImg}
                                        loading="lazy"
                                    />
                                ) : (
                                    <div className={`${styles.cardThumbPlaceholder} ${getPlaceholderLightClass(block.pricing_mode)}`}>
                                        <span className={styles.cardThumbEmoji}>{getEmoji(block.pricing_mode)}</span>
                                    </div>
                                )}
                                <span className={`${styles.cardTag} ${getTagClass(block.pricing_mode)} ${hasImage ? styles.cardTagOnImage : ""}`}>
                                    {getTagLabel(block.pricing_mode)}
                                </span>
                            </div>

                            {/* Body */}
                            <div className={styles.cardBody}>
                                <span className={styles.cardTitle}>{block.title}</span>
                                {block.subtitle && (
                                    <span className={styles.cardSubtitle}>{block.subtitle}</span>
                                )}
                                {block.pricing_mode === "bundle" && block.bundle_price != null && (
                                    <span className={styles.cardPrice}>{formatPrice(block.bundle_price)}</span>
                                )}
                            </div>
                        </button>
                    );
                })}
            </div>

            {/* Dots — only on mobile when scrollable */}
            {needsScroll && blocks.length > 1 && (
                <div className={styles.dots}>
                    {blocks.map((_, idx) => (
                        <button
                            key={idx}
                            type="button"
                            className={`${styles.dot} ${idx === activeIndex ? styles.dotActive : ""}`}
                            onClick={() => handleDotClick(idx)}
                            aria-label={`Vai al contenuto ${idx + 1}`}
                        />
                    ))}
                </div>
            )}
        </div>

        <FeaturedPreviewModal
            block={previewBlock}
            isOpen={!!previewBlock}
            onClose={() => setPreviewBlock(null)}
        />
        </>
    );
}
