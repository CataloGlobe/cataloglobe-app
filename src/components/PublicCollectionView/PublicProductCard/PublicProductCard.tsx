import React, { useState } from "react";
import styles from "./PublicProductCard.module.scss";
import type { ResolvedProduct } from "@/services/supabase/resolveActivityCatalogs";
import Text from "@/components/ui/Text/Text";
import ModalLayout, {
    ModalLayoutContent,
    ModalLayoutHeader
} from "@/components/ui/ModalLayout/ModalLayout";
import { Button } from "@/components/ui";
import type { StyleTokenModel } from "@/pages/Dashboard/Styles/Editor/StyleTokenModel";
import ProductDetailOptions from "@/components/catalog-renderer/ProductDetailOptions";

type Props = {
    product: ResolvedProduct;
    tokens: StyleTokenModel;
};

type ProductAttribute = {
    definition?: {
        label?: string | null;
    } | null;
    value_text?: string | null;
    value_number?: number | null;
    value_boolean?: boolean | null;
};

type ProductAllergen = {
    label_it?: string | null;
};

export default function PublicProductCard({ product, tokens }: Props) {
    const [isDetailOpen, setIsDetailOpen] = useState(false);
    if (!product.is_visible) return null;

    const visibleVariants = product.variants?.filter(v => typeof v.price === "number") || [];
    const hasOptions = (product.optionGroups?.length ?? 0) > 0;
    const isDisabled = product.is_disabled === true;
    const isClickable = hasOptions && !isDisabled;

    const isList = tokens.card.layout === "list";
    const showImage = tokens.card.image.mode === "show";
    const imagePos = tokens.card.image.position;

    // Determine what to show as price on the card
    const renderPriceBadge = () => {
        // Priority: from_price → effective_price → price
        if (product.from_price != null) {
            return (
                <div className={styles.priceBlock}>
                    <Text variant="body" weight={700} className={styles.price}>
                        da {product.from_price.toFixed(2)} €
                    </Text>
                </div>
            );
        }
        const displayPrice = product.effective_price ?? product.price;
        if (typeof displayPrice === "number") {
            return (
                <div className={styles.priceBlock}>
                    <Text variant="body" weight={700} className={styles.price}>
                        € {displayPrice.toFixed(2)}
                    </Text>
                    {typeof product.original_price === "number" && (
                        <Text
                            variant="caption"
                            colorVariant="muted"
                            className={styles.originalPrice}
                        >
                            € {product.original_price.toFixed(2)}
                        </Text>
                    )}
                </div>
            );
        }
        return null;
    };

    // Format attributes
    const renderAttributes = (attrs: ProductAttribute[] | undefined) => {
        if (!attrs || attrs.length === 0) return null;
        return (
            <div className={styles.attributesList}>
                {attrs.map((a, i) => (
                    <Text
                        key={i}
                        variant="caption"
                        colorVariant="muted"
                        className={styles.attributeItem}
                    >
                        {a.definition?.label ?? "Attributo"}:{" "}
                        {a.value_text || a.value_number || (a.value_boolean ? "Sì" : "No")}
                    </Text>
                ))}
            </div>
        );
    };

    // Format allergens
    const renderAllergens = (allergens: ProductAllergen[] | undefined) => {
        if (!allergens || allergens.length === 0) return null;
        const names = allergens.map(al => al.label_it).filter(Boolean).join(", ");
        return (
            <Text variant="caption" className={styles.allergensText}>
                Allergeni: {names}
            </Text>
        );
    };

    return (
        <>
            <article
                className={`${styles.card} ${isList ? styles.listLayout : styles.gridLayout} ${
                    isDisabled ? styles.disabledCard : ""
                }`}
                onClick={isClickable ? () => setIsDetailOpen(true) : undefined}
                style={{
                    ...(isClickable ? { cursor: "pointer" } : undefined),
                    ...(isList && imagePos === "right"
                        ? { flexDirection: "row-reverse" }
                        : undefined)
                }}
                tabIndex={isClickable ? 0 : undefined}
                onKeyDown={
                    isClickable
                        ? e => {
                              if (e.key === "Enter" || e.key === " ") setIsDetailOpen(true);
                          }
                        : undefined
                }
                role={isClickable ? "button" : undefined}
                aria-label={isClickable ? `Vedi opzioni per ${product.name}` : undefined}
                aria-disabled={isDisabled || undefined}
            >
                {showImage && (
                    <div className={styles.imageContainer}>
                        {product.image_url ? (
                            <img
                                src={product.image_url}
                                alt={product.name}
                                className={styles.image}
                            />
                        ) : (
                            <div className={styles.imagePlaceholder}>
                                <div className={styles.placeholderIcon} />
                            </div>
                        )}
                    </div>
                )}

                <div className={styles.content}>
                    <div className={styles.baseProduct}>
                        <div className={styles.headerRow}>
                            <Text variant="body" weight={700} className={styles.name}>
                                {product.name}
                            </Text>
                            {renderPriceBadge()}
                        </div>

                        {product.description && (
                            <Text
                                variant="caption"
                                colorVariant="muted"
                                className={styles.description}
                            >
                                {product.description}
                            </Text>
                        )}
                        {isDisabled && (
                            <Text variant="caption" className={styles.unavailableBadge}>
                                Non disponibile
                            </Text>
                        )}

                        {renderAttributes(product.attributes)}
                        {renderAllergens(product.allergens)}
                    </div>

                    {visibleVariants.length > 0 && (
                        <div className={styles.variantsContainer}>
                            {visibleVariants.map(variant => (
                                <div key={variant.id} className={styles.variantRow}>
                                    <div className={styles.variantHeader}>
                                        <Text variant="body-sm" weight={600}>
                                            {variant.name}
                                        </Text>
                                        {typeof variant.price === "number" && (
                                            <Text variant="body-sm" weight={600}>
                                                € {variant.price.toFixed(2)}
                                            </Text>
                                        )}
                                    </div>
                                    {renderAttributes(variant.attributes)}
                                    {renderAllergens(variant.allergens)}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </article>

            {/* Detail sheet — interactive options + live price */}
            {isClickable && (
                <ModalLayout
                    isOpen={isDetailOpen}
                    onClose={() => setIsDetailOpen(false)}
                    width="sm"
                    height="sm"
                >
                    <ModalLayoutHeader>
                        <div>
                            <Text as="h2" variant="title-md" weight={700}>
                                {product.name}
                            </Text>
                        </div>
                        <Button variant="secondary" onClick={() => setIsDetailOpen(false)}>
                            Chiudi
                        </Button>
                    </ModalLayoutHeader>

                    <ModalLayoutContent>
                        <div style={{ padding: "4px 0" }}>
                            {product.description && (
                                <Text
                                    variant="body"
                                    colorVariant="muted"
                                    style={{ marginBottom: 20 }}
                                >
                                    {product.description}
                                </Text>
                            )}

                            <ProductDetailOptions optionGroups={product.optionGroups!} />
                        </div>
                    </ModalLayoutContent>
                </ModalLayout>
            )}
        </>
    );
}
