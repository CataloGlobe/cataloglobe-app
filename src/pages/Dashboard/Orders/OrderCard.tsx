import { useState } from "react";
import { Clock } from "lucide-react";
import Text from "@/components/ui/Text/Text";
import { Button } from "@/components/ui/Button/Button";
import { StatusBadge } from "@/components/ui/StatusBadge/StatusBadge";
import type { StatusBadgeVariant } from "@/components/ui/StatusBadge/StatusBadge";
import { formatRelativeTime } from "@/utils/relativeTime";
import type { V2OrderWithItems } from "@/types/orders";
import styles from "./OrderCard.module.scss";

interface Props {
    order: V2OrderWithItems;
    onAcknowledge: (order: V2OrderWithItems) => Promise<void>;
    onDeliver: (order: V2OrderWithItems) => Promise<void>;
    onCancel: (order: V2OrderWithItems) => void;
    onRectify: (order: V2OrderWithItems) => void;
    onViewDetail: (order: V2OrderWithItems) => void;
    tableLabel: string;
    tableZone: string | null;
}

const CURRENCY_FORMATTER = new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR"
});

function formatEur(n: number): string {
    return CURRENCY_FORMATTER.format(n);
}

function statusVariantAndLabel(status: V2OrderWithItems["status"]): {
    variant: StatusBadgeVariant;
    label: string;
} {
    switch (status) {
        case "submitted":
            return { variant: "warning", label: "Da prendere" };
        case "acknowledged":
            return { variant: "success", label: "In corso" };
        case "ready":
            // TODO Step 4: visual refinement (dedicated variant). Provisional reuse of "success".
            return { variant: "success", label: "Pronto" };
        case "delivered":
            return { variant: "neutral", label: "Consegnato" };
        case "cancelled":
            return { variant: "neutral", label: "Cancellato" };
    }
}

export default function OrderCard({
    order,
    onAcknowledge,
    onDeliver,
    onCancel,
    onRectify,
    onViewDetail,
    tableLabel,
    tableZone
}: Props) {
    const [isProcessing, setIsProcessing] = useState(false);

    async function handleAck() {
        setIsProcessing(true);
        try {
            await onAcknowledge(order);
        } finally {
            setIsProcessing(false);
        }
    }

    async function handleDel() {
        setIsProcessing(true);
        try {
            await onDeliver(order);
        } finally {
            setIsProcessing(false);
        }
    }

    const { variant, label } = statusVariantAndLabel(order.status);

    return (
        <div className={styles.card} data-status={order.status}>
            <div className={styles.header}>
                <StatusBadge variant={variant} label={label} />
                <div className={styles.tableInfo}>
                    <Text weight={600}>{tableLabel}</Text>
                    {tableZone && (
                        <Text variant="body-sm" colorVariant="muted">
                            {" "}
                            · {tableZone}
                        </Text>
                    )}
                </div>
                <div className={styles.timeStamp}>
                    <Clock size={14} />
                    <Text variant="body-sm" colorVariant="muted">
                        {formatRelativeTime(order.submitted_at)}
                    </Text>
                </div>
            </div>

            {order.customer_name_snapshot && (
                <div className={styles.customer}>
                    <Text variant="body-sm" colorVariant="muted">
                        Cliente:
                    </Text>
                    <Text weight={500}>{order.customer_name_snapshot}</Text>
                </div>
            )}

            <div className={styles.items}>
                {(order.items ?? []).map(item => (
                    <div key={item.id} className={styles.itemRow}>
                        <span className={styles.itemQty}>{item.quantity}x</span>
                        <span className={styles.itemName}>
                            {item.product_name_snapshot}
                            {item.options_snapshot.primary_option && (
                                <Text variant="body-sm" colorVariant="muted">
                                    {" "}
                                    ({item.options_snapshot.primary_option.value_name})
                                </Text>
                            )}
                        </span>
                        <span className={styles.itemPrice}>
                            {formatEur(item.line_total)}
                        </span>
                    </div>
                ))}
            </div>

            {order.notes && (
                <div className={styles.notes}>
                    <Text variant="body-sm" colorVariant="muted">
                        Note:
                    </Text>
                    <Text variant="body-sm">{order.notes}</Text>
                </div>
            )}

            <div className={styles.total}>
                <Text weight={600}>Totale</Text>
                <Text weight={600}>{formatEur(order.total_amount)}</Text>
            </div>

            <div className={styles.actions}>
                <div className={styles.actionsLeft}>
                    {order.status === "submitted" && (
                        <>
                            <Button
                                variant="primary"
                                onClick={handleAck}
                                loading={isProcessing}
                            >
                                Conferma
                            </Button>
                            <Button
                                variant="secondary"
                                onClick={() => onCancel(order)}
                                disabled={isProcessing}
                            >
                                Cancella
                            </Button>
                        </>
                    )}
                    {order.status === "acknowledged" && (
                        <>
                            <Button
                                variant="primary"
                                onClick={handleDel}
                                loading={isProcessing}
                            >
                                Consegna
                            </Button>
                            <Button
                                variant="secondary"
                                onClick={() => onCancel(order)}
                                disabled={isProcessing}
                            >
                                Cancella
                            </Button>
                        </>
                    )}
                    {order.status === "delivered" && !order.is_rectification && (
                        <Button
                            variant="secondary"
                            onClick={() => onRectify(order)}
                        >
                            Rettifica
                        </Button>
                    )}
                </div>
                <Button variant="secondary" onClick={() => onViewDetail(order)}>
                    Vedi dettaglio
                </Button>
            </div>
        </div>
    );
}
