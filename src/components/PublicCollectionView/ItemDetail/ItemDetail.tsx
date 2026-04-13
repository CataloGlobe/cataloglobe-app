import { useEffect, useState } from "react";
import { Package, X } from "lucide-react";
import Text from "@/components/ui/Text/Text";
import AllergenIcon from "@/components/ui/AllergenIcon/AllergenIcon";
import PublicSheet from "../PublicSheet/PublicSheet";
import styles from "./ItemDetail.module.scss";

import type { CollectionViewSectionItem } from "../CollectionView/CollectionView";

type Props = {
    item: CollectionViewSectionItem | null;
    isOpen: boolean;
    onClose: () => void;
    mode: "public" | "preview";
};

export default function ItemDetail({ item, isOpen, onClose, mode }: Props) {
    // displayItem persiste durante l'animazione di chiusura.
    // Quando onClose() viene chiamato, il parent imposta item=null e isOpen=false
    // simultaneamente. Senza questo stato, `if (!item) return null` smonterebbe
    // PublicSheet prima che AnimatePresence possa eseguire l'exit animation.
    const [displayItem, setDisplayItem] = useState(item);
    useEffect(() => {
        if (item) setDisplayItem(item);
    }, [item]);

    if (!displayItem) return null;

    const shouldShowImage = mode === "public" && !!displayItem.image;
    const displayPrice = displayItem.effective_price ?? displayItem.price;

    const primaryPriceGroup = displayItem.optionGroups?.find(
        g => g.group_kind?.toUpperCase() === "PRIMARY_PRICE"
    );
    const nonPrimaryGroups =
        displayItem.optionGroups?.filter(g => g.group_kind?.toUpperCase() !== "PRIMARY_PRICE") ?? [];
    const hasNonPrimaryOptions = nonPrimaryGroups.length > 0;

    return (
        <PublicSheet isOpen={isOpen} onClose={onClose} ariaLabel={displayItem.name}>
            {/* Header */}
            <div className={styles.header}>
                <Text as="h2" variant="title-md" weight={700} className={styles.headerTitle}>
                    {displayItem.name}
                </Text>
                <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Chiudi">
                    <X size={16} strokeWidth={2} />
                    <span>Chiudi</span>
                </button>
            </div>

            {/* Scrollable body */}
            <div className={styles.body}>
                <div className={styles.root}>
                    {/* IMMAGINE */}
                    {shouldShowImage ? (
                        <img
                            src={displayItem.image!}
                            alt={displayItem.name}
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
                        {displayItem.from_price != null ? (
                            <Text variant="body" weight={600} className={styles.price}>
                                {displayItem.original_price != null && (
                                    <span className={styles.priceOriginal}>
                                        da € {displayItem.original_price.toFixed(2)}
                                    </span>
                                )}
                                <span className={styles.priceCurrent}>
                                    da € {displayItem.from_price.toFixed(2)}
                                </span>
                            </Text>
                        ) : displayPrice != null ? (
                            <Text variant="body" weight={600} className={styles.price}>
                                {displayItem.original_price != null && (
                                    <span className={styles.priceOriginal}>
                                        € {displayItem.original_price.toFixed(2)}
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

                        {displayItem.description && (
                            <Text
                                variant="body"
                                colorVariant="muted"
                                className={styles.description}
                            >
                                {displayItem.description}
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
                        {displayItem.attributes && displayItem.attributes.length > 0 && (
                            <div style={{ marginTop: 12 }}>
                                {displayItem.attributes.map((a, idx) => {
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
                        {displayItem.allergens && displayItem.allergens.length > 0 && (
                            <div className={styles.allergenSection}>
                                <Text variant="body-sm" weight={700} className={styles.allergenSectionLabel}>
                                    Allergeni
                                </Text>
                                <div className={styles.allergenBadges}>
                                    {displayItem.allergens.map(a => (
                                        <span key={a.id} className={styles.allergenBadge}>
                                            <AllergenIcon code={a.code} size={14} variant="bare" />
                                            {a.label_it}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* INGREDIENTI */}
                        {displayItem.ingredients && displayItem.ingredients.length > 0 && (
                            <div className={styles.ingredientSection}>
                                <Text variant="body-sm" weight={700} className={styles.ingredientSectionLabel}>
                                    Ingredienti
                                </Text>
                                <Text variant="body-sm" colorVariant="muted" className={styles.ingredientList}>
                                    {displayItem.ingredients.map(i => i.name).join(", ")}
                                </Text>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </PublicSheet>
    );
}
