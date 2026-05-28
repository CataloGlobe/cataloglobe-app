import {
    CSSProperties,
    ReactNode,
    useCallback,
    useEffect,
    useMemo,
    useState
} from "react";
import { IconChevronLeft, IconChevronRight, IconInbox } from "@tabler/icons-react";
import styles from "./DataTable.module.scss";
import Text from "@/components/ui/Text/Text";
import { BulkBar } from "@/components/ui/BulkBar/BulkBar";
import { EmptyState } from "@/components/ui/EmptyState/EmptyState";
import { LoadingState } from "@/components/ui/LoadingState/LoadingState";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CellValue = any;

export type ColumnDefinition<T> = {
    id: string;
    header: ReactNode;
    accessor?: (row: T) => CellValue;
    cell?: (value: CellValue, row: T, rowIndex: number, extra?: CellValue) => ReactNode;
    width?: string;
    align?: "left" | "center" | "right";
};

export type DataTableEmptyState = {
    title: string;
    description?: string;
    action?: ReactNode;
    icon?: ReactNode;
    compact?: boolean;
};

export type DataTableLoadingState = {
    message?: string;
    compact?: boolean;
};

export type DataTablePageSizeOption = number | "all";

interface DataTableProps<T> {
    data: T[];
    columns: ColumnDefinition<T>[];

    isLoading?: boolean;
    emptyState?: DataTableEmptyState;
    loadingState?: DataTableLoadingState;

    maxHeight?: string;

    pageSize?: number;
    pageSizeOptions?: DataTablePageSizeOption[];

    onRowClick?: (row: T, rowIndex: number) => void;

    selectable?: boolean;
    selectedRowIds?: string[];
    onSelectedRowsChange?: (ids: string[]) => void;
    onBulkDelete?: (ids: string[]) => void;
    showSelectionBar?: boolean;

    /** Righe con animazione highlight transitorio (~2s fade amber). */
    highlightedRowIds?: string[];
    /** Righe visivamente attenuate e non interattive (es. in salvataggio, sola lettura). */
    disabledRowIds?: string[];

    getRowId?: (row: T, rowIndex: number) => string;

    rowWrapper?: (row: ReactNode, rowData: T, rowIndex: number) => ReactNode;
}

const DEFAULT_PAGE_SIZE = 25;
const DEFAULT_PAGE_SIZE_OPTIONS: DataTablePageSizeOption[] = [25, 50, 100, "all"];
const DEFAULT_MAX_HEIGHT = "calc(100dvh - 280px)";
const CHECKBOX_COLUMN_WIDTH = "48px";

function defaultGetRowId<T>(row: T, index: number): string {
    if (row && typeof row === "object" && "id" in (row as Record<string, unknown>)) {
        const candidate = (row as Record<string, unknown>).id;
        if (typeof candidate === "string") return candidate;
        if (typeof candidate === "number") return String(candidate);
    }
    return String(index);
}

function getAlignClass(align: ColumnDefinition<unknown>["align"]): string {
    if (align === "center") return styles.alignCenter;
    if (align === "right") return styles.alignRight;
    return styles.alignLeft;
}

function formatPageSizeLabel(option: DataTablePageSizeOption): string {
    return option === "all" ? "Tutti" : String(option);
}

interface DataTableRowProps<T> {
    row: T;
    rowIndex: number;
    rowId: string;
    columns: ColumnDefinition<T>[];
    gridStyle: CSSProperties;
    onRowClick?: (row: T, rowIndex: number) => void;
    selectable?: boolean;
    isSelected?: boolean;
    onSelect?: (id: string, checked: boolean) => void;
    isHighlighted?: boolean;
    isDisabled?: boolean;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    dragHandleProps?: any;
}

function DataTableRow<T>({
    row,
    rowIndex,
    rowId,
    columns,
    gridStyle,
    onRowClick,
    selectable,
    isSelected,
    onSelect,
    isHighlighted,
    isDisabled,
    dragHandleProps
}: DataTableRowProps<T>) {
    const classes = [
        styles.row,
        onRowClick && !isDisabled ? styles.rowClickable : "",
        isSelected ? styles.rowSelected : "",
        isHighlighted ? styles.rowHighlighted : "",
        isDisabled ? styles.rowDisabled : ""
    ]
        .filter(Boolean)
        .join(" ");

    return (
        <div
            className={classes}
            style={gridStyle}
            onClick={event => {
                if (!onRowClick || isDisabled) return;
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
                        onChange={e => onSelect?.(rowId, e.target.checked)}
                        onClick={e => e.stopPropagation()}
                        aria-label="Seleziona riga"
                        disabled={isDisabled}
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
                        className={`${styles.cell} ${getAlignClass(column.align)}${column.id === "actions" ? ` ${styles.cellActions}` : ""}`}
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
    loadingState,
    maxHeight = DEFAULT_MAX_HEIGHT,
    pageSize = DEFAULT_PAGE_SIZE,
    pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,
    onRowClick,
    selectable = false,
    selectedRowIds,
    onSelectedRowsChange,
    onBulkDelete,
    showSelectionBar = true,
    highlightedRowIds,
    disabledRowIds,
    getRowId = defaultGetRowId,
    rowWrapper
}: DataTableProps<T>) {
    const [currentPageSize, setCurrentPageSize] = useState<DataTablePageSizeOption>(pageSize);
    const [currentPage, setCurrentPage] = useState(1);

    // External pageSize prop changes reset internal state
    useEffect(() => {
        setCurrentPageSize(pageSize);
        setCurrentPage(1);
    }, [pageSize]);

    // ─── Selection state ────────────────────────────────────────────────────
    const [internalSelected, setInternalSelected] = useState<string[]>([]);
    const isSelectionControlled = selectedRowIds !== undefined;
    const selected = isSelectionControlled ? (selectedRowIds ?? []) : internalSelected;

    const commitSelected = useCallback(
        (updater: (prev: string[]) => string[]) => {
            const next = updater(selected);
            if (!isSelectionControlled) {
                setInternalSelected(next);
            }
            onSelectedRowsChange?.(next);
        },
        [selected, isSelectionControlled, onSelectedRowsChange]
    );

    // id-aware reset: drop ids that no longer exist in data
    const allCurrentIds = useMemo(
        () => data.map((row, i) => getRowId(row, i)),
        [data, getRowId]
    );

    useEffect(() => {
        if (selected.length === 0) return;
        const existing = new Set(allCurrentIds);
        const filtered = selected.filter(id => existing.has(id));
        if (filtered.length !== selected.length) {
            if (!isSelectionControlled) {
                setInternalSelected(filtered);
            }
            onSelectedRowsChange?.(filtered);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [allCurrentIds.join("|")]);

    // ─── Grid template ──────────────────────────────────────────────────────
    const gridStyle = useMemo<CSSProperties>(() => {
        const widths = columns.map(c => c.width ?? "minmax(0, 1fr)");
        const template = selectable
            ? `${CHECKBOX_COLUMN_WIDTH} ${widths.join(" ")}`
            : widths.join(" ");
        return { gridTemplateColumns: template };
    }, [columns, selectable]);

    // ─── Pagination slicing ─────────────────────────────────────────────────
    const isAllMode = currentPageSize === "all";
    const numericPageSize = typeof currentPageSize === "number" ? currentPageSize : data.length;
    const hasOverflow = !isAllMode && data.length > numericPageSize;
    const totalPages = hasOverflow ? Math.max(1, Math.ceil(data.length / numericPageSize)) : 1;
    const safePage = Math.min(currentPage, totalPages);

    const pageSizeMin: number =
        typeof pageSizeOptions[0] === "number" ? pageSizeOptions[0] : DEFAULT_PAGE_SIZE;

    // Auto-reset currentPageSize to initial when dataset drops at/below threshold
    useEffect(() => {
        if (data.length <= pageSizeMin && currentPageSize !== pageSize) {
            setCurrentPageSize(pageSize);
            setCurrentPage(1);
        }
    }, [data.length, pageSizeMin, pageSize, currentPageSize]);

    const displayData = useMemo(() => {
        if (!hasOverflow) return data;
        const start = (safePage - 1) * numericPageSize;
        return data.slice(start, start + numericPageSize);
    }, [data, hasOverflow, safePage, numericPageSize]);

    const displayWithIds = useMemo(
        () =>
            displayData.map((row, pageRowIndex) => {
                const rowIndex = hasOverflow
                    ? (safePage - 1) * numericPageSize + pageRowIndex
                    : pageRowIndex;
                return { row, rowIndex, rowId: getRowId(row, rowIndex) };
            }),
        [displayData, hasOverflow, safePage, numericPageSize, getRowId]
    );

    const highlightSet = useMemo(
        () => new Set(highlightedRowIds ?? []),
        [highlightedRowIds]
    );
    const disabledSet = useMemo(
        () => new Set(disabledRowIds ?? []),
        [disabledRowIds]
    );
    const selectedSet = useMemo(() => new Set(selected), [selected]);

    // ─── Selection handlers ────────────────────────────────────────────────
    const currentPageIds = useMemo(() => displayWithIds.map(d => d.rowId), [displayWithIds]);

    const allCurrentPageSelected =
        selectable &&
        currentPageIds.length > 0 &&
        currentPageIds.every(id => selectedSet.has(id));
    const someCurrentPageSelected =
        selectable && !allCurrentPageSelected && currentPageIds.some(id => selectedSet.has(id));

    const handleSelectRow = useCallback(
        (id: string, checked: boolean) => {
            commitSelected(prev => {
                if (checked) return prev.includes(id) ? prev : [...prev, id];
                return prev.filter(x => x !== id);
            });
        },
        [commitSelected]
    );

    const handleSelectAll = useCallback(
        (checked: boolean) => {
            if (checked) {
                commitSelected(prev => {
                    const set = new Set(prev);
                    currentPageIds.forEach(id => set.add(id));
                    return Array.from(set);
                });
            } else {
                commitSelected(prev => {
                    const onPage = new Set(currentPageIds);
                    return prev.filter(id => !onPage.has(id));
                });
            }
        },
        [commitSelected, currentPageIds]
    );

    const handleClearSelection = useCallback(() => commitSelected(() => []), [commitSelected]);

    const handleBulkDelete = useCallback(() => {
        onBulkDelete?.(selected);
        commitSelected(() => []);
    }, [onBulkDelete, selected, commitSelected]);

    // ─── Pagination handlers ───────────────────────────────────────────────
    const handlePageSizeChange = useCallback((next: DataTablePageSizeOption) => {
        setCurrentPageSize(next);
        setCurrentPage(1);
    }, []);

    // ─── Rendering helpers ─────────────────────────────────────────────────
    const renderRows = () => {
        if (isLoading) {
            return (
                <div className={styles.state}>
                    <LoadingState
                        message={loadingState?.message}
                        compact={loadingState?.compact}
                    />
                </div>
            );
        }

        if (data.length === 0) {
            return (
                <div className={styles.state}>
                    <EmptyState
                        icon={emptyState?.icon ?? <IconInbox size={40} stroke={1} />}
                        title={emptyState?.title ?? "Nessun risultato"}
                        description={emptyState?.description}
                        action={emptyState?.action}
                        compact={emptyState?.compact}
                    />
                </div>
            );
        }

        return displayWithIds.map(({ row, rowIndex, rowId }) => {
            const element = (
                <DataTableRow
                    key={rowId}
                    row={row}
                    rowIndex={rowIndex}
                    rowId={rowId}
                    columns={columns}
                    gridStyle={gridStyle}
                    onRowClick={onRowClick}
                    selectable={selectable}
                    isSelected={selectedSet.has(rowId)}
                    onSelect={handleSelectRow}
                    isHighlighted={highlightSet.has(rowId)}
                    isDisabled={disabledSet.has(rowId)}
                />
            );
            return rowWrapper ? rowWrapper(element, row, rowIndex) : element;
        });
    };

    // ─── Footer ────────────────────────────────────────────────────────────
    const startRow = hasOverflow ? (safePage - 1) * numericPageSize + 1 : data.length > 0 ? 1 : 0;
    const endRow = hasOverflow ? Math.min(safePage * numericPageSize, data.length) : data.length;

    const renderFooter = () => {
        if (isLoading) return null;

        const showRange = hasOverflow;
        const showControls = hasOverflow && !isAllMode;
        const showDropdown = pageSizeOptions.length > 1 && data.length > pageSizeMin;

        const countLabel = showRange
            ? `${startRow}–${endRow} di ${data.length}`
            : data.length === 1
                ? "1 elemento"
                : `${data.length} elementi`;

        return (
            <div className={styles.footerInner}>
                <Text variant="body-sm" colorVariant="muted">
                    {countLabel}
                </Text>
                {(showDropdown || showControls) && (
                    <div className={styles.footerRight}>
                        {showDropdown && (
                            <label className={styles.pageSizeSelector}>
                                <Text variant="body-sm" colorVariant="muted">
                                    Per pagina
                                </Text>
                                <select
                                    className={styles.pageSizeSelect}
                                    value={String(currentPageSize)}
                                    onChange={e => {
                                        const v = e.target.value;
                                        handlePageSizeChange(v === "all" ? "all" : Number(v));
                                    }}
                                    aria-label="Righe per pagina"
                                >
                                    {pageSizeOptions.map(opt => (
                                        <option key={String(opt)} value={String(opt)}>
                                            {formatPageSizeLabel(opt)}
                                        </option>
                                    ))}
                                </select>
                            </label>
                        )}
                        {showControls && (
                            <div className={styles.paginationControls}>
                                <button
                                    type="button"
                                    className={styles.paginationButton}
                                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                    disabled={safePage === 1}
                                    aria-label="Pagina precedente"
                                >
                                    <IconChevronLeft size={16} />
                                </button>
                                <Text variant="body-sm" colorVariant="muted">
                                    {safePage} / {totalPages}
                                </Text>
                                <button
                                    type="button"
                                    className={styles.paginationButton}
                                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                    disabled={safePage === totalPages}
                                    aria-label="Pagina successiva"
                                >
                                    <IconChevronRight size={16} />
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>
        );
    };

    const containerStyle: CSSProperties = { maxHeight };

    return (
        <>
            <div className={styles.table} style={containerStyle}>
                <div className={styles.scrollArea}>
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
                                className={`${styles.headerCell} ${getAlignClass(column.align)}${column.id === "actions" ? ` ${styles.cellActions}` : ""}`}
                            >
                                {column.header}
                            </div>
                        ))}
                    </div>

                    <div className={styles.body}>{renderRows()}</div>
                </div>

                <div className={styles.footer}>{renderFooter()}</div>
            </div>

            {selectable && showSelectionBar && (
                <BulkBar
                    selectedCount={selected.length}
                    onDelete={onBulkDelete ? handleBulkDelete : undefined}
                    onClearSelection={handleClearSelection}
                />
            )}
        </>
    );
}
