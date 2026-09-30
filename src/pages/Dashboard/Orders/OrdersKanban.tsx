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
import { AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/Badge/Badge";
import { Button } from "@/components/ui/Button/Button";
import { EmptyState } from "@/components/ui/EmptyState/EmptyState";
import Skeleton from "@/components/ui/Skeleton/Skeleton";
import { Tabs } from "@/components/ui/Tabs/Tabs";
import Text from "@/components/ui/Text/Text";
import OrderCard from "./OrderCard";
import type { V2OrderWithItems, V2Table } from "@/types/orders";
import type { ComandaPrintState } from "./hooks/comandaPrintState";
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
    /**
     * Id ordine → stato di stampa della comanda (`done` | `failed`), solo
     * per ordini con un job terminale. Propagata a `OrderCard` per
     * "Ristampa" / "Comanda non stampata" + "Riprova".
     */
    comandaPrintStates?: Map<string, ComandaPrintState>;
    /** Ristampa/riprova comanda via Sunmi. Propagata a OrderCard. */
    onReprint?: (order: V2OrderWithItems) => Promise<void>;
    /** Link alla sezione stampanti della sede (card "failed"). */
    printersHref?: string;
    isLoading: boolean;
    error: string | null;
    onRetry: () => void;
    onAcknowledge: (order: V2OrderWithItems) => Promise<void>;
    onMarkReady: (order: V2OrderWithItems) => Promise<void>;
    onDeliver: (order: V2OrderWithItems) => Promise<void>;
    onCancel: (order: V2OrderWithItems) => void;
    onCancelItem: (order: V2OrderWithItems) => void;
    onViewDetail: (order: V2OrderWithItems) => void;
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
    comandaPrintStates,
    onReprint,
    printersHref,
    isLoading,
    error,
    onRetry,
    onAcknowledge,
    onMarkReady,
    onDeliver,
    onCancel,
    onCancelItem,
    onViewDetail,
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

    // Sotto 1024 si vede una lista sola, scelta dal selettore di stato (passo 2
    // «375 e 768»). All'apertura: la prima lista non vuota. Dopo resta quella
    // scelta: una comanda nuova non sposta la vista, la annunciano contatore e
    // pulse. Sopra 1024 il valore non conta — le tre colonne sono tutte a vista.
    const [narrowStatus, setNarrowStatus] = useState<ColumnDef["status"] | null>(null);
    useEffect(() => {
        if (narrowStatus !== null || isLoading) return;
        const firstNonEmpty = COLUMNS.find(c => byStatus[c.status].length > 0);
        setNarrowStatus(firstNonEmpty?.status ?? "submitted");
    }, [narrowStatus, isLoading, byStatus]);
    const activeNarrow = narrowStatus ?? "submitted";

    if (error) {
        return (
            <EmptyState
                variant="inline"
                icon={<AlertCircle />}
                title="Non riusciamo a caricare le comande"
                description={error}
                action={
                    <Button variant="secondary" onClick={onRetry}>
                        Riprova
                    </Button>
                }
            />
        );
    }

    return (
        <div className={styles.board} data-narrow-status={activeNarrow}>
            <div className={styles.stateTabs}>
                <Tabs<ColumnDef["status"]> value={activeNarrow} onChange={setNarrowStatus} variant="line">
                    <Tabs.List aria-label="Stato delle comande">
                        {COLUMNS.map(col => {
                            const count = byStatus[col.status].length;
                            return (
                                <Tabs.Tab
                                    key={col.status}
                                    value={col.status}
                                    badge={count}
                                    badgeTone={col.status === "submitted" && count > 0 ? "brand" : "outline"}
                                >
                                    <span
                                        className={
                                            isPulsing && col.status === "submitted" ? styles.pulsing : undefined
                                        }
                                    >
                                        {col.title}
                                    </span>
                                </Tabs.Tab>
                            );
                        })}
                    </Tabs.List>
                </Tabs>
            </div>

            <div className={styles.kanban}>
                {COLUMNS.map(col => {
                    const colOrders = byStatus[col.status];
                    return (
                        <section
                            key={col.status}
                            className={styles.column}
                            data-status={col.status}
                            aria-label={col.title}
                        >
                            <header
                                className={`${styles.columnHeader}${
                                    isPulsing && col.status === "submitted" ? ` ${styles.pulsing}` : ""
                                }`}
                            >
                                <Text as="span" variant="body-sm" weight={600}>
                                    {col.title}
                                </Text>
                                <Badge
                                    variant={col.status === "submitted" && colOrders.length > 0 ? "brand" : "outline"}
                                >
                                    {colOrders.length}
                                </Badge>
                            </header>
                            <div className={styles.columnList}>
                                {isLoading && colOrders.length === 0 ? (
                                    <>
                                        <Skeleton height={160} radius="var(--radius-surface)" />
                                        <Skeleton height={160} radius="var(--radius-surface)" />
                                    </>
                                ) : colOrders.length === 0 ? (
                                    <EmptyState variant="inline" title={col.emptyLabel} />
                                ) : (
                                    colOrders.map(order => {
                                        const table = tables.find(t => t.id === order.table_id);
                                        return (
                                            <OrderCard
                                                key={order.id}
                                                order={order}
                                                tableLabel={table?.label ?? "?"}
                                                tableZone={table?.zone_name ?? null}
                                                operatorNames={operatorNames}
                                                comandaPrintState={comandaPrintStates?.get(order.id) ?? null}
                                                onReprint={onReprint}
                                                printersHref={printersHref}
                                                onAcknowledge={onAcknowledge}
                                                onMarkReady={onMarkReady}
                                                onDeliver={onDeliver}
                                                onCancel={onCancel}
                                                onCancelItem={onCancelItem}
                                                onViewDetail={onViewDetail}
                                                onUnacknowledge={onUnacknowledge}
                                                onUnready={onUnready}
                                                canManage={canManage}
                                                canEdit={canEdit}
                                            />
                                        );
                                    })
                                )}
                            </div>
                        </section>
                    );
                })}
            </div>
        </div>
    );
}
