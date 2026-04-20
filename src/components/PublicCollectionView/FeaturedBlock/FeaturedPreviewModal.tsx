import { useEffect, useState } from "react";
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
    // displayBlock persiste durante l'animazione di chiusura.
    // Quando onClose() viene chiamato, il parent imposta block=null e isOpen=false
    // simultaneamente. Senza questo stato, `if (!block) return null` smonterebbe
    // PublicSheet prima che AnimatePresence possa eseguire l'exit animation.
    const [displayBlock, setDisplayBlock] = useState(block);
    useEffect(() => {
        if (block) setDisplayBlock(block);
    }, [block]);

    if (!displayBlock) return null;

    const showImages = displayBlock.layout_style === "with_images";

    const sortedProducts =
        displayBlock.pricing_mode !== "none"
            ? (displayBlock.products ?? [])
                  .slice()
                  .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
                  .filter(item => item.product !== null)
            : [];

    const originalTotal = (() => {
        if (displayBlock.pricing_mode !== "bundle" || !displayBlock.show_original_total) return null;
        const total = (displayBlock.products ?? [])
            .filter(item => item.product != null)
            .reduce((sum, item) => {
                const p = item.product!;
                const price = p.is_from_price ? (p.fromPrice ?? 0) : (p.base_price ?? 0);
                return sum + price;
            }, 0);
        if (total === 0 || total === displayBlock.bundle_price) return null;
        return total;
    })();

    return (
        <PublicSheet
            isOpen={isOpen}
            onClose={onClose}
            ariaLabel={displayBlock.title}
            headerContent={
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
            }
        >
            {/* Corpo scrollabile */}
            <div className={styles.body}>
                {/* Immagine */}
                {displayBlock.media_id && (
                    <img
                        src={displayBlock.media_id}
                        alt={displayBlock.title}
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
                        {displayBlock.title}
                    </Text>

                    {/* Sottotitolo */}
                    {displayBlock.subtitle && (
                        <Text
                            variant="body-sm"
                            className={styles.subtitle}
                        >
                            {displayBlock.subtitle}
                        </Text>
                    )}

                    {/* Descrizione */}
                    {displayBlock.description && (
                        <Text variant="body" className={styles.description}>
                            {displayBlock.description}
                        </Text>
                    )}

                    {/* Lista prodotti */}
                    {sortedProducts.length > 0 && (
                        <ul className={styles.productList}>
                            {sortedProducts.map((item, idx) => {
                                const product = item.product!;
                                const showPrice = displayBlock.pricing_mode === "per_item";
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
                    {displayBlock.pricing_mode === "bundle" &&
                        displayBlock.bundle_price != null && (
                            <div className={styles.bundleSection}>
                                {originalTotal != null && (
                                    <span className={styles.originalTotal}>
                                        {formatPrice(originalTotal)}
                                    </span>
                                )}
                                <span className={styles.bundlePrice}>
                                    {formatPrice(displayBlock.bundle_price)}
                                </span>
                            </div>
                        )}

                    {/* CTA */}
                    {displayBlock.cta_text && displayBlock.cta_url && (
                        <a
                            href={displayBlock.cta_url}
                            className={styles.ctaBtn}
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            {displayBlock.cta_text}
                        </a>
                    )}
                </div>
            </div>
        </PublicSheet>
    );
}
