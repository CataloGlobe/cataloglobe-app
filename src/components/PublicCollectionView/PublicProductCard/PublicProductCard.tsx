import React from "react";
import styles from "./PublicProductCard.module.scss";
import type { ResolvedProduct } from "@/services/supabase/v2/resolveActivityCatalogsV2";
import Text from "@/components/ui/Text/Text";

type Props = {
    product: ResolvedProduct;
};

export default function PublicProductCard({ product }: Props) {
    if (!product.is_visible) return null;

    const visibleVariants = product.variants?.filter(v => typeof v.price === "number") || []; // assuming if it has a price it's visible for now. Actually, the backend resolve does NOT output is_visible for variants currently, so we show all attached.

    // Format attributes
    const renderAttributes = (attrs: any[] | undefined) => {
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
                        {a.definition?.label}:{" "}
                        {a.value_text || a.value_number || (a.value_boolean ? "Sì" : "No")}
                    </Text>
                ))}
            </div>
        );
    };

    // Format allergens
    const renderAllergens = (allergens: any[] | undefined) => {
        if (!allergens || allergens.length === 0) return null;
        const names = allergens.map(al => al.label_it).join(", ");
        return (
            <Text variant="caption" className={styles.allergensText}>
                Allergeni: {names}
            </Text>
        );
    };

    return (
        <article className={styles.card}>
            <div className={styles.baseProduct}>
                <div className={styles.headerRow}>
                    <Text variant="body" weight={700} className={styles.name}>
                        {product.name}
                    </Text>
                    {typeof product.price === "number" && (
                        <div className={styles.priceBlock}>
                            <Text variant="body" weight={700} className={styles.price}>
                                € {product.price.toFixed(2)}
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
                    )}
                </div>

                {product.description && (
                    <Text variant="caption" colorVariant="muted" className={styles.description}>
                        {product.description}
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
        </article>
    );
}
