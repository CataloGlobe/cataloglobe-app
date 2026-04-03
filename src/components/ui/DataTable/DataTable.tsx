import { CSSProperties, ReactNode, useEffect, useMemo, useState } from "react";
import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react";
import styles from "./DataTable.module.scss";
import Text from "@/components/ui/Text/Text";
import { BulkBar } from "@/components/ui/BulkBar/BulkBar";

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
const CHECKBOX_COLUMN_WIDTH = "48px";

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
    selectable?: boolean;
    onBulkDelete?: (selectedIds: string[]) => void;
    selectedRowIds?: string[];
    onSelectedRowsChange?: (selectedIds: string[]) => void;
    showSelectionBar?: boolean;
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
    selectable?: boolean;
    isSelected?: boolean;
    onSelect?: (id: string, checked: boolean) => void;
    rowId?: string;
}

function DataTableRow<T>({
    row,
    rowIndex,
    columns,
    gridStyle,
    densityRowClass,
    rowClassName,
    onRowClick,
    dragHandleProps,
    selectable,
    isSelected,
    onSelect,
    rowId
}: DataTableRowProps<T>) {
    return (
        <div
            className={`${styles.row} ${densityRowClass} ${onRowClick ? styles.rowClickable : ""} ${isSelected ? styles.rowSelected : ""} ${rowClassName?.(row, rowIndex) ?? ""}`}
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
            {selectable && (
                <div
                    className={`${styles.cell} ${styles.checkboxCell}`}
                    data-row-click-ignore="true"
                >
                    <input
                        type="checkbox"
                        className={styles.checkbox}
                        checked={isSelected ?? false}
                        onChange={e => onSelect?.(rowId ?? String(rowIndex), e.target.checked)}
                        onClick={e => e.stopPropagation()}
                        aria-label="Seleziona riga"
                    />
                </div>
            )}
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
    rowsPerPage = DEFAULT_ROWS_PER_PAGE,
    selectable = false,
    onBulkDelete,
    selectedRowIds,
    onSelectedRowsChange,
    showSelectionBar = true
}: DataTableProps<T>) {
    const [currentPage, setCurrentPage] = useState(1);
    const [internalSelectedRows, setInternalSelectedRows] = useState<string[]>([]);
    const isSelectionControlled = selectedRowIds !== undefined;
    const selectedRows = isSelectionControlled ? (selectedRowIds ?? []) : internalSelectedRows;

    const setSelectedRows = (updater: (prev: string[]) => string[]) => {
        const nextRows = updater(selectedRows);
        if (!isSelectionControlled) {
            setInternalSelectedRows(nextRows);
        }
        onSelectedRowsChange?.(nextRows);
    };

    useEffect(() => {
        setCurrentPage(1);
        if (!isSelectionControlled) {
            setInternalSelectedRows([]);
        }
    }, [data, isSelectionControlled]);

    // Reset selection when navigating between pages
    useEffect(() => {
        if (!isSelectionControlled) {
            setInternalSelectedRows([]);
        }
    }, [currentPage, isSelectionControlled]);

    const gridStyle = useMemo<CSSProperties>(() => {
        const columnWidths = columns.map(column => column.width ?? "minmax(0, 1fr)");
        const gridTemplateColumns = selectable
            ? `${CHECKBOX_COLUMN_WIDTH} ${columnWidths.join(" ")}`
            : columnWidths.join(" ");

        return { gridTemplateColumns };
    }, [columns, selectable]);

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

    // Compute stable row IDs for the current page to drive selection state
    const displayDataWithIds = useMemo(
        () =>
            displayData.map((row, pageRowIndex) => {
                const rowIndex = useInternalPagination
                    ? (currentPage - 1) * rowsPerPage + pageRowIndex
                    : pageRowIndex;
                return { row, rowIndex, rowId: String(getRowKey(row, rowIndex)) };
            }),
        [displayData, useInternalPagination, currentPage, rowsPerPage]
    );

    const currentPageIds = useMemo(
        () => displayDataWithIds.map(d => d.rowId),
        [displayDataWithIds]
    );

    const allCurrentPageSelected =
        selectable &&
        currentPageIds.length > 0 &&
        currentPageIds.every(id => selectedRows.includes(id));

    const someCurrentPageSelected =
        selectable &&
        !allCurrentPageSelected &&
        currentPageIds.some(id => selectedRows.includes(id));

    const handleSelectRow = (id: string, checked: boolean) => {
        setSelectedRows(prev => {
            if (checked) return prev.includes(id) ? prev : [...prev, id];
            return prev.filter(r => r !== id);
        });
    };

    const handleSelectAll = (checked: boolean) => {
        if (checked) {
            setSelectedRows(prev => {
                const newIds = currentPageIds.filter(id => !prev.includes(id));
                return [...prev, ...newIds];
            });
        } else {
            setSelectedRows(prev => prev.filter(id => !currentPageIds.includes(id)));
        }
    };

    const handleClearSelection = () => setSelectedRows(() => []);

    const handleBulkDelete = () => {
        onBulkDelete?.(selectedRows);
        setSelectedRows(() => []);
    };

    const renderState = () => {
        if (isLoading) {
            return <div className={styles.state}>{loadingState ?? "Caricamento..."}</div>;
        }

        if (data.length === 0) {
            return <div className={styles.state}>{emptyState ?? "Nessun risultato."}</div>;
        }

        return displayDataWithIds.map(({ row, rowIndex, rowId }) => {
            const rowElement = (
                <DataTableRow
                    key={rowId}
                    row={row}
                    rowIndex={rowIndex}
                    columns={columns}
                    gridStyle={gridStyle}
                    densityRowClass={densityRowClass}
                    rowClassName={rowClassName}
                    onRowClick={onRowClick}
                    selectable={selectable}
                    isSelected={selectedRows.includes(rowId)}
                    onSelect={handleSelectRow}
                    rowId={rowId}
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
        <>
            <div className={styles.table}>
                <div className={styles.header} style={gridStyle}>
                    {selectable && (
                        <div className={`${styles.headerCell} ${styles.checkboxCell}`}>
                            <input
                                type="checkbox"
                                className={styles.checkbox}
                                checked={allCurrentPageSelected}
                                ref={el => {
                                    if (el) el.indeterminate = someCurrentPageSelected;
                                }}
                                onChange={e => handleSelectAll(e.target.checked)}
                                aria-label="Seleziona tutte le righe"
                            />
                        </div>
                    )}
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

            {selectable && showSelectionBar && (
                <BulkBar
                    selectedCount={selectedRows.length}
                    onDelete={onBulkDelete ? handleBulkDelete : undefined}
                    onClearSelection={handleClearSelection}
                />
            )}
        </>
    );
}
