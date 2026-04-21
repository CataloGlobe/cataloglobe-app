import { type KeyboardEvent, useState, useEffect } from "react";
import type { V2FeaturedContent } from "@/types/resolvedCollections";
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
};

function formatPrice(price: number): string {
    return new Intl.NumberFormat("it-IT", {
        style: "currency",
        currency: "EUR",
        minimumFractionDigits: 2
    }).format(price);
}

function getTagLabel(contentType: string | null): string {
    switch (contentType) {
        case "bundle": return "Bundle";
        case "promo": return "Promo";
        case "event": return "Evento";
        default: return "Annuncio";
    }
}

export default function FeaturedCard({ block, onClick, onCtaClick, className, variant = "card", eager = false }: FeaturedCardProps) {
    const hasImage = !!block.media_id;
    const hasCta = !!block.cta_text && !!block.cta_url;
    const keyHandler = (e: KeyboardEvent) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); }
    };

    // ── Fade-in: reset quando cambia immagine ─────────────────────────────
    const [imgLoaded, setImgLoaded] = useState(false);
    useEffect(() => { setImgLoaded(false); }, [block.media_id]);

    const imgProps = {
        loading: (eager ? "eager" : "lazy") as "eager" | "lazy",
        ...(eager && { fetchPriority: "high" as const }),
        onLoad: () => setImgLoaded(true),
    };

    if (variant === "highlight") {
        return (
            <div
                role="listitem"
                tabIndex={0}
                className={`${styles.card} ${styles.cardHighlight} ${className ?? ""}`}
                onClick={onClick}
                onKeyDown={keyHandler}
            >
                {hasImage && (
                    <img
                        src={block.media_id!}
                        alt=""
                        aria-hidden="true"
                        className={`${styles.highlightBg} ${imgLoaded ? styles.imgLoaded : ""}`}
                        {...imgProps}
                    />
                )}
                <div className={styles.highlightGradient} aria-hidden="true" />
                <span
                    className={`${styles.cardTag} ${styles.tagPrimary} ${styles.highlightBadge} ${styles.cardTagOnImage}`}
                >
                    {getTagLabel(block.content_type)}
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
                            <a
                                href={block.cta_url!}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={styles.highlightCta}
                                onClick={(e) => { e.stopPropagation(); onCtaClick?.(); }}
                            >
                                {block.cta_text}
                            </a>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div
            role="listitem"
            tabIndex={0}
            className={`${styles.card} ${className ?? ""}`}
            onClick={onClick}
            onKeyDown={keyHandler}
        >
            <div className={styles.cardThumb}>
                {hasImage ? (
                    <img
                        src={block.media_id!}
                        alt={block.title}
                        className={`${styles.cardThumbImg} ${imgLoaded ? styles.imgLoaded : ""}`}
                        {...imgProps}
                    />
                ) : (
                    <div className={styles.cardThumbPlaceholder} />
                )}
                <span className={`${styles.cardTag} ${styles.tagPrimary} ${hasImage ? styles.cardTagOnImage : ""}`}>
                    {getTagLabel(block.content_type)}
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
                        <a
                            href={block.cta_url!}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={styles.cardCta}
                            onClick={(e) => { e.stopPropagation(); onCtaClick?.(); }}
                        >
                            {block.cta_text}
                        </a>
                    </div>
                )}
            </div>
        </div>
    );
}
