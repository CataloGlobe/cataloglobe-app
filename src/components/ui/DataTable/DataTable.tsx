import { CSSProperties, ReactNode, useMemo } from "react";
import styles from "./DataTable.module.scss";

export type ColumnDefinition<T> = {
    id: string;
    header: ReactNode;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    accessor?: (row: T) => any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    cell?: (value: any, row: T) => ReactNode;
    width?: string;
    align?: "left" | "center" | "right";
    sortable?: boolean;
};

type DataTableDensity = "compact" | "extended";

interface DataTableProps<T> {
    data: T[];
    columns: ColumnDefinition<T>[];
    isLoading?: boolean;
    emptyState?: ReactNode;
    pagination?: ReactNode;
    loadingState?: ReactNode;
    density?: DataTableDensity;
    rowClassName?: (row: T, rowIndex: number) => string | undefined;
    onRowClick?: (row: T, rowIndex: number) => void;
}

function getRowKey<T>(row: T, index: number): string | number {
    if (row && typeof row === "object" && "id" in (row as Record<string, unknown>)) {
        const candidate = (row as Record<string, unknown>).id;
        if (typeof candidate === "string" || typeof candidate === "number") {
            return candidate;
        }
    }
    return index;
}

function getAlignClass(align: ColumnDefinition<unknown>["align"]): string {
    if (align === "center") return styles.alignCenter;
    if (align === "right") return styles.alignRight;
    return styles.alignLeft;
}

export function DataTable<T>({
    data,
    columns,
    isLoading = false,
    emptyState,
    pagination,
    loadingState,
    density = "compact",
    rowClassName,
    onRowClick
}: DataTableProps<T>) {
    const gridStyle = useMemo<CSSProperties>(() => {
        const gridTemplateColumns = columns
            .map(column => column.width ?? "minmax(0, 1fr)")
            .join(" ");

        return { gridTemplateColumns };
    }, [columns]);

    const densityRowClass = density === "extended" ? styles.rowExtended : styles.rowCompact;

    const renderState = () => {
        if (isLoading) {
            return <div className={styles.state}>{loadingState ?? "Caricamento..."}</div>;
        }

        if (data.length === 0) {
            return <div className={styles.state}>{emptyState ?? "Nessun risultato."}</div>;
        }

        return data.map((row, rowIndex) => (
            <div
                key={getRowKey(row, rowIndex)}
                className={`${styles.row} ${densityRowClass} ${onRowClick ? styles.rowClickable : ""} ${rowClassName?.(row, rowIndex) ?? ""}`}
                style={gridStyle}
                onClick={event => {
                    if (!onRowClick) return;
                    const target = event.target as HTMLElement | null;
                    if (
                        target?.closest(
                            'button, a, input, select, textarea, [role="menuitem"], [data-row-click-ignore="true"]'
                        )
                    ) {
                        return;
                    }
                    onRowClick(row, rowIndex);
                }}
            >
                {columns.map(column => {
                    const value = column.accessor ? column.accessor(row) : undefined;
                    const content = column.cell ? column.cell(value, row) : (value as ReactNode);

                    return (
                        <div key={column.id} className={`${styles.cell} ${getAlignClass(column.align)}`}>
                            {content ?? null}
                        </div>
                    );
                })}
            </div>
        ));
    };

    return (
        <div className={styles.table}>
            <div className={styles.header} style={gridStyle}>
                {columns.map(column => (
                    <div
                        key={column.id}
                        className={`${styles.headerCell} ${getAlignClass(column.align)} ${
                            column.sortable ? styles.sortable : ""
                        }`}
                    >
                        {column.header}
                    </div>
                ))}
            </div>

            <div className={styles.body}>{renderState()}</div>

            {pagination ? <div className={styles.footer}>{pagination}</div> : null}
        </div>
    );
}
