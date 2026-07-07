import { Check, Sparkles, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import Text from "@/components/ui/Text/Text";
import PublicSheet from "../PublicSheet/PublicSheet";
import PairingDetailCard, { type PairingItem } from "../PairingDetailCard/PairingDetailCard";
import styles from "./PairingUpsellSheet.module.scss";

/** Abbinato idoneo + flag "configurabile" (calcolato dal prodotto risolto). */
export type UpsellPairing = PairingItem & { isConfigurable: boolean };

interface PairingUpsellSheetProps {
    isOpen: boolean;
    onClose: () => void;
    /** Nome del prodotto principale appena aggiunto. */
    sourceName: string;
    /** Abbinati idonei (già filtrati dai non-in-selezione, congelati all'apertura). */
    pairings: UpsellPairing[];
    /** Aggregato id→qty in selezione: marca "✓ Aggiunto" in tempo reale. */
    selectionMap: Record<string, number>;
    /** Aggiunge un abbinato semplice per id (nessuna ricorsione). */
    onAdd: (pairedProductId: string) => void;
    /** Abbinato configurabile: apre il suo detail per configurarlo. */
    onViewOptions: (pairedProductId: string) => void;
    /** Miniatura abbinato: mostra in Card, nascondi in Compatto. */
    showThumbnail: boolean;
}

/**
 * Interstitial upsell (Flusso A): dopo l'aggiunta del principale, propone gli
 * abbinati idonei con il "+". Puramente additivo — aperto da CollectionView solo
 * se esistono idonei e l'ordinazione è ON.
 */
export default function PairingUpsellSheet({
    isOpen,
    onClose,
    sourceName,
    pairings,
    selectionMap,
    onAdd,
    onViewOptions,
    showThumbnail
}: PairingUpsellSheetProps) {
    const { t } = useTranslation("public");

    return (
        <PublicSheet
            isOpen={isOpen}
            onClose={onClose}
            ariaLabel={t("product.pairing_upsell_aria")}
            headerContent={
                <div className={styles.header}>
                    <div className={styles.headerTitle}>
                        <Sparkles size={18} className={styles.headerIcon} />
                        <Text as="h2" variant="title-md" weight={700} color="var(--pub-surface-text)">
                            {t("product.pairing_prefix")}
                        </Text>
                    </div>
                    <button
                        type="button"
                        className={styles.closeBtn}
                        onClick={onClose}
                        aria-label={t("item_detail.close_aria")}
                    >
                        <X size={16} strokeWidth={2} />
                        <span>{t("selection.close_label")}</span>
                    </button>
                </div>
            }
        >
            <div className={styles.body}>
                <div className={styles.confirmRow}>
                    <span className={styles.confirmIcon} aria-hidden>
                        <Check size={16} strokeWidth={2.5} />
                    </span>
                    <Text variant="body-sm" weight={700} color="var(--pub-surface-text)">
                        {t("product.pairing_upsell_added", { name: sourceName })}
                    </Text>
                </div>
                <Text variant="body-sm" className={styles.subtitle} color="var(--pub-surface-text-muted)">
                    {t("product.pairing_upsell_subtitle")}
                </Text>

                <div className={styles.cards}>
                    {pairings.map(p => (
                        <PairingDetailCard
                            key={p.id}
                            pairing={p}
                            showThumbnail={showThumbnail}
                            isConfigurable={p.isConfigurable}
                            onViewOptions={() => onViewOptions(p.id)}
                            onAdd={() => onAdd(p.id)}
                            isAdded={(selectionMap[p.id] ?? 0) > 0}
                        />
                    ))}
                </div>

                <button type="button" className={styles.continueBtn} onClick={onClose}>
                    {t("product.pairing_upsell_continue")}
                </button>
            </div>
        </PublicSheet>
    );
}
