import { type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import type { V2FeaturedContent } from "@/types/resolvedCollections";
import { FramedMedia } from "@components/ui/FramedMedia";
import { toFeaturedFraming } from "@/components/PublicCollectionView/FeaturedBlock/featuredFraming";
import { hasFeaturedCta, isReservationCta } from "@/components/PublicCollectionView/FeaturedBlock/featuredCta";
import styles from "./FeaturedCard.module.scss";
import { safeHttpHref } from "@/utils/sanitizeUrl";

export type FeaturedCardProps = {
    block: V2FeaturedContent;
    onClick: () => void;
    /** Chiamato al click sul pulsante CTA (solo per analytics — la navigazione è gestita dall'<a>). */
    onCtaClick?: () => void;
    /** Apre il form di prenotazione della sede: usato dal pulsante «Prenota» (cta_action = reservation). */
    onOpenReservation?: () => void;
    className?: string;
    variant?: "card" | "highlight" | "compact" | "image";
    /** Mostra il subtitle nella card overview. Default true (comportamento storico). */
    showSubtitle?: boolean;
    /** Mostra il titolo nella card overview. Default true (comportamento storico). */
    showTitle?: boolean;
    /** Mostra il pulsante CTA nella card overview. Default true (comportamento storico). */
    showCta?: boolean;
    /** Above-the-fold: loading="eager" + fetchpriority="high". Default: lazy. */
    eager?: boolean;
    /** false in StyleEditor preview: card e CTA restano visive ma inerti (niente click/modale/navigazione). Default true. */
    interactive?: boolean;
    /** Nome accessibile della card (redesign: «Tipo: titolo. sottotitolo. 1 di 8»). */
    ariaLabel?: string;
};

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

export default function FeaturedCard({ block, onClick, onCtaClick, onOpenReservation, className, variant = "card", showSubtitle: showSubtitleProp = true, showTitle: showTitleProp = true, showCta: showCtaProp = true, eager = false, interactive = true, ariaLabel }: FeaturedCardProps) {
    const { t } = useTranslation("public");
    const reservationCta = isReservationCta(block);
    const tagLabel = t(getTagKey(block.content_type));
    const hasImage = !!block.media_id;
    // I toggle Titolo/Descrizione/Pulsante hanno effetto solo su Highlight (testo
    // sovrapposto all'immagine) — vedi isFeaturedHighlightControlActive in
    // StyleTokenModel.ts. Su Card/Compatto ignorati: sempre tutto visibile.
    const highlightControlsActive = variant === "highlight";
    const showTitle = highlightControlsActive ? showTitleProp : true;
    const showSubtitle = highlightControlsActive ? showSubtitleProp : true;
    const showCta = highlightControlsActive ? showCtaProp : true;
    const hasCta = showCta && (reservationCta
        ? hasFeaturedCta(block, !!onOpenReservation)
        : !!block.cta_text && !!safeHttpHref(block.cta_url));
    // Un solo punto per il pulsante: «Prenota» è un bottone che apre il form, il resto è un link.
    const renderCta = (className: string) => interactive ? (
        reservationCta ? (
            <button
                type="button"
                className={className}
                onClick={(e) => { e.stopPropagation(); onCtaClick?.(); onOpenReservation?.(); }}
            >
                {block.cta_text}
            </button>
        ) : (
            <a
                href={safeHttpHref(block.cta_url)}
                target="_blank"
                rel="noopener noreferrer"
                className={className}
                onClick={(e) => { e.stopPropagation(); onCtaClick?.(); }}
            >
                {block.cta_text}
            </a>
        )
    ) : (
        <span
            className={className}
            tabIndex={-1}
            onClick={(e) => e.stopPropagation()}
        >
            {block.cta_text}
        </span>
    );
    const hasVisibleText = showTitle || (showSubtitle && !!block.subtitle) || hasCta;
    const keyHandler = (e: KeyboardEvent) => {
        if (!interactive) return;
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); }
    };

    // Solo l'immagine: la grafica 16:9 così come il locale l'ha caricata, il testo resta nel
    // dettaglio. Senza foto un riquadro di testo nello stesso 16:9 (titolo 2 righe, sottotitolo 1).
    if (variant === "image") {
        return (
            <div
                role="listitem"
                aria-label={ariaLabel ?? block.title}
                tabIndex={interactive ? 0 : -1}
                className={`${styles.card} ${styles.cardImage} ${interactive ? "" : styles.nonInteractive} ${className ?? ""}`}
                onClick={interactive ? onClick : undefined}
                onKeyDown={keyHandler}
            >
                {hasImage ? (
                    <FramedMedia
                        source={block.media_id!}
                        framing={toFeaturedFraming(block)}
                        aspectRatio={block.media_aspect_ratio}
                        // Il titolo lo dice già l'aria-label del riquadro.
                        alt=""
                        eager={eager}
                    />
                ) : (
                    <div className={styles.imageText}>
                        <span className={styles.imageTextKick}>{tagLabel}</span>
                        <span className={styles.imageTextTitle}>{block.title}</span>
                        {block.subtitle && <span className={styles.imageTextSubtitle}>{block.subtitle}</span>}
                        {hasCta && <div className={styles.imageTextCta}>{renderCta(styles.cardCta)}</div>}
                    </div>
                )}
            </div>
        );
    }

    if (variant === "compact") {
        return (
            <div
                role="listitem"
                aria-label={ariaLabel}
                tabIndex={interactive ? 0 : -1}
                className={`${styles.cardCompact} ${interactive ? "" : styles.nonInteractive} ${className ?? ""}`}
                onClick={interactive ? onClick : undefined}
                onKeyDown={keyHandler}
            >
                <div className={styles.cardCompactThumb}>
                    {hasImage ? (
                        <FramedMedia
                            source={block.media_id!}
                            framing={toFeaturedFraming(block)}
                            aspectRatio={block.media_aspect_ratio}
                            alt={block.title}
                            eager={eager}
                            frameRatio={1}
                        />
                    ) : (
                        <div className={styles.cardCompactThumbPlaceholder} />
                    )}
                </div>
                <div className={styles.cardCompactBody}>
                    {showTitle && <span className={styles.cardCompactTitle}>{block.title}</span>}
                    {showSubtitle && block.subtitle && (
                        <span className={styles.cardCompactSubtitle}>{block.subtitle}</span>
                    )}
                    {block.pricing_mode === "bundle" && block.bundle_price != null && (
                        <span className={styles.cardCompactPrice}>{formatPrice(block.bundle_price)}</span>
                    )}
                    {hasCta && renderCta(styles.cardCompactCta)}
                </div>
            </div>
        );
    }

    if (variant === "highlight") {
        return (
            <div
                role="listitem"
                aria-label={ariaLabel}
                tabIndex={interactive ? 0 : -1}
                className={`${styles.card} ${styles.cardHighlight} ${interactive ? "" : styles.nonInteractive} ${className ?? ""}`}
                onClick={interactive ? onClick : undefined}
                onKeyDown={keyHandler}
            >
                {hasImage && (
                    <FramedMedia
                        source={block.media_id!}
                        framing={toFeaturedFraming(block)}
                        aspectRatio={block.media_aspect_ratio}
                        alt=""
                        ariaHidden
                        eager={eager}
                    />
                )}
                {hasVisibleText && <div className={styles.highlightGradient} aria-hidden="true" />}
                <span
                    className={`${styles.cardTag} ${styles.tagPrimary} ${styles.highlightBadge} ${styles.cardTagOnImage}`}
                >
                    {tagLabel}
                </span>
                <div className={styles.highlightContent}>
                    {showTitle && <span className={styles.highlightTitle}>{block.title}</span>}
                    {showSubtitle && block.subtitle && (
                        <span className={styles.highlightSubtitle}>{block.subtitle}</span>
                    )}
                    {block.pricing_mode === "bundle" && block.bundle_price != null && (
                        <span className={styles.highlightPrice}>{formatPrice(block.bundle_price)}</span>
                    )}
                    {hasCta && (
                        <div className={styles.highlightCtaWrapper}>
                            {renderCta(styles.highlightCta)}
                        </div>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div
            role="listitem"
                aria-label={ariaLabel}
            tabIndex={interactive ? 0 : -1}
            className={`${styles.card} ${interactive ? "" : styles.nonInteractive} ${className ?? ""}`}
            onClick={interactive ? onClick : undefined}
            onKeyDown={keyHandler}
        >
            <div className={styles.cardThumb}>
                {hasImage ? (
                    <FramedMedia
                        source={block.media_id!}
                        framing={toFeaturedFraming(block)}
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
                {showTitle && <span className={styles.cardTitle}>{block.title}</span>}
                {showSubtitle && block.subtitle && (
                    <span className={styles.cardSubtitle}>{block.subtitle}</span>
                )}
                {block.pricing_mode === "bundle" && block.bundle_price != null && (
                    <span className={styles.cardPrice}>{formatPrice(block.bundle_price)}</span>
                )}
                {hasCta && (
                    <div className={styles.cardCtaWrapper}>
                        {renderCta(styles.cardCta)}
                    </div>
                )}
            </div>
        </div>
    );
}
