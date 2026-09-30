import {
    CSSProperties,
    ReactNode,
    isValidElement,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState
} from "react";
import { IconChevronLeft, IconChevronRight, IconInbox } from "@tabler/icons-react";
import styles from "./DataTable.module.scss";
import Text from "@/components/ui/Text/Text";
import Skeleton from "@/components/ui/Skeleton/Skeleton";
import { BulkBar } from "@/components/ui/BulkBar/BulkBar";
import { EmptyState } from "@/components/ui/EmptyState/EmptyState";
import { TableRowActions } from "@/components/ui/TableRowActions/TableRowActions";
import { useAutoPageSize } from "./useAutoPageSize";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import {
    resolveNumericPageSize,
    withAutoOption,
    type PageSizeSelection
} from "./autoPageSize";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CellValue = any;

export type ColumnDefinition<T> = {
    id: string;
    header: ReactNode;
    accessor?: (row: T) => CellValue;
    cell?: (value: CellValue, row: T, rowIndex: number, extra?: CellValue) => ReactNode;
    width?: string;
    align?: "left" | "center" | "right";
    /** Sotto 768 la colonna sparisce: su telefono restano due colonne più
     *  le azioni (scheda «DataTable»). La colonna azioni non si nasconde mai. */
    hideOnPhone?: boolean;
};

export type DataTableEmptyState = {
    title: string;
    description?: string;
    action?: ReactNode;
    icon?: ReactNode;
    /** @deprecated Il vuoto della tabella è sempre `EmptyState inline`: ignorato. */
    compact?: boolean;
};

/**
 * @deprecated Il caricamento è sempre a righe Skeleton (scheda «DataTable»):
 * `message` e `compact` sono ignorati. La prop resta per compatibilità e si
 * rimuove nel lotto 6.
 */
export type DataTableLoadingState = {
    message?: string;
    compact?: boolean;
};

export type DataTablePageSizeOption = PageSizeSelection; // number | "all" | "auto"

/**
 * Classi esportate per i consumer, così la pagina non dichiara font-size:
 * `cellTwoLine` = cella a due righe (titolo 14/500 + caption muta), da
 * mettere su un wrapper con due figli. `cellTwoLineWrap`, insieme alla prima:
 * la seconda riga va a capo invece di troncarsi (telefono, dove la colonna è
 * una sola e la riga deve dire tutto).
 */
export const DATA_TABLE_CLASSES = {
    cellTwoLine: styles.cellTwoLine,
    cellTwoLineWrap: styles.cellTwoLineWrap
} as const;

/** Colonna che rende `TableRowActions`: la tabella la mette ultima, a destra. */
const ACTIONS_COLUMN_ID = "actions";
const SKELETON_ROWS = 5;
const SKELETON_WIDTHS = ["60%", "40%", "50%", "70%"];

interface DataTableProps<T> {
    data: T[];
    columns: ColumnDefinition<T>[];

    isLoading?: boolean;
    emptyState?: DataTableEmptyState;
    /** @deprecated Ignorata: il caricamento rende righe Skeleton. */
    loadingState?: DataTableLoadingState;
    /**
     * La lista esiste ma un filtro attivo non trova nulla: il vuoto diventa
     * `EmptyState filtered` («Nessun risultato» + «Azzera filtri» se c'è
     * `onClearFilters`) invece del vuoto di creazione.
     */
    isFiltered?: boolean;
    onClearFilters?: () => void;

    maxHeight?: string;

    /** Override manuale iniziale. Se omesso, il pageSize è calcolato
     *  automaticamente dallo spazio disponibile (mode "auto"). */
    pageSize?: number;
    pageSizeOptions?: DataTablePageSizeOption[];

    onRowClick?: (row: T, rowIndex: number) => void;

    selectable?: boolean;
    /** Per-row gating opzionale. Se passato, checkbox riga disabled per le
     *  righe che ritornano false; conteggi header e select-all considerano
     *  solo le righe selectable. */
    isRowSelectable?: (row: T) => boolean;
    selectedRowIds?: string[];
    onSelectedRowsChange?: (ids: string[]) => void;
    onBulkDelete?: (ids: string[]) => void;
    /** Id dell'intero dataset PRIMA di eventuale filtro di ricerca client-side.
     *  Se passato, la selezione viene podata contro questo set (distingue
     *  "riga cancellata" da "riga filtrata dalla ricerca") invece che contro
     *  `data` (già filtrato). Se omesso, comportamento invariato. */
    allRowIds?: string[];
    /** Label custom per il pulsante azione nella BulkBar. */
    bulkActionLabel?: string;
    showSelectionBar?: boolean;
    /**
     * Il piede (conteggio, per pagina, pagine). `false` solo quando la tabella
     * mostra tutte le righe e il conteggio è già detto da chi la contiene
     * (es. il badge della `Card`): elenchi raggruppati in più tabelle.
     */
    showFooter?: boolean;

    /** Righe con animazione highlight transitorio (~2s fade amber). */
    highlightedRowIds?: string[];
    /** Righe visivamente attenuate e non interattive (es. in salvataggio, sola lettura). */
    disabledRowIds?: string[];
    /**
     * Righe spente ma leggibili e interattive: solo aspetto, come `ListRow
     * muted` (es. la sede sospesa nella matrice di Programmazione).
     */
    mutedRowIds?: string[];
    /**
     * Nome della tabella. Con un nome la tabella si espone ai lettori di
     * schermo come tabella (righe, intestazioni, celle).
     */
    ariaLabel?: string;

    getRowId?: (row: T, rowIndex: number) => string;

    rowWrapper?: (row: ReactNode, rowData: T, rowIndex: number) => ReactNode;
}

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
    if (option === "auto") return "Auto";
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
    /** Resolved per-row: se false, checkbox riga disabled. Default true. */
    isRowSelectableResolved?: boolean;
    isSelected?: boolean;
    onSelect?: (id: string, checked: boolean) => void;
    isHighlighted?: boolean;
    isDisabled?: boolean;
    isMuted?: boolean;
    /** Ruoli ARIA di riga e cella (la tabella ha un nome). */
    semantic?: boolean;
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
    isRowSelectableResolved = true,
    isSelected,
    onSelect,
    isHighlighted,
    isDisabled,
    isMuted,
    semantic,
    dragHandleProps
}: DataTableRowProps<T>) {
    const classes = [
        styles.row,
        onRowClick && !isDisabled ? styles.rowClickable : "",
        isSelected ? styles.rowSelected : "",
        isHighlighted ? styles.rowHighlighted : "",
        isDisabled ? styles.rowDisabled : "",
        isMuted ? styles.rowMuted : ""
    ]
        .filter(Boolean)
        .join(" ");

    return (
        <div
            className={classes}
            style={gridStyle}
            role={semantic ? "row" : undefined}
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
                    role={semantic ? "cell" : undefined}
                >
                    <input
                        type="checkbox"
                        className={styles.checkbox}
                        checked={isSelected ?? false}
                        onChange={e => onSelect?.(rowId, e.target.checked)}
                        onClick={e => e.stopPropagation()}
                        aria-label="Seleziona riga"
                        disabled={isDisabled || !isRowSelectableResolved}
                    />
                </div>
            )}
            {columns.map(column => {
                const value = column.accessor ? column.accessor(row) : undefined;
                const content = column.cell
                    ? column.cell(value, row, rowIndex, dragHandleProps)
                    : (value as ReactNode);
                // Colonna azioni: per id, o perché la cella rende TableRowActions.
                const isActions =
                    column.id === ACTIONS_COLUMN_ID ||
                    (isValidElement(content) && content.type === TableRowActions);

                return (
                    <div
                        key={column.id}
                        className={`${styles.cell} ${getAlignClass(column.align)}${isActions ? ` ${styles.cellActions}` : ""}`}
                        data-actions={isActions || undefined}
                        role={semantic ? "cell" : undefined}
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
    columns: columnsProp,
    isLoading = false,
    emptyState,
    isFiltered = false,
    onClearFilters,
    maxHeight: maxHeightProp,
    pageSize,
    pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,
    onRowClick,
    selectable = false,
    isRowSelectable,
    selectedRowIds,
    onSelectedRowsChange,
    onBulkDelete,
    bulkActionLabel,
    showSelectionBar = true,
    showFooter = true,
    highlightedRowIds,
    disabledRowIds,
    mutedRowIds,
    ariaLabel,
    getRowId = defaultGetRowId,
    rowWrapper,
    allRowIds
}: DataTableProps<T>) {
    const maxHeight = maxHeightProp ?? DEFAULT_MAX_HEIGHT;
    const maxHeightIsExplicit = maxHeightProp !== undefined;

    // La colonna azioni è sempre l'ultima, a destra (scheda «DataTable»):
    // se il consumer la dichiara altrove, la tabella la sposta in coda.
    const isPhone = useMediaQuery("(max-width: 767px)");
    const columns = useMemo(() => {
        // Su telefono le colonne `hideOnPhone` escono; le azioni restano.
        const visible = isPhone
            ? columnsProp.filter(c => !c.hideOnPhone || c.id === ACTIONS_COLUMN_ID)
            : columnsProp;
        const idx = visible.findIndex(c => c.id === ACTIONS_COLUMN_ID);
        if (idx < 0 || idx === visible.length - 1) return visible;
        return [...visible.filter((_, i) => i !== idx), visible[idx]];
    }, [columnsProp, isPhone]);
    const initialSelection: PageSizeSelection = pageSize ?? "auto";
    const [currentPageSize, setCurrentPageSize] =
        useState<PageSizeSelection>(initialSelection);
    const [currentPage, setCurrentPage] = useState(1);

    // External pageSize prop changes reset internal state
    useEffect(() => {
        setCurrentPageSize(pageSize ?? "auto");
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

    // id-aware reset: drop ids that no longer exist in the dataset.
    // Se `allRowIds` è fornito (parent con ricerca client-side), la poda usa
    // il set NON filtrato → distingue "cancellata" (assente da allRowIds) da
    // "filtrata" (presente in allRowIds, assente da data corrente → NON poda).
    // Se assente, comportamento identico a prima: poda contro `data` corrente.
    const allCurrentIds = useMemo(
        () => data.map((row, i) => getRowId(row, i)),
        [data, getRowId]
    );
    const pruneAgainstIds = allRowIds ?? allCurrentIds;

    // ─── Loaded-latch: gate contro race di mount ───────────────────────────
    // Il prune sotto non deve svuotare una selezione pre-popolata dal parent
    // mentre `data`/`allRowIds` sono ancora "[]" per un fetch in corso. Parte
    // SEMPRE false (mai un default ottimistico su `isLoading` al primo render:
    // molti call-site inizializzano `loading` a `false` e lo alzano solo
    // dentro un proprio effect, che gira DOPO quello del DataTable nello
    // stesso commit — un default `!isLoading` al mount arriverebbe quindi
    // troppo tardi). Scatta UNA VOLTA (mai più false) al primo tra:
    // `pruneAgainstIds` si popola (>0) — copre sia i call-site che montano
    // già con dati pronti (il flip avviene nello stesso giro di effect del
    // prune, nessun ritardo) sia il caso di fetch completato — oppure
    // `isLoading` transita true→false (copre il caso dataset genuinamente
    // vuoto con `isLoading` gestito correttamente dal call-site).
    const hasLoadedRef = useRef(false);
    const prevIsLoadingRef = useRef(isLoading);

    useEffect(() => {
        if (!hasLoadedRef.current) {
            if (pruneAgainstIds.length > 0 || (prevIsLoadingRef.current && !isLoading)) {
                hasLoadedRef.current = true;
            }
        }
        prevIsLoadingRef.current = isLoading;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isLoading, pruneAgainstIds.join("|")]);

    useEffect(() => {
        if (!hasLoadedRef.current) return;
        if (selected.length === 0) return;
        const existing = new Set(pruneAgainstIds);
        const filtered = selected.filter(id => existing.has(id));
        if (filtered.length !== selected.length) {
            if (!isSelectionControlled) {
                setInternalSelected(filtered);
            }
            onSelectedRowsChange?.(filtered);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pruneAgainstIds.join("|"), isLoading]);

    // ─── Grid template ──────────────────────────────────────────────────────
    const gridStyle = useMemo<CSSProperties>(() => {
        const widths = columns.map(c => c.width ?? "minmax(0, 1fr)");
        const template = selectable
            ? `${CHECKBOX_COLUMN_WIDTH} ${widths.join(" ")}`
            : widths.join(" ");
        return { gridTemplateColumns: template };
    }, [columns, selectable]);

    // ─── Auto page size refs ────────────────────────────────────────────────
    const probeRef = useRef<HTMLDivElement | null>(null);
    const tableRef = useRef<HTMLDivElement | null>(null);
    const headerRef = useRef<HTMLDivElement | null>(null);
    const footerRef = useRef<HTMLDivElement | null>(null);
    const bodyRef = useRef<HTMLDivElement | null>(null);

    // ─── Pagination slicing ─────────────────────────────────────────────────
    const isAllMode = currentPageSize === "all";
    const isAutoMode = currentPageSize === "auto";

    // sampleKey: identifica il set di righe visibili. `data` è già il set
    // FILTRATO in tutti i call site → un filtro che cambia il contenuto senza
    // cambiare il conteggio cambia comunque gli id dei primi elementi.
    // Limite residuo accettato: contenuto mutato a parità di id non cambia la
    // chiave — coperto da ResizeObserver/window-resize alla prossima misura.
    const sampleIdentity = useMemo(
        () => data.slice(0, 5).map((row, i) => getRowId(row, i)).join("|"),
        [data, getRowId]
    );

    const { fit: autoFit, measuredHeightPx } = useAutoPageSize({
        // Misura sempre (anche in manuale) per riempire il probe vincolato; il
        // fit (righe/pagina) è calcolato solo in auto via `autoMode`.
        enabled: !isLoading && data.length > 0,
        autoMode: isAutoMode,
        probeRef,
        tableRef,
        headerRef,
        footerRef,
        bodyRef,
        rowClassName: styles.row,
        sampleKey: `${data.length}:${currentPage}:${sampleIdentity}`,
        maxHeightIsExplicit
    });

    const numericPageSize = resolveNumericPageSize(currentPageSize, autoFit, data.length);
    const hasOverflow = !isAllMode && data.length > numericPageSize;
    const totalPages = hasOverflow ? Math.max(1, Math.ceil(data.length / numericPageSize)) : 1;
    const safePage = Math.min(currentPage, totalPages);

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
    const mutedSet = useMemo(() => new Set(mutedRowIds ?? []), [mutedRowIds]);
    const semantic = Boolean(ariaLabel);
    const selectedSet = useMemo(() => new Set(selected), [selected]);

    // ─── Selection handlers ────────────────────────────────────────────────
    const currentPageIds = useMemo(() => displayWithIds.map(d => d.rowId), [displayWithIds]);

    // Per-row gating: filtra ids selezionabili (default tutti se isRowSelectable
    // non passato). Header checkbox + select-all considerano solo questi.
    const selectableCurrentPageIds = useMemo(() => {
        if (!isRowSelectable) return currentPageIds;
        return displayWithIds.filter(d => isRowSelectable(d.row)).map(d => d.rowId);
    }, [displayWithIds, currentPageIds, isRowSelectable]);

    const allCurrentPageSelected =
        selectable &&
        selectableCurrentPageIds.length > 0 &&
        selectableCurrentPageIds.every(id => selectedSet.has(id));
    const someCurrentPageSelected =
        selectable && !allCurrentPageSelected && selectableCurrentPageIds.some(id => selectedSet.has(id));

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
                    selectableCurrentPageIds.forEach(id => set.add(id));
                    return Array.from(set);
                });
            } else {
                commitSelected(prev => {
                    const onPage = new Set(selectableCurrentPageIds);
                    return prev.filter(id => !onPage.has(id));
                });
            }
        },
        [commitSelected, selectableCurrentPageIds]
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
        // Caricamento = righe Skeleton: si sa dove andrà il contenuto.
        if (isLoading) {
            return Array.from({ length: SKELETON_ROWS }, (_, r) => (
                <div key={r} className={`${styles.row} ${styles.rowSkeleton}`} style={gridStyle} aria-hidden="true">
                    {selectable && (
                        <div className={`${styles.cell} ${styles.checkboxCell}`}>
                            <Skeleton width={16} height={16} radius="var(--radius-inner)" />
                        </div>
                    )}
                    {columns.map((column, c) => (
                        <div key={column.id} className={`${styles.cell} ${getAlignClass(column.align)}`}>
                            <Skeleton
                                width={SKELETON_WIDTHS[(r + c) % SKELETON_WIDTHS.length]}
                                height={14}
                                radius="var(--radius-inner)"
                            />
                        </div>
                    ))}
                </div>
            ));
        }

        // Vuoto = EmptyState inline dentro la tabella; filtered se c'è un
        // filtro attivo (la lista esiste, il filtro non trova nulla).
        if (data.length === 0) {
            if (isFiltered) {
                return (
                    <EmptyState
                        variant="filtered"
                        title={emptyState?.title ?? "Nessun risultato"}
                        onClearFilters={onClearFilters}
                    />
                );
            }
            return (
                <EmptyState
                    variant="inline"
                    icon={emptyState?.icon ?? <IconInbox stroke={1.5} />}
                    title={emptyState?.title ?? "Nessun risultato"}
                    description={emptyState?.description}
                    action={emptyState?.action}
                />
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
                    isRowSelectableResolved={isRowSelectable ? isRowSelectable(row) : true}
                    isSelected={selectedSet.has(rowId)}
                    onSelect={handleSelectRow}
                    isHighlighted={highlightSet.has(rowId)}
                    isDisabled={disabledSet.has(rowId)}
                    isMuted={mutedSet.has(rowId)}
                    semantic={semantic}
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
        // Il selettore "Per pagina" resta SEMPRE visibile: "Auto" è una scelta
        // reversibile, l'utente deve poter tornare indietro o cambiare valore
        // anche quando totale ≤ pageSize (niente overflow). Solo le frecce di
        // navigazione (showControls) restano condizionate a hasOverflow.
        const showDropdown = pageSizeOptions.length > 1;

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
                                <Text variant="body-sm" colorVariant="muted" className={styles.pageSizeLabel}>
                                    Per pagina
                                </Text>
                                <select
                                    className={styles.pageSizeSelect}
                                    value={String(currentPageSize)}
                                    onChange={e => {
                                        const v = e.target.value;
                                        handlePageSizeChange(
                                            v === "all" || v === "auto" ? v : Number(v)
                                        );
                                    }}
                                    aria-label="Righe per pagina"
                                >
                                    {withAutoOption(pageSizeOptions).map(opt => (
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

    // Probe vincolato non-ambiguo: usa come `max-height` lo spazio reale
    // misurato (es. 667) invece del default CSS statico (548, sbagliato). Il
    // `.table` resta shrink-to-fit (nessun flex-grow) → altezza = min(contenuto,
    // probe): corta con poche righe, cappata + scroll interno quando il
    // contenuto eccede. Il default `maxHeight` resta per fallback/drawer.
    const containerStyle: CSSProperties = {
        maxHeight: measuredHeightPx != null ? `${measuredHeightPx}px` : maxHeight
    };

    return (
        <>
            <div ref={probeRef} className={styles.autoSizeProbe}>
                <div ref={tableRef} className={styles.table} style={containerStyle}>
                    <div className={styles.scrollArea} role={semantic ? "table" : undefined} aria-label={ariaLabel}>
                        <div ref={headerRef} className={styles.header} style={gridStyle} role={semantic ? "row" : undefined}>
                            {selectable && (
                                <div className={`${styles.headerCell} ${styles.checkboxCell}`} role={semantic ? "columnheader" : undefined}>
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
                                    className={`${styles.headerCell} ${getAlignClass(column.align)}${column.id === ACTIONS_COLUMN_ID ? ` ${styles.cellActions}` : ""}`}
                                    data-actions={column.id === ACTIONS_COLUMN_ID || undefined}
                                    role={semantic ? "columnheader" : undefined}
                                >
                                    {column.header}
                                </div>
                            ))}
                        </div>

                        <div ref={bodyRef} className={styles.body} aria-busy={isLoading || undefined} role={semantic ? "rowgroup" : undefined}>
                            {renderRows()}
                        </div>
                    </div>

                    {showFooter && <div ref={footerRef} className={styles.footer}>{renderFooter()}</div>}
                </div>
            </div>

            {selectable && showSelectionBar && (
                <BulkBar
                    selectedCount={selected.length}
                    onDelete={onBulkDelete ? handleBulkDelete : undefined}
                    actionLabel={bulkActionLabel}
                    onClearSelection={handleClearSelection}
                />
            )}
        </>
    );
}
