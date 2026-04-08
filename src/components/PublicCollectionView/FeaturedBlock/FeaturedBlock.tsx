import React, { useState } from "react";
import { ImageIcon } from "lucide-react";
import styles from "./FeaturedBlock.module.scss";
import type { V2FeaturedContent } from "@/services/supabase/resolveActivityCatalogs";
import Text from "@/components/ui/Text/Text";
import { FeaturedPreviewModal } from "./FeaturedPreviewModal";

type Props = {
    blocks: V2FeaturedContent[];
};

function formatPrice(price: number): string {
    return new Intl.NumberFormat("it-IT", {
        style: "currency",
        currency: "EUR",
        minimumFractionDigits: 2
    }).format(price);
}

export default function FeaturedBlock({ blocks }: Props) {
    const [previewBlock, setPreviewBlock] = useState<V2FeaturedContent | null>(null);

    if (!blocks || blocks.length === 0) return null;

    return (
        <>
        <div className={styles.container}>
            {blocks.map(block => {
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
                    <button
                        key={block.id}
                        type="button"
                        className={styles.card}
                        onClick={() => setPreviewBlock(block)}
                    >
                        {/* ── Immagine media ─────────────────────────── */}
                        {block.media_id && (
                            <img
                                src={block.media_id}
                                alt={block.title}
                                className={styles.mediaImage}
                                loading="lazy"
                            />
                        )}

                        {/* ── Header: titolo + prezzo bundle ─────────── */}
                        <div className={styles.header}>
                            <Text variant="title-md" as="h3" className={styles.title}>
                                {block.title}
                            </Text>
                            {block.pricing_mode === "bundle" && block.bundle_price != null && (
                                <span className={styles.priceGroup}>
                                    {originalTotal != null && originalTotal > 0 && (
                                        <span className={styles.originalPrice}>
                                            {formatPrice(originalTotal)}
                                        </span>
                                    )}
                                    <span className={styles.bundlePrice}>
                                        {formatPrice(block.bundle_price)}
                                    </span>
                                </span>
                            )}
                        </div>

                        {/* ── Sottotitolo ────────────────────────────── */}
                        {block.subtitle && (
                            <Text
                                variant="body-sm"
                                colorVariant="muted"
                                className={styles.subtitle}
                            >
                                {block.subtitle}
                            </Text>
                        )}

                        {/* ── Descrizione ────────────────────────────── */}
                        {block.description && (
                            <Text variant="body" className={styles.description}>
                                {block.description}
                            </Text>
                        )}

                        {/* ── Lista prodotti ─────────────────────────── */}
                        {sortedProducts.length > 0 && (
                            <ul className={styles.productList}>
                                {sortedProducts.map((item, idx) => {
                                    const product = item.product!;
                                    return (
                                        <li
                                            key={`${product.id}-${idx}`}
                                            className={styles.productItem}
                                        >
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
                                                        <ImageIcon size={13} strokeWidth={1.5} />
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
                                            {/* Prezzo prodotto solo in per_item */}
                                            {block.pricing_mode === "per_item" &&
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
                                        </li>
                                    );
                                })}
                            </ul>
                        )}

                        {/* ── CTA ────────────────────────────────────── */}
                        {block.cta_text && block.cta_url && (
                            <span className={styles.ctaButton}>
                                {block.cta_text}
                            </span>
                        )}
                    </button>
                );
            })}
        </div>
        <FeaturedPreviewModal
            block={previewBlock}
            isOpen={!!previewBlock}
            onClose={() => setPreviewBlock(null)}
        />
        </>
    );
}
