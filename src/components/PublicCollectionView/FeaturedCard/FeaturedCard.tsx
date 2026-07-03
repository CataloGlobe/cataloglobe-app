import { type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import type { V2FeaturedContent } from "@/types/resolvedCollections";
import { FramedMedia } from "@components/ui/FramedMedia";
import type { MediaFraming } from "@components/ui/ImageReframeEditor/types";
import styles from "./FeaturedCard.module.scss";

export type FeaturedCardProps = {
    block: V2FeaturedContent;
    onClick: () => void;
    /** Chiamato al click sul pulsante CTA (solo per analytics — la navigazione è gestita dall'<a>). */
    onCtaClick?: () => void;
    className?: string;
    variant?: "card" | "highlight";
    /** Above-the-fold: loading="eager" + fetchpriority="high". Default: lazy. */
    eager?: boolean;
    /** false in StyleEditor preview: card e CTA restano visive ma inerti (niente click/modale/navigazione). Default true. */
    interactive?: boolean;
};

/** Adatta lo snake_case di V2FeaturedContent alla forma canonica MediaFraming. */
function toFraming(b: V2FeaturedContent): MediaFraming {
    return {
        focalX: b.media_focal_x ?? 0.5,
        focalY: b.media_focal_y ?? 0.5,
        zoom: b.media_zoom ?? 1,
        fillMode: b.media_fill_mode ?? "blur",
        fillColor: b.media_fill_color ?? null
    };
}

function formatPrice(price: number): string {
    return new Intl.NumberFormat("it-IT", {
        style: "currency",
        currency: "EUR",
        minimumFractionDigits: 2
    }).format(price);
}

function getTagKey(contentType: string | null): string {
    switch (contentType) {
        case "bundle": return "featured.type_bundle";
        case "promo": return "featured.type_promo";
        case "event": return "featured.type_event";
        default: return "featured.type_announcement";
    }
}

export default function FeaturedCard({ block, onClick, onCtaClick, className, variant = "card", eager = false, interactive = true }: FeaturedCardProps) {
    const { t } = useTranslation("public");
    const tagLabel = t(getTagKey(block.content_type));
    const hasImage = !!block.media_id;
    const hasCta = !!block.cta_text && !!block.cta_url;
    const keyHandler = (e: KeyboardEvent) => {
        if (!interactive) return;
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); }
    };

    if (variant === "highlight") {
        return (
            <div
                role="listitem"
                tabIndex={interactive ? 0 : -1}
                className={`${styles.card} ${styles.cardHighlight} ${interactive ? "" : styles.nonInteractive} ${className ?? ""}`}
                onClick={interactive ? onClick : undefined}
                onKeyDown={keyHandler}
            >
                {hasImage && (
                    <FramedMedia
                        source={block.media_id!}
                        framing={toFraming(block)}
                        aspectRatio={block.media_aspect_ratio}
                        alt=""
                        ariaHidden
                        eager={eager}
                    />
                )}
                <div className={styles.highlightGradient} aria-hidden="true" />
                <span
                    className={`${styles.cardTag} ${styles.tagPrimary} ${styles.highlightBadge} ${styles.cardTagOnImage}`}
                >
                    {tagLabel}
                </span>
                <div className={styles.highlightContent}>
                    <span className={styles.highlightTitle}>{block.title}</span>
                    {block.subtitle && (
                        <span className={styles.highlightSubtitle}>{block.subtitle}</span>
                    )}
                    {block.pricing_mode === "bundle" && block.bundle_price != null && (
                        <span className={styles.highlightPrice}>{formatPrice(block.bundle_price)}</span>
                    )}
                    {hasCta && (
                        <div className={styles.highlightCtaWrapper}>
                            {interactive ? (
                                <a
                                    href={block.cta_url!}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={styles.highlightCta}
                                    onClick={(e) => { e.stopPropagation(); onCtaClick?.(); }}
                                >
                                    {block.cta_text}
                                </a>
                            ) : (
                                <span
                                    className={styles.highlightCta}
                                    tabIndex={-1}
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    {block.cta_text}
                                </span>
                            )}
                        </div>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div
            role="listitem"
            tabIndex={interactive ? 0 : -1}
            className={`${styles.card} ${interactive ? "" : styles.nonInteractive} ${className ?? ""}`}
            onClick={interactive ? onClick : undefined}
            onKeyDown={keyHandler}
        >
            <div className={styles.cardThumb}>
                {hasImage ? (
                    <FramedMedia
                        source={block.media_id!}
                        framing={toFraming(block)}
                        aspectRatio={block.media_aspect_ratio}
                        alt={block.title}
                        eager={eager}
                    />
                ) : (
                    <div className={styles.cardThumbPlaceholder} />
                )}
                <span className={`${styles.cardTag} ${styles.tagPrimary} ${hasImage ? styles.cardTagOnImage : ""}`}>
                    {tagLabel}
                </span>
            </div>
            <div className={styles.cardBody}>
                <span className={styles.cardTitle}>{block.title}</span>
                {block.subtitle && (
                    <span className={styles.cardSubtitle}>{block.subtitle}</span>
                )}
                {block.pricing_mode === "bundle" && block.bundle_price != null && (
                    <span className={styles.cardPrice}>{formatPrice(block.bundle_price)}</span>
                )}
                {hasCta && (
                    <div className={styles.cardCtaWrapper}>
                        {interactive ? (
                            <a
                                href={block.cta_url!}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={styles.cardCta}
                                onClick={(e) => { e.stopPropagation(); onCtaClick?.(); }}
                            >
                                {block.cta_text}
                            </a>
                        ) : (
                            <span
                                className={styles.cardCta}
                                tabIndex={-1}
                                onClick={(e) => e.stopPropagation()}
                            >
                                {block.cta_text}
                            </span>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
