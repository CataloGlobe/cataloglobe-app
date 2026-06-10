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

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button/Button";
import Text from "@/components/ui/Text/Text";
import OrderCard from "./OrderCard";
import type { V2OrderWithItems, V2Table } from "@/types/orders";
import styles from "./OrdersKanban.module.scss";

interface Props {
    orders: V2OrderWithItems[];
    tables: V2Table[];
    /**
     * Mappa `user_id → display_name` (owner + active members). Propagata 1:1
     * a OrderCard per risolvere `order.created_by_user_id` nella pill staff.
     * Map vuota = fallback "Staff" generico.
     */
    operatorNames?: Map<string, string>;
    isLoading: boolean;
    error: string | null;
    onRetry: () => void;
    onAcknowledge: (order: V2OrderWithItems) => Promise<void>;
    onMarkReady: (order: V2OrderWithItems) => Promise<void>;
    onDeliver: (order: V2OrderWithItems) => Promise<void>;
    onCancel: (order: V2OrderWithItems) => void;
    onRectify: (order: V2OrderWithItems) => void;
    onViewDetail: (order: V2OrderWithItems) => void;
    onPrint?: (order: V2OrderWithItems) => void;
    onUnacknowledge?: (order: V2OrderWithItems) => Promise<void>;
    onUnready?: (order: V2OrderWithItems) => Promise<void>;
    /**
     * Token monotono: ad ogni incremento la colonna "Nuove" applica
     * un'animazione pulse di ~1.5s sull'header. Cambio del valore =
     * key-like trigger (no flag dedicato da resettare).
     */
    pulseSubmittedToken?: number;
    canManage?: boolean;
    canEdit?: boolean;
}

const PULSE_DURATION_MS = 1500;

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
    operatorNames,
    isLoading,
    error,
    onRetry,
    onAcknowledge,
    onMarkReady,
    onDeliver,
    onCancel,
    onRectify,
    onViewDetail,
    onPrint,
    onUnacknowledge,
    onUnready,
    pulseSubmittedToken,
    canManage,
    canEdit
}: Props) {
    // Pulse header "Nuove" sul cambio di token. Token = 0 (default) NON
    // pulsa al mount. setTimeout cleared on next bump o unmount.
    const [isPulsing, setIsPulsing] = useState(false);
    useEffect(() => {
        if (!pulseSubmittedToken) return;
        setIsPulsing(true);
        const t = window.setTimeout(() => setIsPulsing(false), PULSE_DURATION_MS);
        return () => window.clearTimeout(t);
    }, [pulseSubmittedToken]);
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
                        <div
                            className={`${styles.columnHeader}${
                                isPulsing && col.status === "submitted"
                                    ? ` ${styles.columnHeaderPulsing}`
                                    : ""
                            }`}
                        >
                            <span className={styles.columnTitleGroup}>
                                <span className={styles.columnDot} aria-hidden />
                                <span className={styles.columnTitle}>{col.title}</span>
                            </span>
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
                                            operatorNames={operatorNames}
                                            onAcknowledge={onAcknowledge}
                                            onMarkReady={onMarkReady}
                                            onDeliver={onDeliver}
                                            onCancel={onCancel}
                                            onRectify={onRectify}
                                            onViewDetail={onViewDetail}
                                            onPrint={onPrint}
                                            onUnacknowledge={onUnacknowledge}
                                            onUnready={onUnready}
                                            canManage={canManage}
                                            canEdit={canEdit}
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
