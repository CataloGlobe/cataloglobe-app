import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import type { V2FeaturedContent } from "@/services/supabase/resolveActivityCatalogs";
import Text from "@/components/ui/Text/Text";
import ItemDetail from "@/components/PublicCollectionView/ItemDetail/ItemDetail";
import type { CollectionViewSectionItem } from "@/components/PublicCollectionView/CollectionView/CollectionView";
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
    const [selectedProduct, setSelectedProduct] =
        useState<CollectionViewSectionItem | null>(null);

    // Scroll lock
    useEffect(() => {
        if (!isOpen) return;
        const original = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => {
            document.body.style.overflow = original;
        };
    }, [isOpen]);

    // Escape key — chiude prima il secondo livello, poi la modale
    useEffect(() => {
        if (!isOpen) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== "Escape") return;
            e.preventDefault();
            if (selectedProduct) {
                setSelectedProduct(null);
            } else {
                onClose();
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [isOpen, onClose, selectedProduct]);

    // Reset prodotto selezionato quando la modale si chiude
    useEffect(() => {
        if (!isOpen) setSelectedProduct(null);
    }, [isOpen]);

    if (!block) return null;

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
        <>
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        className={styles.overlay}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        onClick={onClose}
                        role="presentation"
                    >
                        <motion.div
                            className={styles.panel}
                            role="dialog"
                            aria-modal="true"
                            aria-label={block.title}
                            initial={{ opacity: 0, y: 60 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 60 }}
                            transition={{ type: "spring", duration: 0.38, bounce: 0.18 }}
                            onClick={e => e.stopPropagation()}
                        >
                            {/* Bottone chiudi */}
                            <button
                                type="button"
                                className={styles.closeBtn}
                                onClick={onClose}
                                aria-label="Chiudi"
                            >
                                <X size={18} strokeWidth={2} />
                            </button>

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
                                                const showPrice =
                                                    block.pricing_mode === "per_item";
                                                return (
                                                    <li
                                                        key={`${product.id}-${idx}`}
                                                        className={styles.productItem}
                                                    >
                                                        <button
                                                            type="button"
                                                            className={styles.productBtn}
                                                            onClick={() =>
                                                                setSelectedProduct({
                                                                    id: product.id,
                                                                    name: product.name,
                                                                    description:
                                                                        product.description ??
                                                                        null,
                                                                    price:
                                                                        product.base_price ?? null,
                                                                    from_price:
                                                                        product.is_from_price
                                                                            ? (product.fromPrice ??
                                                                                  null)
                                                                            : null,
                                                                    image:
                                                                        product.image_url ?? null,
                                                                    parentSelected: true
                                                                })
                                                            }
                                                        >
                                                            <span className={styles.productName}>
                                                                {product.name}
                                                            </span>
                                                            {item.note && (
                                                                <span
                                                                    className={styles.productNote}
                                                                >
                                                                    {item.note}
                                                                </span>
                                                            )}
                                                        </button>

                                                        {showPrice &&
                                                            (product.is_from_price
                                                                ? product.fromPrice != null && (
                                                                      <span
                                                                          className={
                                                                              styles.productPrice
                                                                          }
                                                                      >
                                                                          {"da " +
                                                                              formatPrice(
                                                                                  product.fromPrice
                                                                              )}
                                                                      </span>
                                                                  )
                                                                : product.base_price != null && (
                                                                      <span
                                                                          className={
                                                                              styles.productPrice
                                                                          }
                                                                      >
                                                                          {formatPrice(
                                                                              product.base_price
                                                                          )}
                                                                      </span>
                                                                  ))}
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
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Secondo livello: dettaglio prodotto (z-index 1000, sopra il panel a 900) */}
            <ItemDetail
                item={selectedProduct}
                isOpen={!!selectedProduct}
                onClose={() => setSelectedProduct(null)}
                mode="public"
            />
        </>
    );
}
