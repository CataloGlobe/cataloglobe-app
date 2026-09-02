import { Package } from "lucide-react";
import { Link } from "react-router-dom";
import { useTenantId } from "@/context/useTenantId";
import { Badge } from "@/components/ui/Badge/Badge";
import Text from "@/components/ui/Text/Text";
import { hasConfiguredPrice } from "@/utils/productPriceStatus";
import { TableRowActions } from "@/components/ui/TableRowActions/TableRowActions";
import { FramedMedia } from "@components/ui/FramedMedia";
import { PRODUCT_IMAGE_DEFAULT_FRAMING } from "./productImageFraming";
import type { V2Product, ProductListMetadata } from "@/services/supabase/products";
import styles from "./ProductCard.module.scss";

type Props = {
    product: V2Product;
    metadata: ProductListMetadata;
    onEdit: () => void;
    onDelete: () => void;
};

function formatPrice(product: V2Product, metadata: ProductListMetadata): string | null {
    if (metadata.pricedFormatsCount > 1 && metadata.fromPrice !== null) {
        return `da ${metadata.fromPrice.toFixed(2)} €`;
    }
    if (metadata.pricedFormatsCount === 1 && metadata.fromPrice !== null) {
        return `${metadata.fromPrice.toFixed(2)} €`;
    }
    if (product.base_price !== null) {
        return `${product.base_price.toFixed(2)} €`;
    }
    return null;
}

export default function ProductCard({ product, metadata, onEdit, onDelete }: Props) {
    const tenantId = useTenantId();
    const price = formatPrice(product, metadata);
    // Un prodotto base non eredita da nessuno: la domanda si ferma a lui.
    const missingPrice = !hasConfiguredPrice({
        basePrice: product.base_price,
        pricedFormatsCount: metadata.pricedFormatsCount
    });

    return (
        <div className={styles.card}>
            {/* Immagine / Placeholder */}
            <Link
                to={`/business/${tenantId}/products/${product.id}`}
                className={styles.imageLink}
                tabIndex={-1}
                aria-hidden="true"
            >
                {product.image_url ? (
                    <FramedMedia
                        source={product.image_url}
                        framing={product.image_framing ?? PRODUCT_IMAGE_DEFAULT_FRAMING}
                        aspectRatio={null}
                        alt={product.name}
                    />
                ) : (
                    <div className={styles.placeholder} aria-hidden="true">
                        <Package size={28} strokeWidth={1.5} />
                    </div>
                )}
            </Link>

            {/* Body */}
            <div className={styles.body}>
                <Link
                    to={`/business/${tenantId}/products/${product.id}`}
                    className={styles.nameLink}
                >
                    <Text variant="body-sm" weight={600} className={styles.name}>
                        {product.name}
                    </Text>
                </Link>

                {missingPrice ? (
                    <Badge variant="warning">Senza prezzo</Badge>
                ) : (
                    <Text variant="caption" colorVariant="muted" className={styles.price}>
                        {price ?? "—"}
                    </Text>
                )}
            </div>

            {/* Overlay azioni — visibile solo al hover */}
            <div
                className={styles.overlayActions}
                onClick={e => e.preventDefault()}
            >
                <TableRowActions
                    actions={[
                        { label: "Modifica", onClick: onEdit },
                        { label: "Elimina", onClick: onDelete, variant: "destructive" }
                    ]}
                />
            </div>
        </div>
    );
}
