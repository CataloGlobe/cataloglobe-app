import type { KeyboardEvent } from "react";
import { Plus, Check, ChevronRight } from "lucide-react";
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
    /**
     * Tap sull'intera card apre il dettaglio dell'abbinato (uso D2, dentro
     * ItemDetail — universale, convive con `onAdd`). Nessun bottone visivo
     * aggiunto per la navigazione — lo stile a card con bordo comunica già
     * interattività. Il "+" di `onAdd`, quando presente insieme a questo,
     * resta un bottone reale annidato con `stopPropagation` (azione separata,
     * non naviga).
     */
    onOpenPairing?: () => void;
}

/**
 * Card "consiglio" di un abbinamento: nome + prezzo + il "perché" (note).
 * `onOpenPairing` (se presente) rende l'intera card cliccabile → naviga al
 * dettaglio abbinato. `onAdd` (se presente insieme, D2 con ordinazioni ON e
 * abbinato non configurabile) aggiunge un "+" annidato, azione indipendente
 * dal tap-to-navigate (stopPropagation mouse + tastiera). Upsell D3 (nessun
 * `onOpenPairing`): solo azione, "+" → "✓ Aggiunto" o "Vedi opzioni" via
 * `isConfigurable`/`onViewOptions`. Nessun placeholder immagine: se
 * `imageUrl` è null la card collassa a nome + perché + prezzo.
 */
export default function PairingDetailCard({
    pairing,
    showThumbnail,
    onAdd,
    isAdded = false,
    isConfigurable = false,
    onViewOptions,
    onOpenPairing
}: PairingDetailCardProps) {
    const { t } = useTranslation("public");
    return (
        <div
            className={onOpenPairing ? `${styles.card} ${styles.cardClickable}` : styles.card}
            {...(onOpenPairing
                ? {
                      role: "button",
                      tabIndex: 0,
                      onClick: onOpenPairing,
                      onKeyDown: (e: KeyboardEvent) => {
                          // Ignora keydown "bollati" fino qui da figli (es. il "+"
                          // annidato) — solo il div stesso, a fuoco diretto, naviga.
                          if (e.target !== e.currentTarget) return;
                          if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              onOpenPairing();
                          }
                      }
                  }
                : {})}
        >
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
                        onClick={e => {
                            // stopPropagation: la card sottostante può avere
                            // onOpenPairing sullo stesso div — il "+" è un'azione
                            // indipendente, non deve anche far navigare.
                            e.stopPropagation();
                            onAdd();
                        }}
                        aria-label={t("selection.add_aria")}
                    >
                        <Plus size={16} strokeWidth={2.5} />
                    </button>
                )
            ) : isConfigurable && onOpenPairing ? (
                // Solo visivo: nessun onClick proprio, stesso hit-target del
                // tap-to-navigate sul div card. Simmetria col "+" degli
                // abbinati semplici — altrimenti i configurabili sembrano
                // non interattivi (nessun elemento a destra).
                <ChevronRight
                    size={18}
                    strokeWidth={2}
                    className={styles.configureHint}
                    aria-hidden="true"
                />
            ) : null}
        </div>
    );
}
