import { CSSProperties, ReactNode, useEffect, useMemo, useState } from "react";
import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react";
import styles from "./DataTable.module.scss";
import Text from "@/components/ui/Text/Text";

export type ColumnDefinition<T> = {
    id: string;
    header: ReactNode;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    accessor?: (row: T) => any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    cell?: (value: any, row: T, rowIndex: number, extra?: any) => ReactNode;
    width?: string;
    align?: "left" | "center" | "right";
    sortable?: boolean;
};

type DataTableDensity = "compact" | "extended";

const DEFAULT_ROWS_PER_PAGE = 5;

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
    rowWrapper?: (row: ReactNode, rowData: T, rowIndex: number) => ReactNode;
    rowsPerPage?: number;
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

interface DataTableRowProps<T> {
    row: T;
    rowIndex: number;
    columns: ColumnDefinition<T>[];
    gridStyle: CSSProperties;
    densityRowClass: string;
    rowClassName?: (row: T, rowIndex: number) => string | undefined;
    onRowClick?: (row: T, rowIndex: number) => void;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    dragHandleProps?: any;
}

function DataTableRow<T>({
    row,
    rowIndex,
    columns,
    gridStyle,
    densityRowClass,
    rowClassName,
    onRowClick,
    dragHandleProps
}: DataTableRowProps<T>) {
    return (
        <div
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
                const content = column.cell
                    ? column.cell(value, row, rowIndex, dragHandleProps)
                    : (value as ReactNode);

                return (
                    <div
                        key={column.id}
                        className={`${styles.cell} ${getAlignClass(column.align)}`}
                    >
                        {content ?? null}
                    </div>
                );
            })}
        </div>
    );
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
    onRowClick,
    rowWrapper,
    rowsPerPage = DEFAULT_ROWS_PER_PAGE
}: DataTableProps<T>) {
    const [currentPage, setCurrentPage] = useState(1);

    useEffect(() => {
        setCurrentPage(1);
    }, [data]);

    const gridStyle = useMemo<CSSProperties>(() => {
        const gridTemplateColumns = columns
            .map(column => column.width ?? "minmax(0, 1fr)")
            .join(" ");

        return { gridTemplateColumns };
    }, [columns]);

    const densityRowClass = density === "extended" ? styles.rowExtended : styles.rowCompact;

    // Internal pagination is used only when no external pagination prop is passed.
    const useInternalPagination = !pagination;
    const totalPages = Math.max(1, Math.ceil(data.length / rowsPerPage));
    const showInternalPagination = useInternalPagination && !isLoading && data.length > rowsPerPage;

    const displayData = useMemo(() => {
        if (!useInternalPagination) return data;
        const start = (currentPage - 1) * rowsPerPage;
        return data.slice(start, start + rowsPerPage);
    }, [data, currentPage, rowsPerPage, useInternalPagination]);

    const renderState = () => {
        if (isLoading) {
            return <div className={styles.state}>{loadingState ?? "Caricamento..."}</div>;
        }

        if (data.length === 0) {
            return <div className={styles.state}>{emptyState ?? "Nessun risultato."}</div>;
        }

        return displayData.map((row, pageRowIndex) => {
            // Preserve global row index so rowIndex in cell/rowClassName is consistent
            // regardless of which page is being viewed.
            const rowIndex = useInternalPagination
                ? (currentPage - 1) * rowsPerPage + pageRowIndex
                : pageRowIndex;

            const rowElement = (
                <DataTableRow
                    key={getRowKey(row, rowIndex)}
                    row={row}
                    rowIndex={rowIndex}
                    columns={columns}
                    gridStyle={gridStyle}
                    densityRowClass={densityRowClass}
                    rowClassName={rowClassName}
                    onRowClick={onRowClick}
                />
            );

            return rowWrapper ? rowWrapper(rowElement, row, rowIndex) : rowElement;
        });
    };

    const startRow = (currentPage - 1) * rowsPerPage + 1;
    const endRow = Math.min(currentPage * rowsPerPage, data.length);

    const footerContent =
        pagination ??
        (showInternalPagination ? (
            <div className={styles.pagination}>
                <Text variant="body-sm" colorVariant="muted">
                    {startRow}–{endRow} di {data.length}
                </Text>
                <div className={styles.paginationControls}>
                    <button
                        className={styles.paginationButton}
                        onClick={() => setCurrentPage(p => p - 1)}
                        disabled={currentPage === 1}
                        aria-label="Pagina precedente"
                    >
                        <IconChevronLeft size={16} />
                    </button>
                    <Text variant="body-sm" colorVariant="muted">
                        {currentPage} / {totalPages}
                    </Text>
                    <button
                        className={styles.paginationButton}
                        onClick={() => setCurrentPage(p => p + 1)}
                        disabled={currentPage === totalPages}
                        aria-label="Pagina successiva"
                    >
                        <IconChevronRight size={16} />
                    </button>
                </div>
            </div>
        ) : null);

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

            {footerContent ? <div className={styles.footer}>{footerContent}</div> : null}
        </div>
    );
}
