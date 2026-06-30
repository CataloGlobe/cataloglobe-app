import { Eye, Printer, RotateCcw } from "lucide-react";
import type { ColumnDefinition } from "@/components/ui/DataTable/DataTable";
import { TableRowActions } from "@/components/ui/TableRowActions/TableRowActions";
import { StatusBadge } from "@/components/ui/StatusBadge/StatusBadge";
import Text from "@/components/ui/Text/Text";
import { formatRelativeTime } from "@/utils/relativeTime";
import type { V2OrderWithItems, V2Table } from "@/types/orders";
import styles from "./historyColumns.module.scss";

/**
 * Riga dello Storico annotata lato client (Orders.tsx, useMemo di derivazione):
 *   - `rectified` = il padre ha almeno uno storno figlio;
 *   - `netTotal`  = padre.total_amount − Σ(storni figli) — mostrato nella
 *     colonna Totale del padre (netto grande + lordo barrato).
 * Gli storni restano righe `V2OrderWithItems` con `is_rectification=true`,
 * agganciate al padre (`storni`) e rese dalla striscia in Orders.tsx.
 */
export type HistoryRow = V2OrderWithItems & {
    rectified?: boolean;
    netTotal?: number;
};

const CURRENCY_FORMATTER = new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR"
});

function formatEur(n: number): string {
    return CURRENCY_FORMATTER.format(n);
}

interface MakeColumnsOptions {
    tables: V2Table[];
    operatorNames: Map<string, string>;
    onViewDetail: (order: HistoryRow) => void;
    onRestore: (order: HistoryRow) => Promise<void>;
    onPrint: (order: HistoryRow) => void;
    canManage?: boolean;
}

export function makeHistoryColumns({
    tables,
    operatorNames,
    onViewDetail,
    onRestore,
    onPrint,
    canManage
}: MakeColumnsOptions): ColumnDefinition<HistoryRow>[] {
    return [
        {
            id: "status",
            header: "Stato",
            width: "120px",
            accessor: (row) => row.status,
            cell: (_value, row) => {
                // Fallback minimale: le righe storno sono rese dalla striscia
                // (rowWrapper), non da questa cella. Non dovrebbe mai colpire.
                if (row.is_rectification) {
                    return (
                        <Text variant="body-sm" colorVariant="muted">
                            Storno
                        </Text>
                    );
                }
                return (
                    <div className={styles.statusCell}>
                        <StatusBadge
                            variant={row.status === "delivered" ? "success" : "neutral"}
                            label={row.status === "delivered" ? "Servito" : "Annullato"}
                        />
                        {row.rectified && (
                            <span className={styles.rettificatoChip}>Rettificato</span>
                        )}
                    </div>
                );
            }
        },
        {
            id: "table",
            header: "Tavolo",
            accessor: (row) => row.table_id,
            cell: (_value, row) => {
                const table = tables.find(t => t.id === row.table_id);
                const label = table?.label ?? "—";
                const zone = table?.zone_name ?? null;
                return (
                    <div>
                        <Text weight={600}>{label}</Text>
                        {zone && (
                            <Text variant="body-sm" colorVariant="muted">
                                {zone}
                            </Text>
                        )}
                    </div>
                );
            }
        },
        {
            id: "operator",
            header: "Operatore",
            accessor: (row) => row.created_by_user_id,
            cell: (_value, row) => {
                if (row.created_by_user_id != null) {
                    const name = operatorNames.get(row.created_by_user_id) ?? "Staff";
                    return <Text>{name}</Text>;
                }
                const customerName = row.customer_name_snapshot;
                return (
                    <Text colorVariant="muted">
                        {customerName ? `Cliente · ${customerName}` : "Cliente"}
                    </Text>
                );
            }
        },
        {
            id: "time",
            header: "Orario",
            width: "130px",
            accessor: (row) =>
                row.status === "cancelled"
                    ? (row.cancelled_at ?? row.updated_at)
                    : (row.delivered_at ?? row.updated_at),
            cell: (value) => (
                <Text variant="body-sm" colorVariant="muted">
                    {formatRelativeTime(value as string)}
                </Text>
            )
        },
        {
            id: "total",
            header: "Totale",
            width: "100px",
            align: "right",
            accessor: (row) => row.total_amount,
            cell: (_value, row) => {
                // Fallback minimale per le righe storno (rese dalla striscia).
                if (row.is_rectification) {
                    return (
                        <Text variant="body-sm" colorVariant="muted">
                            {formatEur(-row.total_amount)}
                        </Text>
                    );
                }
                // Padre rettificato: netto numero principale + lordo barrato sopra.
                // Robustezza: se netTotal manca o coincide col lordo → singolo numero.
                const showNet =
                    row.rectified &&
                    row.netTotal != null &&
                    row.netTotal !== row.total_amount;
                if (showNet) {
                    return (
                        <div className={styles.totalCell}>
                            <Text
                                variant="body-sm"
                                colorVariant="muted"
                                className={styles.totalGross}
                            >
                                {formatEur(row.total_amount)}
                            </Text>
                            <Text weight={600}>{formatEur(row.netTotal as number)}</Text>
                        </div>
                    );
                }
                return <Text weight={600}>{formatEur(row.total_amount)}</Text>;
            }
        },
        {
            id: "actions",
            header: "",
            width: "56px",
            align: "right" as const,
            cell: (_value, row) => (
                <TableRowActions
                    actions={[
                        {
                            label: "Vedi dettaglio",
                            icon: Eye,
                            onClick: () => onViewDetail(row)
                        },
                        {
                            label: "Ripristina",
                            icon: RotateCcw,
                            onClick: () => void onRestore(row),
                            // Gli storni sono 'delivered' ma non ripristinabili
                            // (contro-ordini terminali): nascondi su is_rectification.
                            hidden:
                                row.status !== "delivered" ||
                                row.is_rectification ||
                                canManage === false
                        },
                        {
                            label: "Stampa",
                            icon: Printer,
                            onClick: () => onPrint(row),
                            separator: true
                        }
                    ]}
                />
            )
        }
    ];
}
