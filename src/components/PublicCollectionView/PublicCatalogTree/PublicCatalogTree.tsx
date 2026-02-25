import React from "react";
import styles from "./PublicCatalogTree.module.scss";
import type { ResolvedCategory } from "@/services/supabase/v2/resolveActivityCatalogsV2";
import Text from "@/components/ui/Text/Text";
import PublicProductCard from "../PublicProductCard/PublicProductCard";

type Props = {
    category: ResolvedCategory;
};

export default function PublicCatalogTree({ category }: Props) {
    // Hide empty branches without visible products
    const hasVisibleProducts = category.products.some(p => p.is_visible);

    if (!hasVisibleProducts) return null;

    return (
        <div className={styles.categoryContainer} data-level={category.level}>
            <Text
                as="h3"
                variant={category.level === 1 ? "title-md" : "title-sm"}
                className={styles.categoryTitle}
            >
                {category.name}
            </Text>

            <div className={styles.productsGrid}>
                {category.products
                    .filter(p => p.is_visible)
                    .map(product => (
                        <PublicProductCard key={product.id} product={product} />
                    ))}
            </div>
        </div>
    );
}
