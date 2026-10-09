import { useTranslation } from "react-i18next";
import { ImageIcon } from "lucide-react";
import type { V2FeaturedContent } from "@/types/resolvedCollections";
import Text from "@/components/ui/Text/Text";
import { FramedMedia } from "@components/ui/FramedMedia";
import { toFeaturedFraming } from "./featuredFraming";
import { resolveFeaturedDisplayPrice } from "@utils/resolveFeaturedDisplayPrice";
import styles from "./FeaturedPreviewModal.module.scss";
import { safeHttpHref } from "@/utils/sanitizeUrl";

function formatPrice(price: number): string {
    return new Intl.NumberFormat("it-IT", {
        style: "currency",
        currency: "EUR",
        minimumFractionDigits: 2
    }).format(price);
}

type Props = {
    block: V2FeaturedContent;
};

/**
 * Pulsante d'azione del contenuto in evidenza, da passare allo slot
 * `footerContent` di PublicSheet: sta fuori dall'area che scorre, sempre
 * visibile, e si muove col pannello (nessuna animazione propria).
 * Null se il contenuto non ha CTA.
 */
export function FeaturedCtaFooter({ block }: Props) {
    const href = safeHttpHref(block.cta_url);
    if (!block.cta_text || !href) return null;
    return (
        <div className={styles.ctaFooter}>
            <a
                href={href}
                className={styles.ctaBtn}
                target="_blank"
                rel="noopener noreferrer"
            >
                {block.cta_text}
            </a>
        </div>
    );
}

/**
 * Corpo del dettaglio contenuto in evidenza, reso in-place dentro `EventsView`
 * (l'unica sheet «In evidenza» di CollectionView: elenco e dettaglio nella
 * stessa sheet, mai una seconda `PublicSheet` impilata).
 * La CTA non sta qui: è `FeaturedCtaFooter`, nel footer della sheet.
 */
export function FeaturedContentDetail({ block }: Props) {
    const { t } = useTranslation("public");
    const showImages = block.layout_style === "with_images";

    const sortedProducts =
        block.pricing_mode !== "none"
            ? (block.products ?? [])
                  .slice()
                  .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
                  .filter(item => item.product !== null)
            : [];

    const originalTotal = (() => {
        if (block.pricing_mode !== "bundle" || !block.show_original_total) return null;
        const total = (block.products ?? [])
            .filter(item => item.product != null)
            .reduce((sum, item) => {
                const p = item.product!;
                const price = resolveFeaturedDisplayPrice(p) ?? 0;
                return sum + price;
            }, 0);
        if (total === 0 || total === block.bundle_price) return null;
        return total;
    })();

    return (
        <div className={styles.body}>
            {/* Immagine */}
            {/* Stesso framing della card (FramedMedia), riquadro 16:9 come l'editor. */}
            {block.media_id && (
                <div className={styles.image}>
                    <FramedMedia
                        source={block.media_id}
                        framing={toFeaturedFraming(block)}
                        aspectRatio={block.media_aspect_ratio}
                        alt={block.title}
                        eager
                    />
                </div>
            )}

            <div className={styles.content}>
                {/* Titolo */}
                <Text
                    variant="title-md"
                    as="h2"
                    weight={700}
                    className={styles.title}
                >
                    {block.title}
                </Text>

                {/* Sottotitolo */}
                {block.subtitle && (
                    <Text
                        variant="body-sm"
                        className={styles.subtitle}
                    >
                        {block.subtitle}
                    </Text>
                )}

                {/* Descrizione */}
                {block.description && (
                    <Text variant="body" className={styles.description}>
                        {block.description}
                    </Text>
                )}

                {/* Lista prodotti */}
                {sortedProducts.length > 0 && (
                    <ul className={styles.productList}>
                        {sortedProducts.map((item, idx) => {
                            const product = item.product!;
                            const showPrice = block.pricing_mode === "per_item";
                            const hasVariants =
                                product.price_variants &&
                                product.price_variants.length > 0;
                            const productPrice = resolveFeaturedDisplayPrice(product);
                            return (
                                <li
                                    key={`${product.id}-${idx}`}
                                    className={styles.productItem}
                                >
                                    <div className={styles.productRow}>
                                        {showImages && (
                                            product.image_url ? (
                                                <img
                                                    src={product.image_url}
                                                    alt={product.name}
                                                    className={styles.productThumb}
                                                    loading="lazy"
                                                />
                                            ) : (
                                                <span className={styles.productThumbPlaceholder}>
                                                    <ImageIcon size={16} strokeWidth={1.5} />
                                                </span>
                                            )
                                        )}
                                        <div className={styles.productInfo}>
                                            <span className={styles.productName}>
                                                {product.name}
                                            </span>
                                            {item.note && (
                                                <span className={styles.productNote}>
                                                    {item.note}
                                                </span>
                                            )}
                                        </div>
                                        {/* Prezzo (solo per_item, senza varianti) */}
                                        {showPrice && !hasVariants && productPrice != null && (
                                            <span className={styles.productPrice}>
                                                {product.is_from_price
                                                    ? t("product.price_from", { price: formatPrice(productPrice) })
                                                    : formatPrice(productPrice)}
                                            </span>
                                        )}
                                    </div>

                                    {/* Varianti inline (PRIMARY_PRICE) */}
                                    {showPrice && hasVariants && (
                                        <ul className={styles.variantList}>
                                            {product.price_variants.map((v, vIdx) => (
                                                <li
                                                    key={vIdx}
                                                    className={styles.variantItem}
                                                >
                                                    {v.name && (
                                                        <span className={styles.variantName}>
                                                            {v.name}
                                                        </span>
                                                    )}
                                                    {v.absolute_price != null && (
                                                        <span className={styles.variantPrice}>
                                                            {formatPrice(v.absolute_price)}
                                                        </span>
                                                    )}
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                )}

                {/* Prezzo bundle */}
                {block.pricing_mode === "bundle" &&
                    block.bundle_price != null && (
                        <div className={styles.bundleSection}>
                            {originalTotal != null && (
                                <span className={styles.originalTotal}>
                                    {formatPrice(originalTotal)}
                                </span>
                            )}
                            <span className={styles.bundlePrice}>
                                {formatPrice(block.bundle_price)}
                            </span>
                        </div>
                    )}

            </div>
        </div>
    );
}
