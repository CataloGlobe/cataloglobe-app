import type { V2Product, ProductListMetadata } from "@/services/supabase/products";
import ProductCard from "./ProductCard";
import ProductCardVariant from "./ProductCardVariant";
import styles from "./ProductCardGroup.module.scss";

const EMPTY_METADATA: ProductListMetadata = {
    formatsCount: 0,
    configurationsCount: 0,
    catalogsCount: 0,
    fromPrice: null,
};

type Props = {
    product: V2Product;
    variants: V2Product[];
    metadata: Record<string, ProductListMetadata>;
    onEdit: (p: V2Product) => void;
    onDelete: (p: V2Product) => void;
};

function formatParentPrice(product: V2Product, meta: ProductListMetadata): string | null {
    if (meta.formatsCount > 1 && meta.fromPrice !== null) return `da ${meta.fromPrice.toFixed(2)} €`;
    if (meta.formatsCount === 1 && meta.fromPrice !== null) return `${meta.fromPrice.toFixed(2)} €`;
    if (product.base_price !== null) return `${product.base_price.toFixed(2)} €`;
    return null;
}

export default function ProductCardGroup({ product, variants, metadata, onEdit, onDelete }: Props) {
    const spanCols = Math.min(1 + variants.length, 3);
    const parentPrice = formatParentPrice(product, metadata[product.id] ?? EMPTY_METADATA);

    return (
        <div
            className={styles.groupWrapper}
            style={{ gridColumn: `span ${spanCols}` }}
        >
            <ProductCard
                product={product}
                metadata={metadata[product.id] ?? EMPTY_METADATA}
                onEdit={() => onEdit(product)}
                onDelete={() => onDelete(product)}
            />
            {variants.map(variant => (
                <ProductCardVariant
                    key={variant.id}
                    variant={variant}
                    metadata={metadata[variant.id] ?? EMPTY_METADATA}
                    parentPrice={parentPrice}
                />
            ))}
        </div>
    );
}
