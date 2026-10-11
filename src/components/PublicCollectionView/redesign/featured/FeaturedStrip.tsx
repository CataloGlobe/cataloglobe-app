import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { V2FeaturedContent } from "@/types/resolvedCollections";
import FeaturedCard from "@/components/PublicCollectionView/FeaturedCard/FeaturedCard";
import { trackEvent } from "@/services/analytics/publicAnalytics";
import type { FeaturedSlotContext } from "../slots";
import { openFeaturedDetail, openVenueSheet } from "../sheets/venueSheetPages";
import { FEATURED_TYPE_KEY, featuredStripItems } from "./stripItems";
import styles from "./FeaturedStrip.module.scss";

/**
 * Carosello «In evidenza» del redesign (spec §9, carosello C): card all'80% con
 * la successiva di lato, una linea di avanzamento al posto dei puntini, card
 * finale «Altri N · Vedi tutti (N)» solo oltre 5. Un contenuto: una card a tutta
 * larghezza, senza indicatori. La card apre il dettaglio nel foglio unico,
 * «Vedi tutti» l'elenco.
 */
export default function FeaturedStrip({ blocks, slot, totalCount, activityId, layout, showSubtitle, showTitle, showCta }: FeaturedSlotContext) {
    const { t } = useTranslation("public");
    const { visible, moreCount } = featuredStripItems(blocks, totalCount);
    const trackRef = useRef<HTMLDivElement>(null);
    const thumbRef = useRef<HTMLSpanElement>(null);
    const [scrollable, setScrollable] = useState(false);
    const isAboveFold = slot === "before_catalog";
    const single = visible.length === 1 && moreCount === 0;

    // Linea di avanzamento: scritta nel DOM (solo transform), nessun render a ogni scroll.
    useEffect(() => {
        const track = trackRef.current;
        if (!track) return;
        let frame = 0;
        const paint = () => {
            frame = 0;
            const thumb = thumbRef.current;
            const max = track.scrollWidth - track.clientWidth;
            setScrollable(max > 4);
            if (!thumb || max <= 0) return;
            const ratio = track.clientWidth / track.scrollWidth;
            const progress = Math.min(1, Math.max(0, track.scrollLeft / max));
            thumb.style.transform = `translateX(${progress * (1 - ratio) * 100}%) scaleX(${ratio})`;
        };
        const schedule = () => {
            if (!frame) frame = requestAnimationFrame(paint);
        };
        paint();
        track.addEventListener("scroll", schedule, { passive: true });
        const observer = new ResizeObserver(schedule);
        observer.observe(track);
        return () => {
            cancelAnimationFrame(frame);
            track.removeEventListener("scroll", schedule);
            observer.disconnect();
        };
    }, [visible.length, moreCount]);

    if (visible.length === 0) return null;

    const openDetail = (block: V2FeaturedContent) => {
        openFeaturedDetail(block);
        if (activityId) trackEvent(activityId, "featured_click", { featured_id: block.id, title: block.title, slot });
    };
    const openAll = () => {
        openVenueSheet("featured");
        if (activityId) trackEvent(activityId, "featured_see_all_click", { slot, count: totalCount });
    };
    const trackCta = (block: V2FeaturedContent) => {
        if (activityId) {
            trackEvent(activityId, "featured_cta_click", { featured_id: block.id, cta_url: block.cta_url, source: "overview" });
        }
    };
    const cardLabel = (block: V2FeaturedContent, index: number) =>
        [
            `${t(FEATURED_TYPE_KEY[block.content_type])}: ${block.title}.`,
            block.subtitle ? `${block.subtitle}.` : null,
            t("featured.position", { index: index + 1, count: blocks.length })
        ]
            .filter(Boolean)
            .join(" ");

    const card = (block: V2FeaturedContent, index: number, className: string) => (
        <FeaturedCard
            key={block.id}
            block={block}
            onClick={() => openDetail(block)}
            onCtaClick={() => trackCta(block)}
            className={className}
            variant={layout}
            showSubtitle={showSubtitle}
            showTitle={showTitle}
            showCta={showCta}
            eager={isAboveFold}
            ariaLabel={cardLabel(block, index)}
        />
    );

    if (single) {
        return (
            <div className={styles.strip} role="list" aria-label={t("featured.section_aria")}>
                {card(visible[0], 0, styles.single)}
            </div>
        );
    }

    return (
        <div className={styles.strip}>
            <div ref={trackRef} className={styles.track} role="list" aria-label={t("featured.section_aria")}>
                {visible.map((block, index) => card(block, index, styles.card))}
                {moreCount > 0 ? (
                    <div role="listitem" className={styles.moreItem}>
                        <button type="button" className={styles.more} onClick={openAll}>
                            <span className={styles.moreCount}>{t("featured.more_count", { count: moreCount })}</span>
                            <span className={styles.moreAction}>{t("featured.see_all_count", { count: totalCount })}</span>
                        </button>
                    </div>
                ) : null}
            </div>
            {scrollable ? (
                <span className={styles.line} aria-hidden="true">
                    <span ref={thumbRef} className={styles.thumb} />
                </span>
            ) : null}
        </div>
    );
}
