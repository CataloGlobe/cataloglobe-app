import { type ReactNode } from "react";
import { BadgeInfo, Gift, Tag } from "lucide-react";
import type { V2FeaturedContent } from "@/types/resolvedCollections";
import styles from "./FeaturedCard.module.scss";

export type FeaturedCardProps = {
    block: V2FeaturedContent;
    onClick: () => void;
    className?: string;
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

function getPlaceholderLightClass(pricingMode: string | null): string {
    switch (pricingMode) {
        case "bundle": return styles.thumbBgBundle;
        case "per_item": return styles.thumbBgPromo;
        default: return styles.thumbBgEvento;
    }
}

function getPlaceholderIcon(pricingMode: string | null): ReactNode {
    const props = { size: 48, strokeWidth: 1.75 };
    switch (pricingMode) {
        case "bundle": return <Gift {...props} />;
        case "per_item": return <Tag {...props} />;
        default: return <BadgeInfo {...props} />;
    }
}

export default function FeaturedCard({ block, onClick, className }: FeaturedCardProps) {
    const hasImage = !!block.media_id;

    return (
        <button
            type="button"
            role="listitem"
            className={`${styles.card} ${className ?? ""}`}
            onClick={onClick}
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
                    <div className={`${styles.cardThumbPlaceholder} ${getPlaceholderLightClass(block.pricing_mode)}`}>
                        <span className={styles.cardThumbIcon} aria-hidden="true">
                            {getPlaceholderIcon(block.pricing_mode)}
                        </span>
                    </div>
                )}
                <span className={`${styles.cardTag} ${getTagClass(block.pricing_mode)} ${hasImage ? styles.cardTagOnImage : ""}`}>
                    {getTagLabel(block.pricing_mode)}
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
            </div>
        </button>
    );
}
