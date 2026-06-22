import { useRef, useState } from "react";
import {
    AlertCircle,
    Ban,
    Clock,
    MoreVertical,
    Eye,
    Printer,
    Trash2,
    CheckCheck,
    CornerUpLeft,
    User
} from "lucide-react";
import Text from "@/components/ui/Text/Text";
import { Button } from "@/components/ui/Button/Button";
import { IconButton } from "@/components/ui/Button/IconButton";
import { Menu } from "@/components/ui/Menu/Menu";
import { formatRelativeTime } from "@/utils/relativeTime";
import type { V2OrderItem, V2OrderWithItems } from "@/types/orders";
import PrintReceipt from "./PrintReceipt";
import styles from "./OrderCard.module.scss";

interface Props {
    order: V2OrderWithItems;
    onAcknowledge: (order: V2OrderWithItems) => Promise<void>;
    /**
     * Optional. When provided and the order is in `acknowledged`, the
     * primary CTA becomes "Pronto" (mark-order-ready) and the deliver CTA
     * is demoted to a secondary "Servito direttamente" affordance for
     * workflows that skip the explicit ready step. When omitted, the
     * legacy behaviour applies: primary "Consegna" on acknowledged.
     */
    onMarkReady?: (order: V2OrderWithItems) => Promise<void>;
    onDeliver: (order: V2OrderWithItems) => Promise<void>;
    onCancel: (order: V2OrderWithItems) => void;
    /**
     * Annulla articolo (pre-servizio): soft-cancel per-riga via drawer.
     * Disponibile solo su submitted | acknowledged | ready.
     */
    onCancelItem: (order: V2OrderWithItems) => void;
    onViewDetail: (order: V2OrderWithItems) => void;
    onPrint?: (order: V2OrderWithItems) => void;
    /**
     * Optional. Disponibile su status `acknowledged`: "Rimetti in Nuove"
     * (acknowledged → submitted). Quando omesso, la voce e' nascosta.
     */
    onUnacknowledge?: (order: V2OrderWithItems) => Promise<void>;
    /**
     * Optional. Disponibile su status `ready`: "Rimetti in lavorazione"
     * (ready → acknowledged). Quando omesso, la voce e' nascosta.
     */
    onUnready?: (order: V2OrderWithItems) => Promise<void>;
    tableLabel: string;
    tableZone: string | null;
    /**
     * Mappa `user_id → display_name` per risolvere il nome dell'operatore
     * sulla pill "Staff" quando `order.created_by_user_id` e' valorizzato.
     * Lookup mancante → fallback label "Staff" senza nome.
     */
    operatorNames?: Map<string, string>;
    canManage?: boolean;
    canEdit?: boolean;
}

const CURRENCY_FORMATTER = new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR"
});

const ITEMS_PREVIEW_LIMIT = 3;

function formatEur(n: number): string {
    return CURRENCY_FORMATTER.format(n);
}

/**
 * Compone i modifier reali di un item (primary_option + addons).
 * Ritorna null se l'item non ha modifier — il consumer salta la riga
 * corsivo invece di mostrare una stringa vuota.
 */
function formatItemModifiers(item: V2OrderItem): string | null {
    const parts: string[] = [];
    if (item.options_snapshot.primary_option) {
        parts.push(item.options_snapshot.primary_option.value_name);
    }
    for (const addon of item.options_snapshot.addons) {
        parts.push(addon.value_name);
    }
    if (parts.length === 0) return null;
    return parts.join(", ");
}

export default function OrderCard({
    order,
    onAcknowledge,
    onMarkReady,
    onDeliver,
    onCancel,
    onCancelItem,
    onViewDetail,
    onPrint,
    onUnacknowledge,
    onUnready,
    tableLabel,
    tableZone,
    operatorNames,
    canManage,
    canEdit
}: Props) {
    const [isProcessing, setIsProcessing] = useState(false);
    const [itemsExpanded, setItemsExpanded] = useState(false);
    const printRef = useRef<HTMLDivElement>(null);

    function handlePrint() {
        if (onPrint) {
            onPrint(order);
        } else if (printRef.current) {
            // Fallback: self-contained print when no parent handler is wired
            printRef.current.setAttribute("data-printing", "true");
            window.print();
            printRef.current.removeAttribute("data-printing");
        }
    }

    async function runPrimary(action: () => Promise<void>) {
        setIsProcessing(true);
        try {
            await action();
        } finally {
            setIsProcessing(false);
        }
    }

    const items = order.items ?? [];
    const hasOverflow = items.length > ITEMS_PREVIEW_LIMIT;
    const visibleItems = itemsExpanded || !hasOverflow ? items : items.slice(0, ITEMS_PREVIEW_LIMIT);
    const overflowCount = items.length - ITEMS_PREVIEW_LIMIT;

    const trimmedOrderNotes = order.notes?.trim();
    const hasOrderNotes = !!trimmedOrderNotes;

    return (
        <div className={styles.card} data-status={order.status}>
            <div className={styles.header}>
                <div className={styles.tableInfo}>
                    <Text weight={600}>{tableLabel}</Text>
                    {tableZone && (
                        <Text variant="body-sm" colorVariant="muted">
                            {" "}
                            · {tableZone}
                        </Text>
                    )}
                </div>
                <div className={styles.headerRight}>
                    {order.created_by_user_id != null ? (() => {
                        const operatorName = operatorNames?.get(order.created_by_user_id);
                        const titleText = operatorName ?? "Comanda staff";
                        const ariaText = operatorName
                            ? `Comanda inserita da ${operatorName}`
                            : "Comanda inserita dallo staff";
                        return (
                            <span
                                className={styles.attributionStaff}
                                title={titleText}
                                aria-label={ariaText}
                            >
                                <User size={12} aria-hidden />
                            </span>
                        );
                    })() : (
                        <span
                            className={styles.attributionCustomer}
                            title="Comanda cliente"
                            aria-label="Comanda inviata dal cliente"
                        >
                            <User size={12} aria-hidden />
                        </span>
                    )}
                    <span className={styles.timeStamp}>
                        <Clock size={14} />
                        <Text variant="body-sm" colorVariant="muted">
                            {formatRelativeTime(order.submitted_at)}
                        </Text>
                    </span>
                </div>
            </div>

            <div className={styles.items}>
                {visibleItems.map(item => {
                    const modifiers = formatItemModifiers(item);
                    const itemNotes = item.item_notes?.trim();
                    const isCancelled = item.cancelled_at != null;
                    return (
                        <div
                            key={item.id}
                            className={
                                isCancelled
                                    ? `${styles.itemRow} ${styles.itemRowCancelled}`
                                    : styles.itemRow
                            }
                        >
                            <span className={styles.itemQty}>{item.quantity}×</span>
                            <div className={styles.itemBody}>
                                <span className={styles.itemName}>
                                    {item.product_name_snapshot}
                                    {isCancelled && (
                                        <span className={styles.cancelledPill}>
                                            <Ban size={11} aria-hidden />
                                            Annullato
                                        </span>
                                    )}
                                </span>
                                {modifiers && (
                                    <span className={styles.itemModifiers}>{modifiers}</span>
                                )}
                                {itemNotes && (
                                    <span className={styles.itemNotes}>“{itemNotes}”</span>
                                )}
                            </div>
                        </div>
                    );
                })}
                {hasOverflow && (
                    <button
                        type="button"
                        className={styles.expander}
                        onClick={() => setItemsExpanded(prev => !prev)}
                    >
                        {itemsExpanded
                            ? "Mostra meno"
                            : `+${overflowCount} ${overflowCount === 1 ? "piatto" : "piatti"}`}
                    </button>
                )}
            </div>

            {hasOrderNotes && (
                <div className={styles.orderNotes}>
                    <AlertCircle size={14} className={styles.orderNotesIcon} />
                    <Text variant="body-sm">{trimmedOrderNotes}</Text>
                </div>
            )}

            <div className={styles.total}>
                <Text weight={600}>Totale</Text>
                <Text weight={600}>{formatEur(order.total_amount)}</Text>
            </div>

            {canManage !== false && <div className={styles.footer}>
                <Menu
                    align="start"
                    side="top"
                    trigger={
                        <button
                            type="button"
                            className={styles.menuTrigger}
                            aria-label="Altre azioni"
                            disabled={isProcessing}
                        >
                            <MoreVertical size={18} />
                        </button>
                    }
                >
                    {(order.status === "submitted" ||
                        order.status === "acknowledged" ||
                        order.status === "ready") && (
                        <Menu.Item icon={Ban} onSelect={() => onCancelItem(order)}>
                            Annulla articolo
                        </Menu.Item>
                    )}
                    {order.status === "acknowledged" && (
                        <Menu.Item
                            icon={CheckCheck}
                            onSelect={() => void runPrimary(() => onDeliver(order))}
                        >
                            Servito direttamente
                        </Menu.Item>
                    )}
                    {order.status === "acknowledged" && onUnacknowledge && (
                        <Menu.Item
                            icon={CornerUpLeft}
                            onSelect={() => void runPrimary(() => onUnacknowledge(order))}
                        >
                            Rimetti in Nuove
                        </Menu.Item>
                    )}
                    {order.status === "ready" && onUnready && (
                        <Menu.Item
                            icon={CornerUpLeft}
                            onSelect={() => void runPrimary(() => onUnready(order))}
                        >
                            Rimetti in lavorazione
                        </Menu.Item>
                    )}
                    <Menu.Item icon={Eye} onSelect={() => onViewDetail(order)}>
                        Vedi dettaglio
                    </Menu.Item>
                    {order.status !== "cancelled" && (
                        <Menu.Item icon={Printer} onSelect={handlePrint}>
                            Stampa
                        </Menu.Item>
                    )}
                    <Menu.Separator />
                    <Menu.Item
                        icon={Trash2}
                        variant="destructive"
                        onSelect={() => onCancel(order)}
                    >
                        Elimina comanda
                    </Menu.Item>
                </Menu>

                {order.status === "submitted" && (
                    <IconButton
                        icon={<Printer size={16} />}
                        aria-label="Stampa"
                        variant="secondary"
                        className={styles.footerIconBtn}
                        onClick={handlePrint}
                        disabled={isProcessing}
                    />
                )}

                {order.status === "submitted" && (
                    <Button
                        className={`${styles.primaryCta} ${styles.ctaSubmitted}`}
                        variant="primary"
                        onClick={() => void runPrimary(() => onAcknowledge(order))}
                        loading={isProcessing}
                        disabled={canEdit === false || isProcessing}
                    >
                        Conferma
                    </Button>
                )}
                {order.status === "acknowledged" && onMarkReady && (
                    <Button
                        className={`${styles.primaryCta} ${styles.ctaAcknowledged}`}
                        variant="primary"
                        onClick={() => void runPrimary(() => onMarkReady(order))}
                        loading={isProcessing}
                        disabled={canEdit === false || isProcessing}
                    >
                        Pronto
                    </Button>
                )}
                {order.status === "acknowledged" && !onMarkReady && (
                    <Button
                        className={`${styles.primaryCta} ${styles.ctaReady}`}
                        variant="primary"
                        onClick={() => void runPrimary(() => onDeliver(order))}
                        loading={isProcessing}
                        disabled={canEdit === false || isProcessing}
                    >
                        Consegna
                    </Button>
                )}
                {order.status === "ready" && (
                    <Button
                        className={`${styles.primaryCta} ${styles.ctaReady}`}
                        variant="primary"
                        onClick={() => void runPrimary(() => onDeliver(order))}
                        loading={isProcessing}
                        disabled={canEdit === false || isProcessing}
                    >
                        Servita
                    </Button>
                )}
            </div>}

            {/* Fallback receipt for self-contained print (when onPrint is not wired) */}
            {!onPrint && order.status !== "cancelled" && (
                <PrintReceipt
                    ref={printRef}
                    order={order}
                    tableLabel={tableLabel}
                    tableZone={tableZone}
                    operatorNames={operatorNames}
                />
            )}
        </div>
    );
}
