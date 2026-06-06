import { useState } from "react";
import { Clock } from "lucide-react";
import Text from "@/components/ui/Text/Text";
import { Button } from "@/components/ui/Button/Button";
import { StatusBadge } from "@/components/ui/StatusBadge/StatusBadge";
import type { StatusBadgeVariant } from "@/components/ui/StatusBadge/StatusBadge";
import { formatRelativeTime } from "@/utils/relativeTime";
import type { V2OrderWithItems } from "@/types/orders";
import styles from "./OrderHistoryRow.module.scss";

interface Props {
    order: V2OrderWithItems;
    tableLabel: string;
    tableZone: string | null;
    onRestore: (order: V2OrderWithItems) => Promise<void>;
    onViewDetail: (order: V2OrderWithItems) => void;
}

const CURRENCY_FORMATTER = new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR"
});

function formatEur(n: number): string {
    return CURRENCY_FORMATTER.format(n);
}

function statusInfo(status: V2OrderWithItems["status"]): {
    variant: StatusBadgeVariant;
    label: string;
} {
    if (status === "cancelled") return { variant: "neutral", label: "Annullato" };
    return { variant: "neutral", label: "Servito" };
}

export default function OrderHistoryRow({
    order,
    tableLabel,
    tableZone,
    onRestore,
    onViewDetail
}: Props) {
    const [isRestoring, setIsRestoring] = useState(false);
    const { variant, label } = statusInfo(order.status);

    const exitIso =
        order.status === "cancelled"
            ? order.cancelled_at ?? order.updated_at
            : order.delivered_at ?? order.updated_at;

    async function handleRestore() {
        setIsRestoring(true);
        try {
            await onRestore(order);
        } finally {
            setIsRestoring(false);
        }
    }

    return (
        <div className={styles.row} data-status={order.status}>
            <div className={styles.left}>
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
                {order.customer_name_snapshot && (
                    <Text variant="body-sm" colorVariant="muted">
                        {order.customer_name_snapshot}
                    </Text>
                )}
            </div>

            <div className={styles.center}>
                <div className={styles.timestamp}>
                    <Clock size={14} />
                    <Text variant="body-sm" colorVariant="muted">
                        {formatRelativeTime(exitIso)}
                    </Text>
                </div>
                {order.status === "cancelled" && (
                    <Text variant="body-sm" colorVariant="muted">
                        Motivo: {order.cancellation_reason ?? "—"}
                    </Text>
                )}
            </div>

            <div className={styles.right}>
                <Text weight={600}>{formatEur(order.total_amount)}</Text>
                <div className={styles.actions}>
                    {order.status === "delivered" && (
                        <Button
                            variant="secondary"
                            onClick={handleRestore}
                            loading={isRestoring}
                        >
                            Ripristina
                        </Button>
                    )}
                    <Button
                        variant="secondary"
                        onClick={() => onViewDetail(order)}
                        disabled={isRestoring}
                    >
                        Vedi dettaglio
                    </Button>
                </div>
            </div>
        </div>
    );
}
