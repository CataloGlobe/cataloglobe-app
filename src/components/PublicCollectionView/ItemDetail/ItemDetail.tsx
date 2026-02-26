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
};

export default function ItemDetail({ item, isOpen, onClose }: Props) {
    if (!item) return null;

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
                        {(item.effective_price ?? item.price) != null && (
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

                        {item.description && (
                            <Text
                                variant="body"
                                colorVariant="muted"
                                className={styles.description}
                            >
                                {item.description}
                            </Text>
                        )}

                        {/* OPZIONI PRODOTTO */}
                        {item.optionGroups && item.optionGroups.length > 0 && (
                            <div className={styles.optionsSection}>
                                <Text
                                    variant="body"
                                    weight={700}
                                    style={{ marginTop: 24, marginBottom: 12 }}
                                >
                                    Opzioni disponibili
                                </Text>
                                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                                    {item.optionGroups.map(group => (
                                        <div key={group.id} className={styles.optionGroup}>
                                            <div
                                                style={{
                                                    marginBottom: 8,
                                                    display: "flex",
                                                    alignItems: "center",
                                                    gap: 8
                                                }}
                                            >
                                                <Text variant="body-sm" weight={600}>
                                                    {group.name}
                                                </Text>
                                                {group.isRequired && (
                                                    <span
                                                        style={{
                                                            backgroundColor:
                                                                "var(--color-warning-100)",
                                                            color: "var(--color-warning-700)",
                                                            padding: "2px 6px",
                                                            borderRadius: "4px",
                                                            fontSize: "11px",
                                                            fontWeight: 600
                                                        }}
                                                    >
                                                        Obbligatorio
                                                    </span>
                                                )}
                                                {group.maxSelectable != null && (
                                                    <Text variant="caption" colorVariant="muted">
                                                        Max {group.maxSelectable} selezionabili
                                                    </Text>
                                                )}
                                            </div>
                                            {group.values.length > 0 && (
                                                <ul
                                                    style={{
                                                        listStyle: "none",
                                                        padding: 0,
                                                        margin: 0,
                                                        display: "flex",
                                                        flexDirection: "column",
                                                        gap: 4
                                                    }}
                                                >
                                                    {group.values.map(val => (
                                                        <li
                                                            key={val.id}
                                                            style={{
                                                                display: "flex",
                                                                justifyContent: "space-between",
                                                                alignItems: "center",
                                                                padding: "6px 0",
                                                                borderBottom:
                                                                    "1px solid var(--color-gray-100)"
                                                            }}
                                                        >
                                                            <Text variant="body-sm">
                                                                {val.name}
                                                            </Text>
                                                            {val.priceModifier != null &&
                                                                val.priceModifier !== 0 && (
                                                                    <Text
                                                                        variant="body-sm"
                                                                        colorVariant="muted"
                                                                    >
                                                                        {val.priceModifier > 0
                                                                            ? "+"
                                                                            : ""}
                                                                        {val.priceModifier.toFixed(
                                                                            2
                                                                        )}{" "}
                                                                        €
                                                                    </Text>
                                                                )}
                                                        </li>
                                                    ))}
                                                </ul>
                                            )}
                                        </div>
                                    ))}
                                </div>
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
