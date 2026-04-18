import { Minus, Plus, Trash2, X } from "lucide-react";
import Text from "@/components/ui/Text/Text";
import PublicSheet from "../PublicSheet/PublicSheet";
import styles from "./SelectionSheet.module.scss";

export type SelectedFormat = {
    id: string;
    name: string;
    price: number;
};

export type SelectedAddon = {
    id: string;
    groupId: string;
    name: string;
    priceDelta: number;
};

export type SelectionItem = {
    id: string;
    name: string;
    basePrice: number;
    qty: number;
    selectedFormat?: SelectedFormat | null;
    selectedAddons?: SelectedAddon[];
    /** basePrice + sum(addon.priceDelta) — effective unit price */
    unitPrice: number;
};

type Props = {
    isOpen: boolean;
    onClose: () => void;
    items: SelectionItem[];
    onUpdateQty: (index: number, qty: number) => void;
    onRemove: (index: number) => void;
    onClear: () => void;
    onEditItem?: (index: number, item: SelectionItem) => void;
};

function formatPrice(n: number): string {
    return new Intl.NumberFormat("it-IT", {
        style: "currency",
        currency: "EUR",
        minimumFractionDigits: 2
    }).format(n);
}

export default function SelectionSheet({
    isOpen,
    onClose,
    items,
    onUpdateQty,
    onRemove,
    onClear,
    onEditItem
}: Props) {
    const totalCount = items.reduce((s, i) => s + i.qty, 0);
    const totalPrice = items.reduce((s, i) => s + i.unitPrice * i.qty, 0);
    const isEmpty = items.length === 0;

    return (
        <PublicSheet isOpen={isOpen} onClose={onClose} ariaLabel="La mia selezione">
            {/* Header */}
            <div className={styles.header}>
                <div className={styles.headerLeft}>
                    <Text as="h2" variant="title-sm" weight={700} className={styles.headerTitle} color="var(--pub-surface-text)">
                        La mia selezione
                    </Text>
                    {!isEmpty && (
                        <span className={styles.headerCount}>
                            {totalCount} {totalCount === 1 ? "elemento" : "elementi"}
                        </span>
                    )}
                </div>
                <div className={styles.headerActions}>
                    {!isEmpty && (
                        <button type="button" className={styles.clearBtn} onClick={onClear}>
                            Svuota
                        </button>
                    )}
                    <button
                        type="button"
                        className={styles.closeBtn}
                        onClick={onClose}
                        aria-label="Chiudi"
                    >
                        <X size={15} strokeWidth={2} />
                        <span>Chiudi</span>
                    </button>
                </div>
            </div>

            {/* Body */}
            <div className={styles.body}>
                {isEmpty ? (
                    <div className={styles.emptyState}>
                        <span className={styles.emptyIcon}>📋</span>
                        <Text variant="body" weight={600} color="var(--pub-surface-text)">Nessun elemento</Text>
                        <Text variant="body-sm" color="var(--pub-surface-text-muted)">
                            Aggiungi prodotti dal menu
                        </Text>
                    </div>
                ) : (
                    <ul className={styles.list}>
                        {items.map((item, index) => {
                            const hasConfig = !!(
                                item.selectedFormat ||
                                (item.selectedAddons && item.selectedAddons.length > 0)
                            );
                            return (
                            <li key={index} className={styles.listItem}>
                                <div className={styles.itemInfo}>
                                    <span className={styles.itemName}>{item.name}</span>
                                    {(item.selectedFormat || (item.selectedAddons && item.selectedAddons.length > 0)) && (
                                        <span className={styles.itemMeta}>
                                            {item.selectedFormat && <span>{item.selectedFormat.name}</span>}
                                            {item.selectedAddons && item.selectedAddons.length > 0 && (
                                                <span>{item.selectedAddons.map(a => `+ ${a.name}`).join(", ")}</span>
                                            )}
                                            {onEditItem && (
                                                <button
                                                    type="button"
                                                    className={styles.editLink}
                                                    onClick={() => onEditItem(index, item)}
                                                >
                                                    Modifica
                                                </button>
                                            )}
                                        </span>
                                    )}
                                    {item.unitPrice > 0 && (
                                        <span className={styles.itemPrice}>
                                            {formatPrice(item.unitPrice)} cad.
                                        </span>
                                    )}
                                </div>
                                <div className={styles.itemControls}>
                                    <button
                                        type="button"
                                        className={styles.qtyBtn}
                                        onClick={() =>
                                            item.qty === 1
                                                ? onRemove(index)
                                                : onUpdateQty(index, item.qty - 1)
                                        }
                                        aria-label={item.qty === 1 ? "Rimuovi" : "Diminuisci quantità"}
                                    >
                                        {item.qty === 1 ? (
                                            <Trash2 size={13} strokeWidth={2} />
                                        ) : (
                                            <Minus size={13} strokeWidth={2} />
                                        )}
                                    </button>
                                    <span className={styles.qtyValue}>{item.qty}</span>
                                    <button
                                        type="button"
                                        className={styles.qtyBtn}
                                        onClick={() => onUpdateQty(index, item.qty + 1)}
                                        aria-label="Aumenta quantità"
                                    >
                                        <Plus size={13} strokeWidth={2} />
                                    </button>
                                </div>
                            </li>
                            );
                        })}
                    </ul>
                )}
            </div>

            {/* Footer fisso — solo quando non vuoto */}
            {!isEmpty && (
                <div className={styles.footer}>
                    <span className={styles.footerLabel}>Totale stimato</span>
                    <span className={styles.footerTotal}>{formatPrice(totalPrice)}</span>
                </div>
            )}
        </PublicSheet>
    );
}
