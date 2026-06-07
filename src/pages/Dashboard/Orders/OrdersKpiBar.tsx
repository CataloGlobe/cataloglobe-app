import { useMemo } from "react";

import Text from "@/components/ui/Text/Text";
import type { V2Order, V2TableWithState } from "@/types/orders";
import { deriveTableStatus } from "@/utils/tableState";

import styles from "./OrdersKpiBar.module.scss";

export interface OrdersKpiBarProps {
    tables: V2TableWithState[];
    ordersTodayCount: number;
    ordersServedToday: V2Order[];
}

function formatAvgMinutes(orders: V2Order[]): string {
    if (orders.length === 0) return "—";
    const valid = orders.filter(o => o.delivered_at && o.submitted_at);
    if (valid.length === 0) return "—";
    const totalMs = valid.reduce((acc, o) => {
        const sub = new Date(o.submitted_at).getTime();
        const del = new Date(o.delivered_at!).getTime();
        return acc + Math.max(0, del - sub);
    }, 0);
    const avgMin = totalMs / valid.length / 60_000;
    return `${avgMin.toFixed(1)} min`;
}

export function OrdersKpiBar({
    tables,
    ordersTodayCount,
    ordersServedToday
}: OrdersKpiBarProps) {
    const tablesOpen = useMemo(
        () => tables.filter(t => deriveTableStatus(t) === "occupied").length,
        [tables]
    );
    const tablesPending = useMemo(
        () => tables.reduce((acc, t) => acc + t.pending_orders_count, 0),
        [tables]
    );
    const avgTime = useMemo(
        () => formatAvgMinutes(ordersServedToday),
        [ordersServedToday]
    );
    const servedCount = ordersServedToday.length;

    return (
        <div className={styles.bar}>
            <div className={styles.card}>
                <Text variant="caption" className={styles.label}>
                    Tavoli aperti
                </Text>
                <Text variant="title-md" weight={700} className={styles.value}>
                    {tablesOpen}
                </Text>
                <Text variant="body-sm" colorVariant="muted" className={styles.caption}>
                    {tables.length} totali
                </Text>
            </div>

            <div className={styles.card}>
                <Text variant="caption" className={styles.label}>
                    Comande oggi
                </Text>
                <Text variant="title-md" weight={700} className={styles.value}>
                    {ordersTodayCount}
                </Text>
                <Text variant="body-sm" colorVariant="muted" className={styles.caption}>
                    {tablesPending > 0
                        ? `${tablesPending} ${tablesPending === 1 ? "in attesa" : "in attesa"}`
                        : "tutte gestite"}
                </Text>
            </div>

            <div className={styles.card}>
                <Text variant="caption" className={styles.label}>
                    Tempo medio
                </Text>
                <Text variant="title-md" weight={700} className={styles.value}>
                    {avgTime}
                </Text>
                <Text variant="body-sm" colorVariant="muted" className={styles.caption}>
                    consegne oggi
                </Text>
            </div>

            <div className={styles.card}>
                <Text variant="caption" className={styles.label}>
                    Servite oggi
                </Text>
                <Text variant="title-md" weight={700} className={styles.value}>
                    {servedCount}
                </Text>
                <Text variant="body-sm" colorVariant="muted" className={styles.caption}>
                    consegnate
                </Text>
            </div>
        </div>
    );
}
