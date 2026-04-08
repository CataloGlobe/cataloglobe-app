import React from "react";
import styles from "./PublicCatalogTree.module.scss";
import type { ResolvedCategory } from "@/types/resolvedCollections";
import Text from "@/components/ui/Text/Text";
import PublicProductCard from "../PublicProductCard/PublicProductCard";
import type { StyleTokenModel } from "@/pages/Dashboard/Styles/Editor/StyleTokenModel";

type Props = {
    category: ResolvedCategory;
    tokens: StyleTokenModel;
};

export default function PublicCatalogTree({ category, tokens }: Props) {
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
                        <PublicProductCard key={product.id} product={product} tokens={tokens} />
                    ))}
            </div>
        </div>
    );
}
