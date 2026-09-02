import { Package } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { Badge } from "@/components/ui/Badge/Badge";
import Text from "@/components/ui/Text/Text";
import { FramedMedia } from "@components/ui/FramedMedia";
import { PRODUCT_IMAGE_DEFAULT_FRAMING } from "./productImageFraming";
import type { V2Product, ProductListMetadata } from "@/services/supabase/products";
import {
    getProductIssues,
    type ProductCompletenessFacts
} from "@/utils/productCompleteness";
import styles from "./ProductCardVariant.module.scss";

type Props = {
    variant: V2Product;
    metadata: ProductListMetadata;
    parentPrice?: string | null;
    /** Fatti del prodotto base, sorgente dell'ereditarietà: senza, una variante che eredita prezzo o menù risulterebbe mancante. */
    parentFacts?: ProductCompletenessFacts | null;
};

function formatVariantPrice(
    variant: V2Product,
    metadata: ProductListMetadata,
    parentPrice?: string | null
): string | null {
    if (metadata.pricedFormatsCount > 1 && metadata.fromPrice !== null) {
        return `da ${metadata.fromPrice.toFixed(2)} €`;
    }
    if (metadata.pricedFormatsCount === 1 && metadata.fromPrice !== null) {
        return `${metadata.fromPrice.toFixed(2)} €`;
    }
    if (variant.base_price !== null) {
        return `${variant.base_price.toFixed(2)} €`;
    }
    // Inherit: show parent's effective price
    return parentPrice ?? null;
}

export default function ProductCardVariant({
    variant,
    metadata,
    parentPrice,
    parentFacts
}: Props) {
    const navigate = useNavigate();
    const { businessId } = useParams<{ businessId: string }>();

    const price = formatVariantPrice(variant, metadata, parentPrice);
    const issues = getProductIssues(
        {
            basePrice: variant.base_price,
            pricedFormatsCount: metadata.pricedFormatsCount,
            catalogsCount: metadata.catalogsCount
        },
        parentFacts
    );

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
                    <FramedMedia
                        source={variant.image_url}
                        framing={variant.image_framing ?? PRODUCT_IMAGE_DEFAULT_FRAMING}
                        aspectRatio={null}
                        alt={variant.name}
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
                {/* Prima il dato, poi il commento: stesso ordine di ProductCard. */}
                <div className={styles.signals}>
                    {issues.missingPrice ? (
                        <Badge variant="warning">Senza prezzo</Badge>
                    ) : (
                        price !== null && (
                            <Text variant="caption" className={styles.price}>
                                {price}
                            </Text>
                        )
                    )}
                    {issues.outOfCatalog && (
                        <Badge variant="warning">Fuori catalogo</Badge>
                    )}
                </div>
            </div>
        </div>
    );
}
