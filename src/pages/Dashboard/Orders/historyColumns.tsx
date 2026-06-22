import { Edit3, Eye, Printer, RotateCcw } from "lucide-react";
import type { ColumnDefinition } from "@/components/ui/DataTable/DataTable";
import { TableRowActions } from "@/components/ui/TableRowActions/TableRowActions";
import { StatusBadge } from "@/components/ui/StatusBadge/StatusBadge";
import Text from "@/components/ui/Text/Text";
import { formatRelativeTime } from "@/utils/relativeTime";
import type { V2OrderWithItems, V2Table } from "@/types/orders";

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
    onViewDetail: (order: V2OrderWithItems) => void;
    onRestore: (order: V2OrderWithItems) => Promise<void>;
    onRectify: (order: V2OrderWithItems) => void;
    onPrint: (order: V2OrderWithItems) => void;
    canManage?: boolean;
}

export function makeHistoryColumns({
    tables,
    operatorNames,
    onViewDetail,
    onRestore,
    onRectify,
    onPrint,
    canManage
}: MakeColumnsOptions): ColumnDefinition<V2OrderWithItems>[] {
    return [
        {
            id: "status",
            header: "Stato",
            width: "120px",
            accessor: (row) => row.status,
            cell: (_value, row) => (
                <StatusBadge
                    variant={row.status === "delivered" ? "success" : "neutral"}
                    label={row.status === "delivered" ? "Servito" : "Annullato"}
                />
            )
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
            cell: (value) => <Text weight={600}>{formatEur(value as number)}</Text>
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
                            hidden: row.status !== "delivered" || canManage === false
                        },
                        {
                            label: "Rettifica",
                            icon: Edit3,
                            onClick: () => onRectify(row),
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
