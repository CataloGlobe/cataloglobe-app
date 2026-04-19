import { type ReactNode } from "react";
import { BadgeInfo, Gift, Tag } from "lucide-react";
import type { V2FeaturedContent } from "@/types/resolvedCollections";
import styles from "./FeaturedCard.module.scss";

export type FeaturedCardProps = {
    block: V2FeaturedContent;
    onClick: () => void;
    /** Chiamato al click sul pulsante CTA (solo per analytics — la navigazione è gestita dall'<a>). */
    onCtaClick?: () => void;
    className?: string;
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

function getTagClass(contentType: string | null): string {
    switch (contentType) {
        case "bundle": return styles.tagBundle;
        case "promo": return styles.tagPromo;
        default: return styles.tagEvento;
    }
}

function getPlaceholderLightClass(contentType: string | null): string {
    switch (contentType) {
        case "bundle": return styles.thumbBgBundle;
        case "promo": return styles.thumbBgPromo;
        default: return styles.thumbBgEvento;
    }
}

function getPlaceholderIcon(contentType: string | null): ReactNode {
    const props = { size: 48, strokeWidth: 1.75 };
    switch (contentType) {
        case "bundle": return <Gift {...props} />;
        case "promo": return <Tag {...props} />;
        default: return <BadgeInfo {...props} />;
    }
}

export default function FeaturedCard({ block, onClick, onCtaClick, className }: FeaturedCardProps) {
    const hasImage = !!block.media_id;
    const hasCta = !!block.cta_text && !!block.cta_url;

    return (
        <div
            role="listitem"
            tabIndex={0}
            className={`${styles.card} ${className ?? ""}`}
            onClick={onClick}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } }}
        >
            <div className={styles.cardThumb}>
                {hasImage ? (
                    <img
                        src={block.media_id!}
                        alt={block.title}
                        className={styles.cardThumbImg}
                        loading="lazy"
                    />
                ) : (
                    <div className={`${styles.cardThumbPlaceholder} ${getPlaceholderLightClass(block.content_type)}`}>
                        <span className={styles.cardThumbIcon} aria-hidden="true">
                            {getPlaceholderIcon(block.content_type)}
                        </span>
                    </div>
                )}
                <span className={`${styles.cardTag} ${getTagClass(block.content_type)} ${hasImage ? styles.cardTagOnImage : ""}`}>
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
