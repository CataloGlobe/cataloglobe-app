import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    IconEye,
    IconEyeOff,
    IconClockExclamation,
    IconAlertCircle
} from "@tabler/icons-react";
import Text from "@/components/ui/Text/Text";
import { Tooltip } from "@/components/ui/Tooltip/Tooltip";
import { DataTable, ColumnDefinition } from "@/components/ui/DataTable/DataTable";
import { SegmentedControl } from "@/components/ui/SegmentedControl/SegmentedControl";
import { ToolbarSearch } from "@/components/ui/ToolbarSearch";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog/ConfirmDialog";
import Skeleton from "@/components/ui/Skeleton/Skeleton";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useToast } from "@/context/Toast/ToastContext";
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
    filterIngredientRows,
    type IngredientFilterValue,
    type IngredientVisibilityRow,
    type ProductIngredientPair
} from "./ingredientVisibility";
import styles from "./ActivityVisibilityIngredients.module.scss";

const PREVIEW_LIMIT = 3;

/**
 * Value del SegmentedControl di riga: i 3 stati applicabili + sentinel "mixed"
 * (mai tra le opzioni) per righe miste/vuote → nessun segmento attivo,
 * indicatore assente (width 0).
 */
type RowSegmentValue = ProductVisibilityState | "mixed";

const BULK_OPTIONS: {
    value: ProductVisibilityState;
    label: string;
    icon: React.ReactNode;
}[] = [
    { value: "visible", label: "Rendi tutti visibili", icon: <IconEye size={16} /> },
    { value: "hidden", label: "Nascondi tutti", icon: <IconEyeOff size={16} /> },
    {
        value: "unavailable",
        label: "Segna tutti non disponibili",
        icon: <IconClockExclamation size={16} />
    }
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

type StateDotVariant = "visible" | "hidden" | "unavailable" | "mixed" | "none";

const DOT_CLASS: Record<StateDotVariant, string> = {
    visible: styles.stateDotVisible,
    hidden: styles.stateDotHidden,
    unavailable: styles.stateDotUnavailable,
    mixed: styles.stateDotMixed,
    none: styles.stateDotNone
};

function stateSummary(row: IngredientVisibilityRow): {
    dot: StateDotVariant;
    label: string;
    detail: string | null;
} {
    const { counts } = row;
    switch (row.aggregate) {
        case "all_visible":
            return { dot: "visible", label: "Tutti visibili", detail: null };
        case "all_hidden":
            return { dot: "hidden", label: "Tutti nascosti", detail: null };
        case "all_unavailable":
            return { dot: "unavailable", label: "Tutti non disponibili", detail: null };
        case "mixed":
            // Breakdown numerico solo nel tooltip (`detail`): la label di riga
            // deve stare corta, la colonna Stato è la più stretta del componente.
            return {
                dot: "mixed",
                label: "Misto",
                detail: `${counts.visible} visibili · ${counts.hidden} nascosti · ${counts.unavailable} non disponibili`
            };
        default:
            return { dot: "none", label: "—", detail: null };
    }
}

function productWord(count: number): string {
    return count === 1 ? "prodotto" : "prodotti";
}

function confirmCopy(
    target: ProductVisibilityState,
    ingredientName: string,
    total: number,
    overwrittenCount: number
): { title: string; message: string; confirmLabel: string; warn: string | null } {
    const word = productWord(total);
    const overwriteSuffix =
        overwrittenCount > 0
            ? ` ${overwrittenCount} ${overwrittenCount === 1 ? "ha già uno stato impostato manualmente che verrà sovrascritto" : "hanno già uno stato impostato manualmente e verranno sovrascritti"}.`
            : "";

    switch (target) {
        case "hidden":
            return {
                title: `Nascondere ${total} ${word}?`,
                message: `Tutti i prodotti collegati a "${ingredientName}" verranno rimossi dalla pagina pubblica.${overwriteSuffix}`,
                confirmLabel: `Nascondi ${total} ${word}`,
                warn: null
            };
        case "unavailable":
            return {
                title: `Segnare ${total} ${word} come non disponibil${total === 1 ? "e" : "i"}?`,
                message: `I prodotti collegati a "${ingredientName}" resteranno in pagina come "Non disponibile".${overwriteSuffix}`,
                confirmLabel: "Segna non disponibili",
                warn: null
            };
        default:
            return {
                title: `Rendere visibil${total === 1 ? "e" : "i"} ${total} ${word}?`,
                message: `Gli override di disponibilità sui prodotti collegati a "${ingredientName}" verranno rimossi: i prodotti torneranno a seguire la programmazione.`,
                confirmLabel: `Rendi visibil${total === 1 ? "e" : "i"} ${total} ${word}`,
                warn:
                    overwrittenCount > 0
                        ? `${overwrittenCount} ${overwrittenCount === 1 ? "prodotto era stato modificato manualmente — potrebbe esserlo per motivi non legati a questo ingrediente. Tornerà" : "prodotti erano stati modificati manualmente — potrebbero esserlo per motivi non legati a questo ingrediente. Torneranno"} visibil${overwrittenCount === 1 ? "e" : "i"} al pubblico.`
                        : null
            };
    }
}

function successMessage(target: ProductVisibilityState, total: number): string {
    const word = productWord(total);
    switch (target) {
        case "hidden":
            return `${total} ${word} nascost${total === 1 ? "o" : "i"}.`;
        case "unavailable":
            return `${total} ${word} segnat${total === 1 ? "o" : "i"} come non disponibil${total === 1 ? "e" : "i"}.`;
        default:
            return `${total} ${word} res${total === 1 ? "o" : "i"} visibil${total === 1 ? "e" : "i"}.`;
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
    /** Override correnti keyed by product_id (stessa mappa della vista Prodotti). */
    overrides: Record<string, ActivityProductOverride>;
    /** Ricarica catalogo + overrides nel parent dopo un'azione bulk riuscita. */
    onBulkApplied: () => Promise<void>;
    /** Notifica il numero di ingredienti del tenant (badge tab nel parent). */
    onCountChange?: (count: number) => void;
};

export const ActivityVisibilityIngredients: React.FC<ActivityVisibilityIngredientsProps> = ({
    activityId,
    tenantId,
    products,
    overrides,
    onBulkApplied,
    onCountChange
}) => {
    const { showToast } = useToast();
    const isMobile = useMediaQuery("(max-width: 767px)");

    const [isLoading, setIsLoading] = useState(true);
    const [ingredients, setIngredients] = useState<V2Ingredient[]>([]);
    const [pairs, setPairs] = useState<ProductIngredientPair[]>([]);
    const [search, setSearch] = useState("");
    const [filter, setFilter] = useState<IngredientFilterValue>("all");
    const [pending, setPending] = useState<PendingBulk | null>(null);

    const onCountChangeRef = useRef(onCountChange);
    useEffect(() => {
        onCountChangeRef.current = onCountChange;
    }, [onCountChange]);

    // Fetch lazy: il componente monta solo al primo ingresso nella tab
    // Ingredienti (vedi ActivityVisibilityContent) — il load iniziale del
    // drawer resta invariato. Due query piatte, mai una per ingrediente.
    const loadData = useCallback(async () => {
        setIsLoading(true);
        try {
            const [ings, prs] = await Promise.all([
                getIngredients(tenantId),
                listProductIngredientPairs(tenantId)
            ]);
            setIngredients(ings);
            setPairs(prs);
            onCountChangeRef.current?.(ings.length);
        } catch (e) {
            console.error("Error loading ingredient visibility data:", e);
            showToast({ message: "Errore nel caricamento degli ingredienti.", type: "error" });
        } finally {
            setIsLoading(false);
        }
    }, [tenantId, showToast]);

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

    const filtered = useMemo(
        () => filterIngredientRows(rows, filter, search),
        [rows, filter, search]
    );

    const withHiddenCount = useMemo(() => rows.filter(r => r.counts.hidden > 0).length, [rows]);
    const withUnavailableCount = useMemo(
        () => rows.filter(r => r.counts.unavailable > 0).length,
        [rows]
    );
    const mixedCount = useMemo(() => rows.filter(r => r.aggregate === "mixed").length, [rows]);

    const disabledRowIds = useMemo(
        () => rows.filter(r => r.productIds.length === 0).map(r => r.ingredient_id),
        [rows]
    );

    const handleSegmentChange = (row: IngredientVisibilityRow, next: ProductVisibilityState) => {
        if (row.productIds.length === 0) return;
        if (segmentValueOf(row) === next) return; // stato già uniforme = no-op
        setPending({ row, target: next });
    };

    const handleConfirmBulk = async (): Promise<boolean> => {
        if (!pending) return false;
        const { row, target } = pending;
        try {
            await bulkUpdateActivityProductVisibility(activityId, row.productIds, target);
            await onBulkApplied();
            showToast({ message: successMessage(target, row.productIds.length), type: "success" });
            return true;
        } catch (e) {
            console.error("Error applying bulk visibility:", e);
            showToast({ message: "Errore durante l'aggiornamento in blocco.", type: "error" });
            return false;
        }
    };

    const renderNameCell = (row: IngredientVisibilityRow) => {
        const summary = stateSummary(row);
        return (
            <div className={styles.nameCell}>
                <div className={styles.nameRow}>
                    <Text weight={600} variant="body-sm">
                        {row.name}
                    </Text>
                    {row.hasOverride && (
                        <Tooltip content="Override manuali attivi su prodotti collegati">
                            <span
                                className={styles.overrideMarker}
                                aria-label="Override manuali attivi su prodotti collegati"
                            >
                                <IconAlertCircle size={15} />
                            </span>
                        </Tooltip>
                    )}
                </div>
                {isMobile ? (
                    <Text variant="caption" colorVariant="muted">
                        <span
                            className={`${styles.captionDot} ${DOT_CLASS[summary.dot]}`}
                            aria-hidden
                        />
                        {row.productIds.length === 0
                            ? "Nessun prodotto in questo catalogo"
                            : `${row.productIds.length} ${productWord(row.productIds.length)} · ${summary.label.toLowerCase()}`}
                    </Text>
                ) : (
                    row.productIds.length === 0 && (
                        <Text variant="caption" colorVariant="muted">
                            Nessun prodotto in questo catalogo
                        </Text>
                    )
                )}
            </div>
        );
    };

    const renderActionCell = (row: IngredientVisibilityRow) => (
        <div className={styles.actionCell} onClick={e => e.stopPropagation()}>
            <SegmentedControl<RowSegmentValue>
                // Remount al cambio di aggregato: con value fuori opzioni
                // (misto) l'indicatore non viene mai riposizionato, quindi
                // senza key resterebbe visibile sull'ultimo segmento attivo.
                key={row.aggregate}
                value={segmentValueOf(row)}
                onChange={next => {
                    if (next !== "mixed") handleSegmentChange(row, next);
                }}
                size="sm"
                iconsOnly
                options={BULK_OPTIONS}
            />
        </div>
    );

    const columns = useMemo<ColumnDefinition<IngredientVisibilityRow>[]>(() => {
        if (isMobile) {
            return [
                {
                    id: "ingredient",
                    header: "Ingrediente",
                    width: "minmax(0, 1fr)",
                    cell: (_, row) => renderNameCell(row)
                },
                {
                    id: "action",
                    header: "Azione",
                    width: "148px",
                    align: "right",
                    cell: (_, row) => renderActionCell(row)
                }
            ];
        }
        return [
            {
                id: "ingredient",
                header: "Ingrediente",
                width: "minmax(0, 2fr)",
                cell: (_, row) => renderNameCell(row)
            },
            {
                id: "products",
                header: "Prodotti",
                width: "90px",
                align: "right",
                cell: (_, row) => (
                    <Text variant="body-sm" weight={500}>
                        <span className={styles.countCell}>{row.productIds.length}</span>
                    </Text>
                )
            },
            {
                id: "state",
                header: "Stato",
                width: "minmax(150px, 1fr)",
                cell: (_, row) => {
                    const summary = stateSummary(row);
                    const pill = (
                        <span
                            className={`${styles.statePill} ${summary.dot === "mixed" ? styles.statePillMixed : ""}`}
                        >
                            <span className={`${styles.stateDot} ${DOT_CLASS[summary.dot]}`} aria-hidden />
                            {summary.label}
                        </span>
                    );
                    return summary.detail ? <Tooltip content={summary.detail}>{pill}</Tooltip> : pill;
                }
            },
            {
                id: "action",
                header: "Azione",
                width: "156px",
                align: "right",
                cell: (_, row) => renderActionCell(row)
            }
        ];
    }, [isMobile]);

    if (isLoading) {
        return (
            <div className={styles.loading}>
                <Skeleton height={40} />
                <Skeleton height={40} />
                <Skeleton height={40} />
            </div>
        );
    }

    if (ingredients.length === 0) {
        return (
            <div className={styles.emptyState}>
                <Text variant="body" weight={600}>
                    Nessun ingrediente
                </Text>
                <Text variant="body-sm" colorVariant="muted">
                    Collega gli ingredienti ai prodotti dalla scheda prodotto per gestirne la
                    disponibilità in blocco da qui.
                </Text>
            </div>
        );
    }

    const confirmData = pending
        ? buildBulkConfirmData(pending.row.productIds, products, overriddenProductIds, pending.target)
        : null;
    const copy =
        pending && confirmData
            ? confirmCopy(
                  pending.target,
                  pending.row.name,
                  confirmData.total,
                  confirmData.overwrittenCount
              )
            : null;

    return (
        <div className={styles.container}>
            <div className={styles.toolbar}>
                <SegmentedControl<IngredientFilterValue>
                    value={filter}
                    onChange={setFilter}
                    options={[
                        { value: "all", label: `Tutti · ${rows.length}` },
                        { value: "with_hidden", label: `Con nascosti · ${withHiddenCount}` },
                        {
                            value: "with_unavailable",
                            label: `Con non disponibili · ${withUnavailableCount}`
                        }
                    ]}
                />
                <div className={styles.searchSlot}>
                    <ToolbarSearch
                        value={search}
                        onChange={setSearch}
                        placeholder="Cerca ingrediente…"
                    />
                </div>
            </div>

            <div className={styles.countTop}>
                <Text variant="caption" colorVariant="muted">
                    {ingredients.length} ingredient{ingredients.length === 1 ? "e" : "i"}
                    {withHiddenCount > 0 && ` · ${withHiddenCount} con prodotti nascosti`}
                    {mixedCount > 0 && ` · ${mixedCount} mist${mixedCount === 1 ? "o" : "i"}`}
                </Text>
            </div>

            {filtered.length === 0 ? (
                <div className={styles.emptyFilter}>
                    <Text variant="body-sm" colorVariant="muted">
                        Nessun ingrediente corrispondente ai filtri.
                    </Text>
                </div>
            ) : (
                <div className={styles.tableWrapper}>
                    <DataTable
                        data={filtered}
                        columns={columns}
                        getRowId={row => row.ingredient_id}
                        disabledRowIds={disabledRowIds}
                    />
                </div>
            )}

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
                        {copy.warn && <div className={styles.confirmWarn}>{copy.warn}</div>}
                        <div className={styles.previewList}>
                            {confirmData.preview.slice(0, PREVIEW_LIMIT).map(item => (
                                <div key={item.product_id} className={styles.previewItem}>
                                    <Text variant="body-sm" className={styles.previewName}>
                                        {item.name}
                                    </Text>
                                    {item.caption && (
                                        <Text
                                            variant="caption"
                                            colorVariant="muted"
                                            className={styles.previewCaption}
                                        >
                                            {item.caption}
                                        </Text>
                                    )}
                                </div>
                            ))}
                            {confirmData.preview.length > PREVIEW_LIMIT && (
                                <div className={styles.previewMore}>
                                    <Text variant="caption" colorVariant="muted">
                                        … e altr{confirmData.preview.length - PREVIEW_LIMIT === 1 ? "o" : "i"}{" "}
                                        {confirmData.preview.length - PREVIEW_LIMIT}{" "}
                                        {productWord(confirmData.preview.length - PREVIEW_LIMIT)}
                                    </Text>
                                </div>
                            )}
                        </div>
                    </div>
                </ConfirmDialog>
            )}
        </div>
    );
};
