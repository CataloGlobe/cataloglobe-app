/**
 * OrdersKanban — 3-column live board for the "Comande" tab.
 *
 * Columns map to the active order states surfaced by `useActiveOrdersRealtime`:
 *   - Nuove          (status = "submitted")
 *   - In lavorazione (status = "acknowledged")
 *   - Pronte         (status = "ready")
 *
 * Orders that transition to `delivered` or `cancelled` disappear from the
 * board automatically: the hook drops them on the realtime UPDATE event
 * and notifies the parent via `onOrderLeftBoard` so it can refresh KPIs.
 *
 * Inter-column actions are wired through the existing `OrderCard` action
 * surface; this component supplies a per-card filter (search + tableId)
 * before splitting orders by status.
 */

import { useMemo } from "react";
import { Button } from "@/components/ui/Button/Button";
import Text from "@/components/ui/Text/Text";
import OrderCard from "./OrderCard";
import type { V2OrderWithItems, V2Table } from "@/types/orders";
import styles from "./OrdersKanban.module.scss";

interface Props {
    orders: V2OrderWithItems[];
    tables: V2Table[];
    isLoading: boolean;
    error: string | null;
    onRetry: () => void;
    onAcknowledge: (order: V2OrderWithItems) => Promise<void>;
    onMarkReady: (order: V2OrderWithItems) => Promise<void>;
    onDeliver: (order: V2OrderWithItems) => Promise<void>;
    onCancel: (order: V2OrderWithItems) => void;
    onRectify: (order: V2OrderWithItems) => void;
    onViewDetail: (order: V2OrderWithItems) => void;
}

interface ColumnDef {
    status: "submitted" | "acknowledged" | "ready";
    title: string;
    emptyLabel: string;
}

const COLUMNS: ColumnDef[] = [
    { status: "submitted", title: "Nuove", emptyLabel: "Nessuna nuova comanda" },
    {
        status: "acknowledged",
        title: "In lavorazione",
        emptyLabel: "Nessuna comanda in lavorazione"
    },
    { status: "ready", title: "Pronte", emptyLabel: "Nessuna comanda pronta" }
];

export default function OrdersKanban({
    orders,
    tables,
    isLoading,
    error,
    onRetry,
    onAcknowledge,
    onMarkReady,
    onDeliver,
    onCancel,
    onRectify,
    onViewDetail
}: Props) {
    const byStatus = useMemo(() => {
        const map: Record<ColumnDef["status"], V2OrderWithItems[]> = {
            submitted: [],
            acknowledged: [],
            ready: []
        };
        for (const o of orders) {
            if (
                o.status === "submitted" ||
                o.status === "acknowledged" ||
                o.status === "ready"
            ) {
                map[o.status].push(o);
            }
        }
        // Newest first within each column.
        for (const status of Object.keys(map) as ColumnDef["status"][]) {
            map[status].sort(
                (a, b) =>
                    new Date(b.submitted_at).getTime() -
                    new Date(a.submitted_at).getTime()
            );
        }
        return map;
    }, [orders]);

    if (error) {
        return (
            <div className={styles.errorBanner}>
                <Text variant="body-sm">{error}</Text>
                <Button variant="secondary" onClick={onRetry}>
                    Riprova
                </Button>
            </div>
        );
    }

    return (
        <div className={styles.kanban}>
            {COLUMNS.map(col => {
                const colOrders = byStatus[col.status];
                return (
                    <div
                        key={col.status}
                        className={styles.column}
                        data-status={col.status}
                    >
                        <div className={styles.columnHeader}>
                            <span className={styles.columnTitle}>{col.title}</span>
                            <span className={styles.columnCount}>{colOrders.length}</span>
                        </div>
                        <div className={styles.columnList}>
                            {isLoading && colOrders.length === 0 ? (
                                <>
                                    <div className={styles.skeleton} />
                                    <div className={styles.skeleton} />
                                </>
                            ) : colOrders.length === 0 ? (
                                <div className={styles.emptyColumn}>{col.emptyLabel}</div>
                            ) : (
                                colOrders.map(order => {
                                    const table = tables.find(
                                        t => t.id === order.table_id
                                    );
                                    return (
                                        <OrderCard
                                            key={order.id}
                                            order={order}
                                            tableLabel={table?.label ?? "?"}
                                            tableZone={table?.zone_name ?? null}
                                            onAcknowledge={onAcknowledge}
                                            onMarkReady={onMarkReady}
                                            onDeliver={onDeliver}
                                            onCancel={onCancel}
                                            onRectify={onRectify}
                                            onViewDetail={onViewDetail}
                                        />
                                    );
                                })
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
