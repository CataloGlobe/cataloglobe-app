import { Plus, Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import Text from "@/components/ui/Text/Text";
import type { CollectionViewSectionItem } from "../CollectionView/CollectionView";
import styles from "./PairingDetailCard.module.scss";

/** Un abbinamento hydratato (dalla Tranche C). */
export type PairingItem = NonNullable<CollectionViewSectionItem["pairings"]>[number];

interface PairingDetailCardProps {
    pairing: PairingItem;
    /** Mostra la miniatura dell'abbinato. False in stile Compatto (no-image). */
    showThumbnail: boolean;
    /**
     * Se presente, mostra il "+" per aggiungere l'abbinato (contesto upsell D3).
     * Assente → card puro consiglio (uso D2), nessun bottone.
     */
    onAdd?: () => void;
    /** Stato "già in selezione" → il "+" diventa "✓ Aggiunto". */
    isAdded?: boolean;
    /**
     * Abbinato configurabile (ha optionGroups): non si aggiunge diretto. Con
     * `onViewOptions` mostra "Vedi opzioni" al posto del "+" → apre il detail.
     */
    isConfigurable?: boolean;
    onViewOptions?: () => void;
}

/**
 * Card "consiglio" di un abbinamento: nome + prezzo + il "perché" (note).
 * Con `onAdd` diventa azionabile (upsell D3): "+" → "✓ Aggiunto". Senza `onAdd`
 * resta informativa (dettaglio prodotto D2). Nessun placeholder immagine: se
 * `imageUrl` è null la card collassa a nome + perché + prezzo.
 */
export default function PairingDetailCard({
    pairing,
    showThumbnail,
    onAdd,
    isAdded = false,
    isConfigurable = false,
    onViewOptions
}: PairingDetailCardProps) {
    const { t } = useTranslation("public");
    return (
        <div className={styles.card}>
            {showThumbnail && pairing.imageUrl && (
                <img
                    src={pairing.imageUrl}
                    alt=""
                    className={styles.thumb}
                    loading="lazy"
                    decoding="async"
                    width={52}
                    height={52}
                />
            )}

            <div className={styles.body}>
                <div className={styles.headRow}>
                    <Text variant="body-sm" weight={700} className={styles.name} color="var(--pub-surface-text)">
                        {pairing.name}
                    </Text>
                    {typeof pairing.price === "number" && (
                        <Text variant="body-sm" className={styles.price} color="var(--pub-surface-text-secondary)">
                            € {pairing.price.toFixed(2)}
                        </Text>
                    )}
                </div>
                {pairing.note && pairing.note.trim() !== "" && (
                    <Text variant="caption" className={styles.note} color="var(--pub-surface-text-muted)">
                        {pairing.note}
                    </Text>
                )}
            </div>

            {isConfigurable && onViewOptions ? (
                <button type="button" className={styles.optionsBtn} onClick={onViewOptions}>
                    {t("product.pairing_view_options")}
                </button>
            ) : onAdd ? (
                isAdded ? (
                    <span className={styles.addedBadge}>
                        <Check size={14} />
                        {t("product.pairing_added")}
                    </span>
                ) : (
                    <button
                        type="button"
                        className={styles.addBtn}
                        onClick={onAdd}
                        aria-label={t("selection.add_aria")}
                    >
                        <Plus size={16} strokeWidth={2.5} />
                    </button>
                )
            ) : null}
        </div>
    );
}
