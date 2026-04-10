import { Package } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { Badge } from "@/components/ui/Badge/Badge";
import Text from "@/components/ui/Text/Text";
import type { V2Product, ProductListMetadata } from "@/services/supabase/products";
import styles from "./ProductCardVariant.module.scss";

type Props = {
    variant: V2Product;
    metadata: ProductListMetadata;
    parentPrice?: string | null;
};

function formatVariantPrice(
    variant: V2Product,
    metadata: ProductListMetadata,
    parentPrice?: string | null
): string | null {
    if (metadata.formatsCount > 1 && metadata.fromPrice !== null) {
        return `da ${metadata.fromPrice.toFixed(2)} €`;
    }
    if (metadata.formatsCount === 1 && metadata.fromPrice !== null) {
        return `${metadata.fromPrice.toFixed(2)} €`;
    }
    if (variant.base_price !== null) {
        return `${variant.base_price.toFixed(2)} €`;
    }
    // Inherit: show parent's effective price
    return parentPrice ?? null;
}

export default function ProductCardVariant({ variant, metadata, parentPrice }: Props) {
    const navigate = useNavigate();
    const { businessId } = useParams<{ businessId: string }>();

    const price = formatVariantPrice(variant, metadata, parentPrice);

    const handleClick = () => {
        navigate(`/business/${businessId}/products/${variant.id}`);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleClick();
        }
    };

    return (
        <div
            className={styles.card}
            onClick={handleClick}
            onKeyDown={handleKeyDown}
            role="button"
            tabIndex={0}
            aria-label={`Variante: ${variant.name}`}
        >
            {/* Image */}
            <div className={styles.imageWrapper}>
                {variant.image_url ? (
                    <div
                        className={styles.image}
                        style={{ backgroundImage: `url(${variant.image_url})` }}
                        role="img"
                        aria-label={variant.name}
                    />
                ) : (
                    <div className={styles.placeholder} aria-hidden="true">
                        <Package size={28} strokeWidth={1.5} />
                    </div>
                )}
                <div className={styles.badge}>
                    <Badge variant="secondary">Variante</Badge>
                </div>
            </div>

            {/* Body */}
            <div className={styles.body}>
                <span className={styles.name}>{variant.name}</span>
                {price !== null && (
                    <Text variant="caption" className={styles.price}>
                        {price}
                    </Text>
                )}
            </div>
        </div>
    );
}
