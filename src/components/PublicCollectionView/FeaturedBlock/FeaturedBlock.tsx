import React from "react";
import styles from "./FeaturedBlock.module.scss";
import type { V2FeaturedContent } from "@/services/supabase/v2/resolveActivityCatalogsV2";
import Text from "@/components/ui/Text/Text";

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
    if (!blocks || blocks.length === 0) return null;

    return (
        <div className={styles.container}>
            {blocks.map(block => {
                const sortedProducts = (block.products ?? [])
                    .slice()
                    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
                    .filter(item => item.product !== null);

                return (
                    <div key={block.id} className={styles.card}>
                        {/* ── Header: titolo + prezzo bundle ─────────── */}
                        <div className={styles.header}>
                            <Text variant="title-md" as="h3" className={styles.title}>
                                {block.title}
                            </Text>
                            {block.pricing_mode === "bundle" && block.bundle_price != null && (
                                <span className={styles.bundlePrice}>
                                    {formatPrice(block.bundle_price)}
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
                                            <span className={styles.productName}>
                                                {product.name}
                                            </span>
                                            {item.note && (
                                                <span className={styles.productNote}>
                                                    {item.note}
                                                </span>
                                            )}
                                            {/* Prezzo prodotto solo in per_item */}
                                            {block.pricing_mode === "per_item" &&
                                                product.base_price != null && (
                                                    <span className={styles.productPrice}>
                                                        {formatPrice(product.base_price)}
                                                    </span>
                                                )}
                                        </li>
                                    );
                                })}
                            </ul>
                        )}

                        {/* ── CTA ────────────────────────────────────── */}
                        {block.cta_text && block.cta_url && (
                            <a
                                href={block.cta_url}
                                className={styles.ctaButton}
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                {block.cta_text}
                            </a>
                        )}
                    </div>
                );
            })}
        </div>
    );
}
