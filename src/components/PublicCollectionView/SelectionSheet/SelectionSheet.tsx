import { Minus, Plus, Trash2, X } from "lucide-react";
import Text from "@/components/ui/Text/Text";
import PublicSheet from "../PublicSheet/PublicSheet";
import styles from "./SelectionSheet.module.scss";

export type SelectionItem = {
    id: string;
    name: string;
    price: number;
    qty: number;
};

type Props = {
    isOpen: boolean;
    onClose: () => void;
    items: SelectionItem[];
    onUpdateQty: (id: string, qty: number) => void;
    onRemove: (id: string) => void;
    onClear: () => void;
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
    onClear
}: Props) {
    const totalCount = items.reduce((s, i) => s + i.qty, 0);
    const totalPrice = items.reduce((s, i) => s + i.price * i.qty, 0);
    const isEmpty = items.length === 0;

    return (
        <PublicSheet isOpen={isOpen} onClose={onClose} ariaLabel="La mia selezione">
            {/* Header */}
            <div className={styles.header}>
                <div className={styles.headerLeft}>
                    <Text as="h2" variant="title-sm" weight={700} className={styles.headerTitle}>
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
                        <Text variant="body" weight={600}>Nessun elemento</Text>
                        <Text variant="body-sm" colorVariant="muted">
                            Aggiungi prodotti dal menu
                        </Text>
                    </div>
                ) : (
                    <ul className={styles.list}>
                        {items.map(item => (
                            <li key={item.id} className={styles.listItem}>
                                <div className={styles.itemInfo}>
                                    <span className={styles.itemName}>{item.name}</span>
                                    {item.price > 0 && (
                                        <span className={styles.itemPrice}>
                                            {formatPrice(item.price)} cad.
                                        </span>
                                    )}
                                </div>
                                <div className={styles.itemControls}>
                                    <button
                                        type="button"
                                        className={styles.qtyBtn}
                                        onClick={() =>
                                            item.qty === 1
                                                ? onRemove(item.id)
                                                : onUpdateQty(item.id, item.qty - 1)
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
                                        onClick={() => onUpdateQty(item.id, item.qty + 1)}
                                        aria-label="Aumenta quantità"
                                    >
                                        <Plus size={13} strokeWidth={2} />
                                    </button>
                                </div>
                            </li>
                        ))}
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
