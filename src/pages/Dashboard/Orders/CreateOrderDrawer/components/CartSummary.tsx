import { Minus, Plus, Trash2 } from "lucide-react";

import Text from "@/components/ui/Text/Text";

import type { SelectionItem } from "../CreateOrderDrawer";

import styles from "./CartSummary.module.scss";

const CURRENCY_FORMATTER = new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR"
});

function formatEur(n: number): string {
    return CURRENCY_FORMATTER.format(n);
}

const ORDER_NOTE_MAX_LEN = 300;

export interface CartSummaryProps {
    items: SelectionItem[];
    total: number;
    orderNote: string;
    onOrderNoteChange: (next: string) => void;
    onUpdateQty: (rowId: string, qty: number) => void;
    onRemove: (rowId: string) => void;
}

export function CartSummary({
    items,
    total,
    orderNote,
    onOrderNoteChange,
    onUpdateQty,
    onRemove
}: CartSummaryProps) {
    return (
        <div className={styles.wrapper}>
            <div className={styles.title}>Carrello</div>

            {items.length === 0 ? (
                <div className={styles.empty}>
                    <Text variant="body-sm" colorVariant="muted">
                        Nessun prodotto aggiunto. Seleziona un prodotto qui sopra.
                    </Text>
                </div>
            ) : (
                <ul className={styles.list}>
                    {items.map(it => {
                        const optionsLabel: string[] = [];
                        if (it.primary_option_label) optionsLabel.push(it.primary_option_label);
                        if (it.addon_labels.length > 0) {
                            optionsLabel.push(...it.addon_labels);
                        }
                        const lineTotal = it.unitPrice * it.qty;
                        return (
                            <li key={it.rowId} className={styles.row}>
                                <div className={styles.rowMain}>
                                    <span className={styles.rowName}>{it.product_name}</span>
                                    {optionsLabel.length > 0 && (
                                        <span className={styles.rowMeta}>
                                            {optionsLabel.join(" · ")}
                                        </span>
                                    )}
                                    {it.item_notes && (
                                        <span className={styles.rowNote}>
                                            “{it.item_notes}”
                                        </span>
                                    )}
                                    <span className={styles.rowMeta}>
                                        {formatEur(it.unitPrice)} cad.
                                    </span>
                                </div>
                                <div className={styles.rowSide}>
                                    <span className={styles.rowTotal}>
                                        {formatEur(lineTotal)}
                                    </span>
                                    <div className={styles.rowControls}>
                                        <button
                                            type="button"
                                            className={styles.qtyButton}
                                            onClick={() => onUpdateQty(it.rowId, it.qty - 1)}
                                            aria-label="Diminuisci"
                                        >
                                            <Minus size={14} />
                                        </button>
                                        <span className={styles.qtyValue}>{it.qty}</span>
                                        <button
                                            type="button"
                                            className={styles.qtyButton}
                                            onClick={() => onUpdateQty(it.rowId, it.qty + 1)}
                                            aria-label="Aumenta"
                                        >
                                            <Plus size={14} />
                                        </button>
                                        <button
                                            type="button"
                                            className={styles.removeButton}
                                            onClick={() => onRemove(it.rowId)}
                                            aria-label="Rimuovi"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                </div>
                            </li>
                        );
                    })}
                </ul>
            )}

            {items.length > 0 && (
                <div className={styles.totalRow}>
                    <span className={styles.totalLabel}>Totale comanda</span>
                    <span className={styles.totalValue}>{formatEur(total)}</span>
                </div>
            )}

            <div className={styles.orderNoteBlock}>
                <div className={styles.title}>Nota comanda</div>
                <textarea
                    value={orderNote}
                    onChange={e =>
                        onOrderNoteChange(e.target.value.slice(0, ORDER_NOTE_MAX_LEN))
                    }
                    placeholder="Es. servire dopo gli antipasti, allergie..."
                    className={styles.orderNoteInput}
                    maxLength={ORDER_NOTE_MAX_LEN}
                    rows={2}
                />
                <div className={styles.orderNoteHint}>
                    {orderNote.length}/{ORDER_NOTE_MAX_LEN}
                </div>
            </div>
        </div>
    );
}
