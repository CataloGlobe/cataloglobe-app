import Text from "@/components/ui/Text/Text";
import ModalLayout, {
    ModalLayoutContent,
    ModalLayoutHeader
} from "@/components/ui/ModalLayout/ModalLayout";
import styles from "./ItemDetail.module.scss";

import type { CollectionViewSectionItem } from "../CollectionView/CollectionView";
import { Button } from "@/components/ui";
import ProductDetailOptions from "@/components/catalog-renderer/ProductDetailOptions";
import type { ResolvedOptionGroup } from "@/services/supabase/v2/resolveActivityCatalogsV2";

type Props = {
    item: CollectionViewSectionItem | null;
    isOpen: boolean;
    onClose: () => void;
};

/**
 * Map CollectionViewSectionItem.optionGroups to ResolvedOptionGroup[]
 * so we can pass them to ProductDetailOptions (which uses the richer type).
 */
function mapToResolvedGroups(
    optionGroups: CollectionViewSectionItem["optionGroups"]
): ResolvedOptionGroup[] {
    if (!optionGroups) return [];
    return optionGroups.map(g => ({
        id: g.id,
        name: g.name,
        group_kind: g.group_kind ?? "ADDON",
        pricing_mode: g.pricing_mode ?? "DELTA",
        is_required: g.isRequired,
        max_selectable: g.maxSelectable,
        values: g.values.map(v => ({
            id: v.id,
            name: v.name,
            absolute_price: v.absolutePrice ?? null,
            price_modifier: v.priceModifier
        }))
    }));
}

export default function ItemDetail({ item, isOpen, onClose }: Props) {
    if (!item) return null;

    const resolvedGroups = mapToResolvedGroups(item.optionGroups);
    const hasOptions = resolvedGroups.length > 0;

    return (
        <ModalLayout isOpen={isOpen} onClose={onClose} width="sm" height="sm">
            <ModalLayoutHeader>
                <div className={styles.headerLeft}>
                    <Text as="h2" variant="title-md" weight={700}>
                        {item.name}
                    </Text>
                </div>

                <div className={styles.headerRight}>
                    <Button variant="secondary" onClick={onClose}>
                        Chiudi
                    </Button>
                </div>
            </ModalLayoutHeader>

            <ModalLayoutContent>
                <div className={styles.root}>
                    {/* IMMAGINE */}
                    {item.image ? (
                        <img
                            src={item.image}
                            alt={item.name}
                            className={styles.image}
                            loading="lazy"
                        />
                    ) : (
                        <div className={styles.placeholderImage} />
                    )}

                    {/* CONTENUTO */}
                    <div className={styles.content}>
                        {/* Price header — static display (before interactive calc) */}
                        {!hasOptions && (item.effective_price ?? item.price) != null && (
                            <Text variant="body" weight={600} className={styles.price}>
                                {item.original_price != null && (
                                    <span className={styles.priceOriginal}>
                                        € {item.original_price.toFixed(2)}
                                    </span>
                                )}
                                <span className={styles.priceCurrent}>
                                    € {(item.effective_price ?? item.price)?.toFixed(2)}
                                </span>
                            </Text>
                        )}

                        {/* "da X€" header for products with formats */}
                        {!hasOptions && item.from_price != null && (
                            <Text variant="body" weight={600} className={styles.price}>
                                <span className={styles.priceCurrent}>
                                    da {item.from_price.toFixed(2)} €
                                </span>
                            </Text>
                        )}

                        {item.description && (
                            <Text
                                variant="body"
                                colorVariant="muted"
                                className={styles.description}
                            >
                                {item.description}
                            </Text>
                        )}

                        {/* INTERACTIVE OPTIONS + LIVE PRICE CALC */}
                        {hasOptions && (
                            <div className={styles.optionsSection}>
                                <ProductDetailOptions optionGroups={resolvedGroups} />
                            </div>
                        )}

                        {/* 🔮 SLOT FUTURI
                        - allergeni
                        - ingredienti
                        - CTA
                        - badge
                    */}
                    </div>
                </div>
            </ModalLayoutContent>
        </ModalLayout>
    );
}
