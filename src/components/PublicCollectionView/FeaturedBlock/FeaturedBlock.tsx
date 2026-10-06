import { useState, useRef, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import styles from "./FeaturedBlock.module.scss";
import type { V2FeaturedContent } from "@/types/resolvedCollections";
import FeaturedCard from "@/components/PublicCollectionView/FeaturedCard/FeaturedCard";
import { trackEvent } from "@/services/analytics/publicAnalytics";

/** Card per slot oltre le quali il carosello si chiude con «Vedi tutti». */
export const FEATURED_CAROUSEL_LIMIT = 4;

type Props = {
    blocks: V2FeaturedContent[];
    activityId?: string;
    slot?: "before_catalog" | "after_catalog";
    /** Contenuti di oggi in tutti e due gli slot (deduplicati): è il numero
     *  della card «Vedi tutti», lo stesso dell'elenco nella sheet. */
    totalCount: number;
    /** Tap su una card: apre la sheet «In evidenza» sul dettaglio. */
    onOpenDetail: (block: V2FeaturedContent) => void;
    /** Tap su «Vedi tutti»: apre la sheet «In evidenza» sull'elenco. */
    onOpenAll: () => void;
    layout?: "card" | "highlight" | "compact";
    /** Mostra il subtitle nella card overview. Default true (comportamento storico). */
    showSubtitle?: boolean;
    /** Mostra il titolo nella card overview. Default true (comportamento storico). */
    showTitle?: boolean;
    /** Mostra il pulsante CTA nella card overview. Default true (comportamento storico). */
    showCta?: boolean;
    /** false in StyleEditor preview: card e CTA restano visive ma inerti. Default true. */
    interactive?: boolean;
};

/* ══════════════════════════════════════════════════════════════════════════
   DOTS INDICATOR
   ══════════════════════════════════════════════════════════════════════════ */

function FeaturedDots({
    count,
    activeIndex,
    onDotClick
}: {
    count: number;
    activeIndex: number;
    onDotClick: (idx: number) => void;
}) {
    const { t } = useTranslation("public");
    return (
        <div className={styles.dots} role="tablist" aria-label={t("featured.indicator_aria")}>
            {Array.from({ length: count }, (_, idx) => (
                <button
                    key={idx}
                    type="button"
                    role="tab"
                    aria-selected={idx === activeIndex}
                    className={`${styles.dot} ${idx === activeIndex ? styles.dotActive : ""}`}
                    onClick={() => onDotClick(idx)}
                    aria-label={t("featured.dot_aria", { index: idx + 1, count })}
                />
            ))}
        </div>
    );
}

/* ══════════════════════════════════════════════════════════════════════════
   CENTER-SNAP HELPERS
   ══════════════════════════════════════════════════════════════════════════ */

function findCenteredIndex(el: HTMLElement): number {
    const viewCenter = el.scrollLeft + el.clientWidth / 2;
    const cards = Array.from(el.children) as HTMLElement[];
    let closestIdx = 0;
    let closestDist = Infinity;
    for (let i = 0; i < cards.length; i++) {
        const card = cards[i];
        const cardCenter = card.offsetLeft + card.offsetWidth / 2;
        const dist = Math.abs(cardCenter - viewCenter);
        if (dist < closestDist) {
            closestDist = dist;
            closestIdx = i;
        }
    }
    return closestIdx;
}

function scrollToSnap(el: HTMLElement, idx: number, totalCount: number) {
    const card = el.children[idx] as HTMLElement | undefined;
    if (!card) return;

    let targetScrollLeft: number;
    if (idx === 0) {
        targetScrollLeft = 0;
    } else if (idx === totalCount - 1) {
        targetScrollLeft = el.scrollWidth - el.clientWidth;
    } else {
        const cardCenter = card.offsetLeft + card.offsetWidth / 2;
        targetScrollLeft = cardCenter - el.clientWidth / 2;
    }

    el.scrollTo({ left: Math.max(0, targetScrollLeft), behavior: "smooth" });
}

/* ══════════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ══════════════════════════════════════════════════════════════════════════ */

/* ══════════════════════════════════════════════════════════════════════════
   CARD «VEDI TUTTI» — chiude il carosello oltre FEATURED_CAROUSEL_LIMIT
   ══════════════════════════════════════════════════════════════════════════ */

function SeeAllCard({ count, onClick, interactive }: { count: number; onClick: () => void; interactive: boolean }) {
    const { t } = useTranslation("public");
    // listitem attorno al bottone: il track è role="list", un <button> non
    // può esserne figlio diretto.
    return (
        <div role="listitem" className={styles.seeAllItem}>
            <button
                type="button"
                className={styles.seeAll}
                onClick={interactive ? onClick : undefined}
                tabIndex={interactive ? undefined : -1}
                aria-label={t("featured.see_all_aria", { count })}
            >
                <span className={styles.seeAllCount} aria-hidden="true">{count}</span>
                <span className={styles.seeAllLabel} aria-hidden="true">{t("featured.see_all_label", { count })}</span>
                <span className={styles.seeAllAction} aria-hidden="true">{t("featured.see_all")}</span>
            </button>
        </div>
    );
}

export default function FeaturedBlock({ blocks, activityId, slot, totalCount, onOpenDetail, onOpenAll, layout = "card", showSubtitle = true, showTitle = true, showCta = true, interactive = true }: Props) {
    const { t } = useTranslation("public");
    // Slot above-the-fold: immagini caricate eager con priorità alta
    const isAboveFold = slot === "before_catalog";
    const hasSeeAll = blocks.length > FEATURED_CAROUSEL_LIMIT;
    const visibleBlocks = hasSeeAll ? blocks.slice(0, FEATURED_CAROUSEL_LIMIT) : blocks;
    // I puntini contano anche la card finale: è un elemento del carosello.
    const itemCount = visibleBlocks.length + (hasSeeAll ? 1 : 0);
    const trackRef = useRef<HTMLDivElement>(null);
    const [activeIndex, setActiveIndex] = useState(0);
    const [needsScroll, setNeedsScroll] = useState(false);

    useEffect(() => {
        const el = trackRef.current;
        if (!el) return;
        const check = () => setNeedsScroll(el.scrollWidth > el.clientWidth + 4);
        check();
        const ro = new ResizeObserver(check);
        ro.observe(el);
        return () => ro.disconnect();
    }, [itemCount]);

    const handleScroll = useCallback(() => {
        const el = trackRef.current;
        if (!el || el.children.length === 0) return;
        // La prima/ultima card non possono mai centrare il proprio centro nel
        // viewport (ancorate ai bordi): findCenteredIndex vincerebbe sempre la
        // seconda/penultima agli estremi. Gestione esplicita dei bordi con
        // tolleranza subpixel così il dot 0 e l'ultimo si attivano davvero.
        const TOL = 4;
        if (el.scrollLeft <= TOL) {
            setActiveIndex(0);
            return;
        }
        if (el.scrollLeft + el.clientWidth >= el.scrollWidth - TOL) {
            setActiveIndex(el.children.length - 1);
            return;
        }
        setActiveIndex(findCenteredIndex(el));
    }, []);

    useEffect(() => {
        const el = trackRef.current;
        if (!el) return;
        el.addEventListener("scroll", handleScroll, { passive: true });
        return () => el.removeEventListener("scroll", handleScroll);
    }, [handleScroll]);

    if (!blocks || blocks.length === 0) return null;

    const handleCardClick = (block: V2FeaturedContent) => {
        onOpenDetail(block);
        if (activityId) {
            trackEvent(activityId, "featured_click", {
                featured_id: block.id,
                title: block.title,
                slot
            });
        }
    };

    const handleCtaClick = (block: V2FeaturedContent) => {
        if (activityId) {
            trackEvent(activityId, "featured_cta_click", {
                featured_id: block.id,
                cta_url: block.cta_url,
                source: "overview"
            });
        }
    };

    const handleSeeAllClick = () => {
        onOpenAll();
        if (activityId) {
            trackEvent(activityId, "featured_see_all_click", {
                slot,
                count: totalCount
            });
        }
    };

    const handleDotClick = (idx: number) => {
        const el = trackRef.current;
        if (!el) return;
        scrollToSnap(el, idx, itemCount);
    };

    /* ── 1 contenuto → Card singola full-width ────────────────────────── */
    if (blocks.length === 1) {
        return (
            <div className={styles.wrapper}>
                <FeaturedCard
                    block={blocks[0]}
                    onClick={() => handleCardClick(blocks[0])}
                    onCtaClick={() => handleCtaClick(blocks[0])}
                    className={styles.cardSingle}
                    variant={layout}
                    showSubtitle={showSubtitle}
                    showTitle={showTitle}
                    showCta={showCta}
                    eager={isAboveFold}
                    interactive={interactive}
                />
            </div>
        );
    }

    /* ── ≥ 2 contenuti → SEMPRE carosello monoriga (mai wrap) ──────────── */
    /* Se ci stanno tutte nella riga si vedono tutte (nessuno scroll); se non
       ci stanno si scrolla. Nessuna griglia che va a capo. */
    const trackClass = [styles.track, styles.trackCarouselAlways].join(" ");

    return (
        <div className={styles.wrapper}>
            <div
                className={trackClass}
                ref={trackRef}
                role="list"
                aria-label={t("featured.section_aria")}
            >
                {visibleBlocks.map((block) => (
                    <FeaturedCard
                        key={block.id}
                        block={block}
                        onClick={() => handleCardClick(block)}
                        onCtaClick={() => handleCtaClick(block)}
                        className={styles.cardCarousel}
                        variant={layout}
                        showSubtitle={showSubtitle}
                        showTitle={showTitle}
                        showCta={showCta}
                        eager={isAboveFold}
                        interactive={interactive}
                    />
                ))}
                {hasSeeAll && (
                    <SeeAllCard count={totalCount} onClick={handleSeeAllClick} interactive={interactive} />
                )}
            </div>

            {needsScroll && (
                <FeaturedDots
                    count={itemCount}
                    activeIndex={activeIndex}
                    onDotClick={handleDotClick}
                />
            )}
        </div>
    );
}
