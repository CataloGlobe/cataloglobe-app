import { X, ImageIcon } from "lucide-react";
import type { V2FeaturedContent } from "@/types/resolvedCollections";
import Text from "@/components/ui/Text/Text";
import PublicSheet from "../PublicSheet/PublicSheet";
import styles from "./FeaturedPreviewModal.module.scss";

function formatPrice(price: number): string {
    return new Intl.NumberFormat("it-IT", {
        style: "currency",
        currency: "EUR",
        minimumFractionDigits: 2
    }).format(price);
}

type Props = {
    block: V2FeaturedContent | null;
    isOpen: boolean;
    onClose: () => void;
};

export function FeaturedPreviewModal({ block, isOpen, onClose }: Props) {
    if (!block) return null;

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
                const price = p.is_from_price ? (p.fromPrice ?? 0) : (p.base_price ?? 0);
                return sum + price;
            }, 0);
        if (total === 0 || total === block.bundle_price) return null;
        return total;
    })();

    return (
        <PublicSheet isOpen={isOpen} onClose={onClose} ariaLabel={block.title}>
            {/* Header con pulsante chiudi */}
            <div className={styles.sheetHeader}>
                <button
                    type="button"
                    className={styles.closeBtn}
                    onClick={onClose}
                    aria-label="Chiudi"
                >
                    <X size={16} strokeWidth={2} />
                    <span>Chiudi</span>
                </button>
            </div>

            {/* Corpo scrollabile */}
            <div className={styles.body}>
                {/* Immagine */}
                {block.media_id && (
                    <img
                        src={block.media_id}
                        alt={block.title}
                        className={styles.image}
                        loading="lazy"
                    />
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
                            colorVariant="muted"
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
                                            {showPrice && !hasVariants &&
                                                (product.is_from_price
                                                    ? product.fromPrice != null && (
                                                          <span className={styles.productPrice}>
                                                              {"da " + formatPrice(product.fromPrice)}
                                                          </span>
                                                      )
                                                    : product.base_price != null && (
                                                          <span className={styles.productPrice}>
                                                              {formatPrice(product.base_price)}
                                                          </span>
                                                      ))}
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

                    {/* CTA */}
                    {block.cta_text && block.cta_url && (
                        <a
                            href={block.cta_url}
                            className={styles.ctaBtn}
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            {block.cta_text}
                        </a>
                    )}
                </div>
            </div>
        </PublicSheet>
    );
}
