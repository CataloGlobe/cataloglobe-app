import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { IconEye, IconEyeOff, IconClockExclamation, IconLeaf } from "@tabler/icons-react";
import Text from "@/components/ui/Text/Text";
import { Badge } from "@/components/ui/Badge/Badge";
import { Button } from "@/components/ui/Button/Button";
import { ChipGroupSingle, type ChipOption } from "@/components/ui/Chip/ChipGroup";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog/ConfirmDialog";
import { DataTable, DATA_TABLE_CLASSES, type ColumnDefinition } from "@/components/ui/DataTable/DataTable";
import { EmptyState } from "@/components/ui/EmptyState/EmptyState";
import { InlineBanner } from "@/components/ui/InlineBanner/InlineBanner";
import { ListRow } from "@/components/ui/ListRow/ListRow";
import { SegmentedControl } from "@/components/ui/SegmentedControl/SegmentedControl";
import { StatusBadge } from "@/components/ui/StatusBadge/StatusBadge";
import { ToolbarSearch } from "@/components/ui/ToolbarSearch";
import { Tooltip } from "@/components/ui/Tooltip/Tooltip";
import { useToast } from "@/context/Toast/ToastContext";
import { useEnsureActive } from "@/hooks/useEnsureActive";
import {
    getIngredients,
    listProductIngredientPairs,
    type V2Ingredient
} from "@/services/supabase/ingredients";
import {
    bulkUpdateActivityProductVisibility,
    type ActivityProductOverride,
    type ProductVisibilityState,
    type RenderableProduct
} from "@/services/supabase/activeCatalog";
import {
    buildBulkConfirmData,
    buildIngredientVisibilityRows,
    bulkConfirmCopy,
    bulkSuccessMessage,
    filterIngredientRows,
    ingredientStateSummary,
    productWord,
    type IngredientFilterValue,
    type IngredientVisibilityRow,
    type ProductIngredientPair
} from "./ingredientVisibility";
import styles from "./ActivityVisibilityIngredients.module.scss";

const PREVIEW_LIMIT = 3;

/**
 * Value del SegmentedControl di riga: i 3 stati applicabili + sentinel "mixed"
 * (mai tra le opzioni) per righe miste/vuote → nessun segmento attivo.
 */
type RowSegmentValue = ProductVisibilityState | "mixed";

const BULK_OPTIONS: {
    value: ProductVisibilityState;
    label: string;
    icon: React.ReactNode;
}[] = [
    { value: "visible", label: "Rendi tutti visibili", icon: <IconEye size={16} /> },
    { value: "hidden", label: "Nascondi tutti", icon: <IconEyeOff size={16} /> },
    { value: "unavailable", label: "Segna tutti non disponibili", icon: <IconClockExclamation size={16} /> }
];

function segmentValueOf(row: IngredientVisibilityRow): RowSegmentValue {
    switch (row.aggregate) {
        case "all_visible":
            return "visible";
        case "all_hidden":
            return "hidden";
        case "all_unavailable":
            return "unavailable";
        default:
            return "mixed";
    }
}

type PendingBulk = {
    row: IngredientVisibilityRow;
    target: ProductVisibilityState;
};

type ActivityVisibilityIngredientsProps = {
    activityId: string;
    tenantId: string;
    /** Prodotti del catalogo attivo (stessa lista della vista Prodotti). */
    products: RenderableProduct[];
    /** Modifiche a mano correnti keyed by product_id (stessa mappa della vista Prodotti). */
    overrides: Record<string, ActivityProductOverride>;
    /** Ricarica catalogo + modifiche nel parent dopo un'azione in blocco riuscita. */
    onBulkApplied: () => Promise<void>;
    /** Notifica il numero di ingredienti del tenant (badge tab nel parent). */
    onCountChange?: (count: number) => void;
    /** Sola lettura: le azioni in blocco sono spente (fieldset). */
    readOnly?: boolean;
};

/**
 * L'ingrediente come selettore dei prodotti che lo usano (§19bis.5): non ha
 * uno stato suo, cambia insieme i prodotti coinvolti, dopo una conferma.
 */
export const ActivityVisibilityIngredients: React.FC<ActivityVisibilityIngredientsProps> = ({
    activityId,
    tenantId,
    products,
    overrides,
    onBulkApplied,
    onCountChange,
    readOnly = false
}) => {
    const { showToast } = useToast();
    const { ensureActive } = useEnsureActive();

    const [isLoading, setIsLoading] = useState(true);
    const [loadError, setLoadError] = useState(false);
    const [ingredients, setIngredients] = useState<V2Ingredient[]>([]);
    const [pairs, setPairs] = useState<ProductIngredientPair[]>([]);
    const [search, setSearch] = useState("");
    const [filter, setFilter] = useState<IngredientFilterValue>("all");
    const [pending, setPending] = useState<PendingBulk | null>(null);

    const onCountChangeRef = useRef(onCountChange);
    useEffect(() => {
        onCountChangeRef.current = onCountChange;
    }, [onCountChange]);

    // Fetch lazy: il componente monta solo al primo ingresso nella vista
    // Ingredienti. Due query piatte, mai una per ingrediente.
    const loadData = useCallback(async () => {
        setIsLoading(true);
        setLoadError(false);
        try {
            const [ings, prs] = await Promise.all([
                getIngredients(tenantId),
                listProductIngredientPairs(tenantId)
            ]);
            setIngredients(ings);
            setPairs(prs);
            onCountChangeRef.current?.(ings.length);
        } catch (e) {
            // Un errore non è «Nessun ingrediente»: lo dice, con «Riprova».
            console.error("Error loading ingredient visibility data:", e);
            setLoadError(true);
        } finally {
            setIsLoading(false);
        }
    }, [tenantId]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const overriddenProductIds = useMemo(() => {
        const set = new Set<string>();
        for (const [pid, ov] of Object.entries(overrides)) {
            if (ov.visible_override !== null) set.add(pid);
        }
        return set;
    }, [overrides]);

    const rows = useMemo(
        () => buildIngredientVisibilityRows(ingredients, pairs, products, overriddenProductIds),
        [ingredients, pairs, products, overriddenProductIds]
    );

    const filtered = useMemo(() => filterIngredientRows(rows, filter, search), [rows, filter, search]);

    const withHiddenCount = useMemo(() => rows.filter(r => r.counts.hidden > 0).length, [rows]);
    const withUnavailableCount = useMemo(() => rows.filter(r => r.counts.unavailable > 0).length, [rows]);
    const mixedCount = useMemo(() => rows.filter(r => r.aggregate === "mixed").length, [rows]);

    const disabledRowIds = useMemo(
        () => rows.filter(r => r.productIds.length === 0).map(r => r.ingredient_id),
        [rows]
    );

    const filterOptions = useMemo<ChipOption<IngredientFilterValue>[]>(
        () => [
            { value: "all", label: "Tutti", count: rows.length },
            { value: "with_hidden", label: "Con nascosti", count: withHiddenCount, disabled: withHiddenCount === 0 },
            {
                value: "with_unavailable",
                label: "Con non disponibili",
                count: withUnavailableCount,
                disabled: withUnavailableCount === 0
            }
        ],
        [rows.length, withHiddenCount, withUnavailableCount]
    );

    const handleSegmentChange = useCallback(
        (row: IngredientVisibilityRow, next: ProductVisibilityState) => {
            if (row.productIds.length === 0 || readOnly || !ensureActive()) return;
            if (segmentValueOf(row) === next) return; // stato già uniforme = no-op
            setPending({ row, target: next });
        },
        [readOnly, ensureActive]
    );

    const handleConfirmBulk = async (): Promise<boolean> => {
        if (!pending) return false;
        const { row, target } = pending;
        try {
            await bulkUpdateActivityProductVisibility(activityId, row.productIds, target);
            await onBulkApplied();
            showToast({ message: bulkSuccessMessage(target, row.productIds.length), type: "success" });
            return true;
        } catch (e) {
            console.error("Error applying bulk visibility:", e);
            showToast({ message: "Errore durante l'aggiornamento in blocco.", type: "error" });
            return false;
        }
    };

    const columns = useMemo<ColumnDefinition<IngredientVisibilityRow>[]>(() => {
        const summaryBadge = (row: IngredientVisibilityRow) => {
            const summary = ingredientStateSummary(row);
            const badge = <StatusBadge variant={summary.tone} label={summary.label} />;
            return summary.detail ? <Tooltip content={summary.detail}>{badge}</Tooltip> : badge;
        };
        return [
            {
                id: "ingredient",
                header: "Ingrediente",
                width: "minmax(0, 2fr)",
                cell: (_, row) => {
                    const summary = ingredientStateSummary(row);
                    return (
                        <div className={`${DATA_TABLE_CLASSES.cellTwoLine} ${DATA_TABLE_CLASSES.cellTwoLineWrap}`}>
                            <span className={styles.nameRow}>
                                <span>{row.name}</span>
                                {row.hasOverride && <Badge variant="outline">a mano</Badge>}
                            </span>
                            {row.productIds.length === 0 ? (
                                <span>Nessun prodotto in questo catalogo</span>
                            ) : (
                                // Sul telefono Prodotti e Stato non hanno colonna:
                                // il riassunto scende qui.
                                <span className={styles.phoneOnly}>
                                    {row.productIds.length} {productWord(row.productIds.length)} ·{" "}
                                    {summary.label.toLowerCase()}
                                </span>
                            )}
                        </div>
                    );
                }
            },
            {
                id: "products",
                header: "Prodotti",
                width: "90px",
                align: "right",
                hideOnPhone: true,
                cell: (_, row) => (
                    <Text variant="body-sm" weight={500}>
                        {row.productIds.length}
                    </Text>
                )
            },
            {
                id: "state",
                header: "Stato",
                width: "minmax(170px, 1fr)",
                hideOnPhone: true,
                cell: (_, row) => summaryBadge(row)
            },
            {
                id: "action",
                header: "Azione",
                // Tre icone da 40 più il padding della cella: sotto, a 375 la
                // terza si tagliava.
                width: "176px",
                align: "right",
                cell: (_, row) => (
                    <fieldset className={styles.readOnlyScope} disabled={readOnly}>
                        <SegmentedControl<RowSegmentValue>
                            // Remount al cambio di aggregato: con value fuori
                            // opzioni (misto) l'indicatore non si riposiziona.
                            key={row.aggregate}
                            value={segmentValueOf(row)}
                            onChange={next => {
                                if (next !== "mixed") handleSegmentChange(row, next);
                            }}
                            size="sm"
                            iconsOnly
                            options={BULK_OPTIONS}
                        />
                    </fieldset>
                )
            }
        ];
    }, [readOnly, handleSegmentChange]);

    if (isLoading) {
        return <DataTable<IngredientVisibilityRow> ariaLabel="Ingredienti" data={[]} columns={columns} isLoading />;
    }

    if (loadError) {
        return (
            <EmptyState
                variant="inline"
                icon={<IconLeaf />}
                title="Non è stato possibile caricare gli ingredienti"
                action={
                    <Button variant="secondary" onClick={() => void loadData()}>
                        Riprova
                    </Button>
                }
            />
        );
    }

    if (ingredients.length === 0) {
        return (
            <EmptyState
                variant="inline"
                icon={<IconLeaf />}
                title="Nessun ingrediente"
                description="Collega gli ingredienti ai prodotti dalla scheda prodotto per gestirne la disponibilità in blocco da qui."
            />
        );
    }

    const confirmData = pending
        ? buildBulkConfirmData(pending.row.productIds, products, overriddenProductIds, pending.target)
        : null;
    const copy =
        pending && confirmData
            ? bulkConfirmCopy(pending.target, pending.row.name, confirmData.total, confirmData.overwrittenCount)
            : null;

    const countText = [
        `${ingredients.length} ingredient${ingredients.length === 1 ? "e" : "i"}`,
        withHiddenCount > 0 ? `${withHiddenCount} con prodotti nascosti` : null,
        mixedCount > 0 ? `${mixedCount} mist${mixedCount === 1 ? "o" : "i"}` : null
    ]
        .filter(Boolean)
        .join(" · ");

    return (
        <div className={styles.container}>
            <div className={styles.toolbar}>
                <ChipGroupSingle<IngredientFilterValue>
                    ariaLabel="Filtra gli ingredienti"
                    layout="auto"
                    shape="pill"
                    value={filter}
                    onChange={setFilter}
                    options={filterOptions}
                />
                <div className={styles.searchSlot}>
                    <ToolbarSearch value={search} onChange={setSearch} placeholder="Cerca ingrediente…" />
                </div>
            </div>

            <Text variant="caption" colorVariant="muted">
                {countText}
            </Text>

            <div className={styles.tableWrapper}>
                <DataTable<IngredientVisibilityRow>
                    ariaLabel="Ingredienti"
                    data={filtered}
                    columns={columns}
                    getRowId={row => row.ingredient_id}
                    disabledRowIds={disabledRowIds}
                    isFiltered={filter !== "all" || search.trim() !== ""}
                    onClearFilters={() => {
                        setFilter("all");
                        setSearch("");
                    }}
                    emptyState={{ title: "Nessun ingrediente corrispondente ai filtri" }}
                />
            </div>

            {pending && confirmData && copy && (
                <ConfirmDialog
                    isOpen
                    onClose={() => setPending(null)}
                    onConfirm={handleConfirmBulk}
                    title={copy.title}
                    message={copy.message}
                    confirmLabel={copy.confirmLabel}
                    confirmVariant="primary"
                >
                    <div className={styles.confirmBody}>
                        {copy.warn && <InlineBanner variant="warning">{copy.warn}</InlineBanner>}
                        <div>
                            {confirmData.preview.slice(0, PREVIEW_LIMIT).map(item => (
                                <ListRow key={item.product_id} title={item.name} subtitle={item.caption ?? undefined} dense />
                            ))}
                        </div>
                        {confirmData.preview.length > PREVIEW_LIMIT && (
                            <Text variant="caption" colorVariant="muted">
                                … e altr{confirmData.preview.length - PREVIEW_LIMIT === 1 ? "o" : "i"}{" "}
                                {confirmData.preview.length - PREVIEW_LIMIT}{" "}
                                {productWord(confirmData.preview.length - PREVIEW_LIMIT)}
                            </Text>
                        )}
                    </div>
                </ConfirmDialog>
            )}
        </div>
    );
};
