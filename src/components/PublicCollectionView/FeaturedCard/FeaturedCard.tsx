import { type CSSProperties, type KeyboardEvent, type Ref, useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { V2FeaturedContent } from "@/types/resolvedCollections";
import { framePercent, offset, hasBands } from "@/components/ui/ImageReframeEditor/reframeGeometry";
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

const FRAME_RATIO = 16 / 9;
// Neutral band fill when media_fill_color is null (e.g. dominant not extracted).
const FILL_FALLBACK = "#e5e7eb";

type FramedMediaProps = {
    block: V2FeaturedContent;
    baseImgClass: string;
    alt: string;
    ariaHidden?: boolean;
    imgLoaded: boolean;
    imgRef: Ref<HTMLImageElement>;
    loading: "eager" | "lazy";
    onLoad: () => void;
};

/**
 * Renders the featured image reproducing the saved framing with pure CSS (no box
 * measurement, SSR-safe). Legacy rows (media_aspect_ratio null OR zoom == 1) take
 * the simple cover + object-position path; zoom != 1 uses the parametric path with
 * an optional band-fill layer behind the image.
 */
function FramedMedia({
    block,
    baseImgClass,
    alt,
    ariaHidden,
    imgLoaded,
    imgRef,
    loading,
    onLoad
}: FramedMediaProps) {
    const ratio = block.media_aspect_ratio;
    const zoom = block.media_zoom ?? 1;
    const fx = block.media_focal_x ?? 0.5;
    const fy = block.media_focal_y ?? 0.5;

    // Legacy / cover path: covers ratio null OR zoom == 1 (no bands possible).
    if (ratio == null || Math.abs(zoom - 1) < 1e-4) {
        return (
            <img
                ref={imgRef}
                src={block.media_id!}
                alt={alt}
                aria-hidden={ariaHidden}
                loading={loading}
                onLoad={onLoad}
                className={`${baseImgClass} ${imgLoaded ? styles.imgLoaded : ""}`}
                style={{ objectPosition: `${fx * 100}% ${fy * 100}%` }}
            />
        );
    }

    // Parametric path: size the image in % of the frame, position by focal.
    const { widthPct, heightPct } = framePercent(FRAME_RATIO, ratio, zoom);
    const { ox, oy } = offset(100, 100, widthPct, heightPct, fx, fy);
    const bands = hasBands(100, 100, widthPct, heightPct);
    const fillColor = block.media_fill_color ?? FILL_FALLBACK;
    const showBlur = bands && block.media_fill_mode === "blur";
    // 'dominant' and 'color' both render as a solid tint from media_fill_color.
    const showColor =
        bands && (block.media_fill_mode === "dominant" || block.media_fill_mode === "color");

    const imgStyle: CSSProperties = {
        width: `${widthPct}%`,
        height: `${heightPct}%`,
        left: `${ox}%`,
        top: `${oy}%`
    };

    return (
        <>
            {showBlur && (
                <img
                    src={block.media_id!}
                    alt=""
                    aria-hidden="true"
                    className={styles.framedFillBlur}
                    draggable={false}
                />
            )}
            {showColor && (
                <div className={styles.framedFill} style={{ backgroundColor: fillColor }} aria-hidden="true" />
            )}
            <img
                ref={imgRef}
                src={block.media_id!}
                alt={alt}
                aria-hidden={ariaHidden}
                loading={loading}
                onLoad={onLoad}
                className={`${styles.framedImg} ${imgLoaded ? styles.imgLoaded : ""}`}
                style={imgStyle}
            />
        </>
    );
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

export default function FeaturedCard({ block, onClick, onCtaClick, className, variant = "card", eager = false }: FeaturedCardProps) {
    const { t } = useTranslation("public");
    const tagLabel = t(getTagKey(block.content_type));
    const hasImage = !!block.media_id;
    const hasCta = !!block.cta_text && !!block.cta_url;
    const keyHandler = (e: KeyboardEvent) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); }
    };

    // ── Fade-in: reset quando cambia immagine ─────────────────────────────
    const imgRef = useRef<HTMLImageElement>(null);
    const [imgLoaded, setImgLoaded] = useState(false);
    useEffect(() => {
        // Cached image: browser completa load prima che React attacchi onLoad → evento perso.
        // Verifica img.complete dopo mount/cambio src.
        const img = imgRef.current;
        if (img?.complete && img.naturalWidth > 0) setImgLoaded(true);
        else setImgLoaded(false);
    }, [block.media_id]);

    const framedProps = {
        block,
        imgLoaded,
        imgRef,
        loading: (eager ? "eager" : "lazy") as "eager" | "lazy",
        onLoad: () => setImgLoaded(true)
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
                    <FramedMedia {...framedProps} baseImgClass={styles.highlightBg} alt="" ariaHidden />
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
                    <FramedMedia {...framedProps} baseImgClass={styles.cardThumbImg} alt={block.title} />
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
