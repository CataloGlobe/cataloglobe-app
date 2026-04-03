import { Package } from "lucide-react";
import Text from "@/components/ui/Text/Text";
import ModalLayout, {
    ModalLayoutContent,
    ModalLayoutHeader
} from "@/components/ui/ModalLayout/ModalLayout";
import styles from "./ItemDetail.module.scss";

import type { CollectionViewSectionItem } from "../CollectionView/CollectionView";
import { Button } from "@/components/ui";

type Props = {
    item: CollectionViewSectionItem | null;
    isOpen: boolean;
    onClose: () => void;
    mode: "public" | "preview";
};

export default function ItemDetail({ item, isOpen, onClose, mode }: Props) {
    if (!item) return null;

    const shouldShowImage = mode === "public" && !!item.image;
    const displayPrice = item.effective_price ?? item.price;

    const primaryPriceGroup = item.optionGroups?.find(
        g => g.group_kind?.toUpperCase() === "PRIMARY_PRICE"
    );
    const nonPrimaryGroups =
        item.optionGroups?.filter(g => g.group_kind?.toUpperCase() !== "PRIMARY_PRICE") ?? [];
    const hasNonPrimaryOptions = nonPrimaryGroups.length > 0;

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
                    {shouldShowImage ? (
                        <img
                            src={item.image!}
                            alt={item.name}
                            className={styles.image}
                            loading="lazy"
                        />
                    ) : (
                        <div className={styles.placeholderImage} aria-hidden="true">
                            <Package
                                size={40}
                                strokeWidth={1.5}
                                color="var(--pub-text-muted, var(--pub-text-secondary))"
                            />
                        </div>
                    )}

                    {/* CONTENUTO */}
                    <div className={styles.content}>
                        {/* Prezzo */}
                        {item.from_price != null ? (
                            <Text variant="body" weight={600} className={styles.price}>
                                {item.original_price != null && (
                                    <span className={styles.priceOriginal}>
                                        da € {item.original_price.toFixed(2)}
                                    </span>
                                )}
                                <span className={styles.priceCurrent}>
                                    da € {item.from_price.toFixed(2)}
                                </span>
                            </Text>
                        ) : displayPrice != null ? (
                            <Text variant="body" weight={600} className={styles.price}>
                                {item.original_price != null && (
                                    <span className={styles.priceOriginal}>
                                        € {item.original_price.toFixed(2)}
                                    </span>
                                )}
                                <span className={styles.priceCurrent}>
                                    € {displayPrice.toFixed(2)}
                                </span>
                            </Text>
                        ) : null}

                        {/* FORMAT PRICES — PRIMARY_PRICE option group below the main price */}
                        {primaryPriceGroup && (
                            <div className={styles.formatPrices}>
                                {primaryPriceGroup.values.map(v => (
                                    <div key={v.id} className={styles.formatPriceRow}>
                                        <Text variant="body-sm">{v.name}</Text>
                                        {v.absolutePrice != null && (
                                            <div className={styles.formatPriceValue}>
                                                {v.originalPrice != null && (
                                                    <span className={styles.priceOriginal}>
                                                        € {v.originalPrice.toFixed(2)}
                                                    </span>
                                                )}
                                                <Text variant="body-sm" weight={600}>
                                                    € {v.absolutePrice.toFixed(2)}
                                                </Text>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
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

                        {/* ADDON / extra option groups (non-PRIMARY_PRICE) */}
                        {hasNonPrimaryOptions && (
                            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                                {nonPrimaryGroups.map(group => (
                                    <div key={group.id}>
                                        <Text variant="body-sm" weight={700}>
                                            {group.name}
                                        </Text>
                                        <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 4 }}>
                                            {group.values.map(v => (
                                                <div
                                                    key={v.id}
                                                    style={{
                                                        display: "flex",
                                                        justifyContent: "space-between",
                                                        alignItems: "center"
                                                    }}
                                                >
                                                    <Text variant="body-sm">{v.name}</Text>
                                                    {v.priceModifier != null && (
                                                        <Text
                                                            variant="body-sm"
                                                            weight={v.priceModifier === 0 ? 400 : 600}
                                                            colorVariant={v.priceModifier === 0 ? "muted" : undefined}
                                                        >
                                                            {v.priceModifier === 0
                                                                ? "incluso"
                                                                : v.priceModifier > 0
                                                                    ? `+${v.priceModifier.toFixed(2)} €`
                                                                    : `${v.priceModifier.toFixed(2)} €`}
                                                        </Text>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* ATTRIBUTI */}
                        {item.attributes && item.attributes.length > 0 && (
                            <div style={{ marginTop: 12 }}>
                                {item.attributes.map((a, idx) => {
                                    if (!a.value || a.value.trim() === "") return null;
                                    return (
                                        <Text key={idx} variant="body-sm" colorVariant="muted">
                                            <strong>{a.label}:</strong> {a.value}
                                        </Text>
                                    );
                                })}
                            </div>
                        )}

                        {/* ALLERGENI */}
                        {item.allergens && item.allergens.length > 0 && (
                            <div className={styles.allergenSection}>
                                <Text variant="body-sm" weight={700} className={styles.allergenSectionLabel}>
                                    Allergeni
                                </Text>
                                <div className={styles.allergenBadges}>
                                    {item.allergens.map(a => (
                                        <span key={a.id} className={styles.allergenBadge}>
                                            {a.label_it}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* INGREDIENTI */}
                        {item.ingredients && item.ingredients.length > 0 && (
                            <div className={styles.ingredientSection}>
                                <Text variant="body-sm" weight={700} className={styles.ingredientSectionLabel}>
                                    Ingredienti
                                </Text>
                                <Text variant="body-sm" colorVariant="muted" className={styles.ingredientList}>
                                    {item.ingredients.map(i => i.name).join(", ")}
                                </Text>
                            </div>
                        )}
                    </div>
                </div>
            </ModalLayoutContent>
        </ModalLayout>
    );
}
