import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { Button } from "@/components/ui/Button/Button";
import Text from "@/components/ui/Text/Text";
import { StatusBadge } from "@/components/ui/StatusBadge/StatusBadge";
import type { StatusBadgeVariant } from "@/components/ui/StatusBadge/StatusBadge";
import type { V2OrderWithItems } from "@/types/orders";
import styles from "./OrderDetailDrawer.module.scss";

interface Props {
    open: boolean;
    order: V2OrderWithItems | null;
    tableLabel: string;
    tableZone: string | null;
    onClose: () => void;
}

const CURRENCY_FORMATTER = new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR"
});

const DATETIME_FORMATTER = new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
});

function formatEur(n: number): string {
    return CURRENCY_FORMATTER.format(n);
}

function formatAbsolute(iso: string): string {
    return DATETIME_FORMATTER.format(new Date(iso));
}

function statusInfo(status: V2OrderWithItems["status"]): {
    variant: StatusBadgeVariant;
    label: string;
} {
    switch (status) {
        case "submitted":
            return { variant: "warning", label: "Da prendere" };
        case "acknowledged":
            return { variant: "success", label: "In corso" };
        case "ready":
            return { variant: "success", label: "Pronto" };
        case "delivered":
            return { variant: "neutral", label: "Consegnato" };
        case "cancelled":
            return { variant: "neutral", label: "Cancellato" };
    }
}

export default function OrderDetailDrawer({
    open,
    order,
    tableLabel,
    tableZone,
    onClose
}: Props) {
    if (!order) {
        return (
            <SystemDrawer open={open} onClose={onClose} width={560}>
                <DrawerLayout
                    header={
                        <Text variant="title-sm" weight={600}>
                            Dettaglio ordine
                        </Text>
                    }
                    footer={
                        <Button variant="secondary" onClick={onClose}>
                            Chiudi
                        </Button>
                    }
                >
                    <div className={styles.empty}>
                        <Text colorVariant="muted">Ordine non disponibile</Text>
                    </div>
                </DrawerLayout>
            </SystemDrawer>
        );
    }

    const { variant: stVariant, label: stLabel } = statusInfo(order.status);

    return (
        <SystemDrawer open={open} onClose={onClose} width={560}>
            <DrawerLayout
                header={
                    <Text variant="title-sm" weight={600}>
                        Dettaglio ordine
                    </Text>
                }
                footer={
                    <Button variant="secondary" onClick={onClose}>
                        Chiudi
                    </Button>
                }
            >
                <div className={styles.content}>
                    <div className={styles.headerInfo}>
                        <StatusBadge variant={stVariant} label={stLabel} />
                        <Text weight={600}>
                            {tableLabel}
                            {tableZone ? ` · ${tableZone}` : ""}
                        </Text>
                    </div>

                    <div className={styles.metaRow}>
                        <Text variant="body-sm" colorVariant="muted">
                            Inviato:
                        </Text>
                        <Text variant="body-sm">
                            {formatAbsolute(order.submitted_at)}
                        </Text>
                    </div>

                    {order.customer_name_snapshot && (
                        <div className={styles.metaRow}>
                            <Text variant="body-sm" colorVariant="muted">
                                Cliente:
                            </Text>
                            <Text variant="body-sm" weight={500}>
                                {order.customer_name_snapshot}
                            </Text>
                        </div>
                    )}

                    {order.is_rectification && (
                        <div className={styles.rectificationBanner}>
                            <Text variant="body-sm" weight={500}>
                                Questa è una rettifica
                            </Text>
                            <Text variant="body-sm" colorVariant="muted">
                                Storno parziale di un ordine precedente
                            </Text>
                        </div>
                    )}

                    <div className={styles.section}>
                        <Text variant="body-sm" weight={600} colorVariant="muted">
                            Articoli
                        </Text>
                        <div className={styles.items}>
                            {(order.items ?? []).map(item => (
                                <div key={item.id} className={styles.itemBlock}>
                                    <div className={styles.itemHeader}>
                                        <Text weight={500}>
                                            <span className={styles.itemQty}>
                                                {item.quantity}x
                                            </span>{" "}
                                            {item.product_name_snapshot}
                                        </Text>
                                        <Text weight={500}>
                                            {formatEur(item.line_total)}
                                        </Text>
                                    </div>

                                    {item.options_snapshot.primary_option && (
                                        <Text variant="body-sm" colorVariant="muted">
                                            {item.options_snapshot.primary_option.group_name}:{" "}
                                            {item.options_snapshot.primary_option.value_name}
                                        </Text>
                                    )}

                                    {item.options_snapshot.addons.length > 0 && (
                                        <div className={styles.addons}>
                                            <Text variant="body-sm" colorVariant="muted">
                                                Aggiunte:
                                            </Text>
                                            <ul>
                                                {item.options_snapshot.addons.map(
                                                    (addon, idx) => (
                                                        <li
                                                            key={`${addon.value_id}-${idx}`}
                                                        >
                                                            <Text variant="body-sm">
                                                                {addon.value_name}
                                                                {addon.price_delta !== 0 && (
                                                                    <span
                                                                        className={
                                                                            styles.priceDelta
                                                                        }
                                                                    >
                                                                        {" "}
                                                                        (
                                                                        {addon.price_delta > 0
                                                                            ? "+"
                                                                            : ""}
                                                                        {formatEur(addon.price_delta)}
                                                                        )
                                                                    </span>
                                                                )}
                                                            </Text>
                                                        </li>
                                                    )
                                                )}
                                            </ul>
                                        </div>
                                    )}

                                    {item.item_notes && (
                                        <div className={styles.itemNotes}>
                                            <Text variant="body-sm" colorVariant="muted">
                                                Note:
                                            </Text>
                                            <Text variant="body-sm">{item.item_notes}</Text>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className={styles.totalRow}>
                        <Text variant="title-sm" weight={600}>
                            Totale
                        </Text>
                        <Text variant="title-sm" weight={600}>
                            {formatEur(order.total_amount)}
                        </Text>
                    </div>

                    {order.notes && (
                        <div className={styles.section}>
                            <Text variant="body-sm" weight={600} colorVariant="muted">
                                Note ordine
                            </Text>
                            <div className={styles.notesBox}>
                                <Text variant="body-sm">{order.notes}</Text>
                            </div>
                        </div>
                    )}

                    <div className={styles.section}>
                        <Text variant="body-sm" weight={600} colorVariant="muted">
                            Storico
                        </Text>
                        <ul className={styles.timeline}>
                            <li>
                                <Text variant="body-sm">
                                    <span className={styles.timelineCheck}>✓</span> Inviato{" "}
                                    <span className={styles.timelineTime}>
                                        {formatAbsolute(order.submitted_at)}
                                    </span>
                                </Text>
                            </li>
                            {order.acknowledged_at && (
                                <li>
                                    <Text variant="body-sm">
                                        <span className={styles.timelineCheck}>✓</span>{" "}
                                        Confermato{" "}
                                        <span className={styles.timelineTime}>
                                            {formatAbsolute(order.acknowledged_at)}
                                        </span>
                                    </Text>
                                </li>
                            )}
                            {order.delivered_at && (
                                <li>
                                    <Text variant="body-sm">
                                        <span className={styles.timelineCheck}>✓</span>{" "}
                                        Consegnato{" "}
                                        <span className={styles.timelineTime}>
                                            {formatAbsolute(order.delivered_at)}
                                        </span>
                                    </Text>
                                </li>
                            )}
                            {order.cancelled_at && (
                                <li>
                                    <Text variant="body-sm">
                                        <span className={styles.timelineCancel}>✕</span>{" "}
                                        Cancellato{" "}
                                        <span className={styles.timelineTime}>
                                            {formatAbsolute(order.cancelled_at)}
                                        </span>
                                        {order.cancelled_by && (
                                            <span className={styles.timelineMeta}>
                                                {" "}
                                                (
                                                {order.cancelled_by === "customer"
                                                    ? "dal cliente"
                                                    : "dallo staff"}
                                                )
                                            </span>
                                        )}
                                    </Text>
                                    {order.cancellation_reason && (
                                        <Text variant="body-sm" colorVariant="muted">
                                            Motivo: {order.cancellation_reason}
                                        </Text>
                                    )}
                                </li>
                            )}
                        </ul>
                    </div>
                </div>
            </DrawerLayout>
        </SystemDrawer>
    );
}
