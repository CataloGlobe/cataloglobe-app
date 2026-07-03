import { lazy, Suspense, useState, useRef, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import styles from "./FeaturedBlock.module.scss";
import type { V2FeaturedContent } from "@/types/resolvedCollections";
import FeaturedCard from "@/components/PublicCollectionView/FeaturedCard/FeaturedCard";
import { trackEvent } from "@/services/analytics/publicAnalytics";

// Lazy-loaded: si apre solo al click su un contenuto in evidenza
const FeaturedPreviewModal = lazy(() =>
    import("./FeaturedPreviewModal").then(m => ({ default: m.FeaturedPreviewModal }))
);

type Props = {
    blocks: V2FeaturedContent[];
    activityId?: string;
    slot?: string;
    layout?: "card" | "highlight";
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

export default function FeaturedBlock({ blocks, activityId, slot, layout = "card", interactive = true }: Props) {
    const { t } = useTranslation("public");
    // Slot above-the-fold: immagini caricate eager con priorità alta
    const isAboveFold = slot === "before_catalog";
    const [previewBlock, setPreviewBlock] = useState<V2FeaturedContent | null>(null);
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
    }, [blocks.length]);

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
        setPreviewBlock(block);
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

    const handleDotClick = (idx: number) => {
        const el = trackRef.current;
        if (!el) return;
        scrollToSnap(el, idx, blocks.length);
    };

    /* ── 1 contenuto → Card singola full-width ────────────────────────── */
    if (blocks.length === 1) {
        return (
            <>
            <div className={styles.wrapper}>
                <FeaturedCard
                    block={blocks[0]}
                    onClick={() => handleCardClick(blocks[0])}
                    onCtaClick={() => handleCtaClick(blocks[0])}
                    className={styles.cardSingle}
                    variant={layout}
                    eager={isAboveFold}
                    interactive={interactive}
                />
            </div>
            {!!previewBlock && (
                <Suspense fallback={null}>
                    <FeaturedPreviewModal
                        block={previewBlock}
                        isOpen={!!previewBlock}
                        onClose={() => setPreviewBlock(null)}
                    />
                </Suspense>
            )}
            </>
        );
    }

    /* ── ≥ 2 contenuti → SEMPRE carosello monoriga (mai wrap) ──────────── */
    /* Se ci stanno tutte nella riga si vedono tutte (nessuno scroll); se non
       ci stanno si scrolla. Nessuna griglia che va a capo. */
    const trackClass = [styles.track, styles.trackCarouselAlways].join(" ");

    return (
        <>
        <div className={styles.wrapper}>
            <div
                className={trackClass}
                ref={trackRef}
                role="list"
                aria-label={t("featured.section_aria")}
            >
                {blocks.map((block) => (
                    <FeaturedCard
                        key={block.id}
                        block={block}
                        onClick={() => handleCardClick(block)}
                        onCtaClick={() => handleCtaClick(block)}
                        className={styles.cardCarousel}
                        variant={layout}
                        eager={isAboveFold}
                        interactive={interactive}
                    />
                ))}
            </div>

            {needsScroll && blocks.length > 1 && (
                <FeaturedDots
                    count={blocks.length}
                    activeIndex={activeIndex}
                    onDotClick={handleDotClick}
                />
            )}
        </div>

        {!!previewBlock && (
            <Suspense fallback={null}>
                <FeaturedPreviewModal
                    block={previewBlock}
                    isOpen={!!previewBlock}
                    onClose={() => setPreviewBlock(null)}
                />
            </Suspense>
        )}
        </>
    );
}
