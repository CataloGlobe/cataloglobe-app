import { Layers } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useTenantId } from "@/context/useTenantId";
import Text from "@/components/ui/Text/Text";
import { TableRowActions } from "@/components/ui/TableRowActions/TableRowActions";
import type { FeaturedContentWithProducts, FeaturedContentPricingMode } from "@/services/supabase/featuredContents";
import styles from "./FeaturedContentCard.module.scss";

type Props = {
    item: FeaturedContentWithProducts;
    onEdit: () => void;
    onDelete: () => void;
};

const PRICING_MODE_LABELS: Record<FeaturedContentPricingMode, string> = {
    none: "Solo informativo",
    per_item: "Con prodotti",
    bundle: "Prezzo fisso"
};

export default function FeaturedContentCard({ item, onEdit, onDelete }: Props) {
    const tenantId = useTenantId();
    const navigate = useNavigate();

    const handleCardClick = () => {
        navigate(`/business/${tenantId}/featured/${item.id}`);
    };

    const productsCount = item.products_count ?? 0;
    const productsLabel =
        item.pricing_mode === "none"
            ? "Solo informativo"
            : productsCount === 0
              ? "Nessun prodotto"
              : `${productsCount} prodott${productsCount === 1 ? "o" : "i"}`;

    return (
        <div className={styles.card} onClick={handleCardClick}>
            {/* Immagine / Placeholder */}
            <div className={styles.imageWrapper}>
                {item.media_id ? (
                    <div
                        className={styles.image}
                        style={{ backgroundImage: `url(${item.media_id})` }}
                        role="img"
                        aria-label={item.title}
                    />
                ) : (
                    <div className={styles.placeholder} aria-hidden="true">
                        <Layers size={28} strokeWidth={1.5} />
                    </div>
                )}
            </div>

            {/* Body */}
            <div className={styles.body}>
                <Text variant="body-sm" weight={600} className={styles.title}>
                    {item.title}
                </Text>

                <Text variant="caption" colorVariant="muted" className={styles.subtitle}>
                    {item.subtitle || "Nessun sottotitolo"}
                </Text>

                <div className={styles.meta}>
                    <Text variant="caption" colorVariant="muted" className={styles.productsCount}>
                        {productsLabel}
                    </Text>
                    <span className={styles.badge}>
                        {PRICING_MODE_LABELS[item.pricing_mode]}
                    </span>
                </div>
            </div>

            {/* Overlay azioni — visibile solo al hover */}
            <div
                className={styles.overlayActions}
                onClick={e => e.stopPropagation()}
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
