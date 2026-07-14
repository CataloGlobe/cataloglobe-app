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
import { Tabs } from "@/components/ui/Tabs/Tabs";
import { ToolbarSearch } from "@/components/ui/ToolbarSearch";
import Skeleton from "@/components/ui/Skeleton/Skeleton";
import { ActivityVisibilityIngredients } from "./ActivityVisibilityIngredients";
import { useTenantId } from "@/context/useTenantId";
import {
    getActivityProductOverrides,
    getRenderableCatalogForActivity,
    updateActivityProductVisibility,
    type ActivityProductOverride,
    type ProductVisibilityState,
    type RenderableCatalog,
    type RenderableProduct
} from "@/services/supabase/activeCatalog";
import { getDisplayPrice } from "@/utils/priceDisplay";
import { useToast } from "@/context/Toast/ToastContext";
import styles from "./ActivityVisibilityContent.module.scss";

type FilterValue = "all" | "visible" | "hidden" | "unavailable";

/** Vista di primo livello del drawer: tabella prodotti o tabella ingredienti. */
export type VisibilityView = "products" | "ingredients";

const VISIBILITY_OPTIONS: {
    value: ProductVisibilityState;
    label: string;
    icon: React.ReactNode;
}[] = [
    { value: "visible", label: "Visibile", icon: <IconEye size={16} /> },
    { value: "hidden", label: "Nascosto", icon: <IconEyeOff size={16} /> },
    { value: "unavailable", label: "Non disponibile", icon: <IconClockExclamation size={16} /> }
];

// Testo del marker override accanto al nome prodotto (tooltip): specifica lo stato
// esatto invece del generico "Modificato", evitando l'ambiguità "modificato cosa?".
function overrideMarkerLabel(state: ProductVisibilityState): string {
    switch (state) {
        case "hidden":
            return "Nascosto manualmente";
        case "unavailable":
            return "Segnato come non disponibile";
        default:
            return "Reso visibile manualmente";
    }
}

export type VisibilityContentMeta = {
    catalogId: string | null;
    catalogName: string | null;
};

export type VisibilityCounts = {
    products: number;
    ingredients: number | null;
};

type ActivityVisibilityContentProps = {
    activityId: string;
    onMetaChange?: (meta: VisibilityContentMeta) => void;
    /**
     * Posizione del conteggio "N prodotti totali · N nascosti". Default
     * `"bottom"` (footer sotto la tabella — usato dal drawer, invariato). La
     * tab Disponibilità passa `"top"` per averlo vicino ai filtri.
     */
    countPlacement?: "top" | "bottom";
    /**
     * Tab Prodotti/Ingredienti controllate dal parent (es. header del drawer,
     * Direzione A) invece che renderizzate qui in corpo (Direzione B, default
     * — usato dalla tab Disponibilità inline, che non ha uno slot header
     * disponibile per ospitarle). Quando presente, il blocco Tabs interno
     * NON viene renderizzato: il parent lo fa altrove nel proprio layout.
     */
    view?: VisibilityView;
    onViewChange?: (view: VisibilityView) => void;
    /** Notifica i conteggi (prodotti/ingredienti) per il badge sulle tab del parent. */
    onCountsChange?: (counts: VisibilityCounts) => void;
};

export const ActivityVisibilityContent: React.FC<ActivityVisibilityContentProps> = ({
    activityId,
    onMetaChange,
    countPlacement = "bottom",
    view: controlledView,
    onViewChange,
    onCountsChange
}) => {
    const tenantId = useTenantId();
    const { showToast } = useToast();

    const [isLoading, setIsLoading] = useState(true);
    const [catalog, setCatalog] = useState<RenderableCatalog | null>(null);
    const [overrides, setOverrides] = useState<Record<string, ActivityProductOverride>>({});
    const [savingId, setSavingId] = useState<string | null>(null);
    const [search, setSearch] = useState("");
    const [filter, setFilter] = useState<FilterValue>("all");
    const [internalView, setInternalView] = useState<VisibilityView>("products");
    // Tab controllata dal parent (header drawer) se `view`/`onViewChange` sono
    // passati, altrimenti stato locale (uso di default, tab inline).
    const view = controlledView ?? internalView;
    // La vista Ingredienti monta al PRIMO ingresso nella tab e resta montata
    // (nascosta via CSS) allo switch: le sue due query lazy non si ripetono e
    // filtro/ricerca sopravvivono al cambio vista.
    const [ingredientsMounted, setIngredientsMounted] = useState(false);
    const [ingredientCount, setIngredientCount] = useState<number | null>(null);

    // Ancorato a `view` (non dentro `setView`): quando la tab è controllata dal
    // parent (drawer, Direzione A) il cambio vista passa da `onViewChange`, MAI
    // dalla funzione `setView` qui sotto — un mount-trigger dentro `setView`
    // non scattava mai in quel caso e il pannello Ingredienti restava smontato
    // (drawer vuoto al click su "Ingredienti").
    useEffect(() => {
        if (view === "ingredients") setIngredientsMounted(true);
    }, [view]);

    const setView = useCallback(
        (next: VisibilityView) => {
            if (onViewChange) onViewChange(next);
            else setInternalView(next);
        },
        [onViewChange]
    );

    const onMetaChangeRef = useRef(onMetaChange);
    useEffect(() => {
        onMetaChangeRef.current = onMetaChange;
    }, [onMetaChange]);

    const onCountsChangeRef = useRef(onCountsChange);
    useEffect(() => {
        onCountsChangeRef.current = onCountsChange;
    }, [onCountsChange]);

    useEffect(() => {
        onCountsChangeRef.current?.({
            products: catalog?.products.length ?? 0,
            ingredients: ingredientCount
        });
    }, [catalog, ingredientCount]);

    const loadData = useCallback(async () => {
        if (!tenantId) return;
        setIsLoading(true);
        try {
            const [cat, ovs] = await Promise.all([
                getRenderableCatalogForActivity(activityId, tenantId),
                getActivityProductOverrides(activityId)
            ]);
            setCatalog(cat);
            setOverrides(ovs);
            onMetaChangeRef.current?.({
                catalogId: cat.catalogId,
                catalogName: cat.catalogName
            });
        } catch (e) {
            console.error("Error loading visibility data:", e);
            showToast({ message: "Errore nel caricamento della disponibilità.", type: "error" });
        } finally {
            setIsLoading(false);
        }
    }, [activityId, tenantId, showToast]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    // Reload silenzioso (niente skeleton): usato dopo il singolo cambio stato
    // e dopo le azioni bulk della vista Ingredienti.
    const refreshData = useCallback(async () => {
        if (!tenantId) return;
        const [cat, ovs] = await Promise.all([
            getRenderableCatalogForActivity(activityId, tenantId),
            getActivityProductOverrides(activityId)
        ]);
        setCatalog(cat);
        setOverrides(ovs);
    }, [activityId, tenantId]);

    const handleSetState = async (productId: string, state: ProductVisibilityState) => {
        if (!tenantId) return;
        setSavingId(productId);
        try {
            await updateActivityProductVisibility(activityId, productId, state);
            await refreshData();
        } catch (e) {
            console.error("Error updating visibility:", e);
            showToast({ message: "Errore durante l'aggiornamento.", type: "error" });
        } finally {
            setSavingId(null);
        }
    };

    const filtered = useMemo(() => {
        const products = catalog?.products ?? [];
        const term = search.trim().toLowerCase();
        return products.filter(p => {
            // Tab mutuamente esclusive via visibility_state (unavailable NON è "visibile").
            if (filter === "visible" && p.visibility_state !== "visible") return false;
            if (filter === "hidden" && p.visibility_state !== "hidden") return false;
            if (filter === "unavailable" && p.visibility_state !== "unavailable") return false;
            if (!term) return true;
            const inName = p.name.toLowerCase().includes(term);
            const inCategory = p.category_name?.toLowerCase().includes(term) ?? false;
            return inName || inCategory;
        });
    }, [catalog, search, filter]);

    const hiddenCount = useMemo(
        () => (catalog?.products ?? []).filter(p => p.visibility_state === "hidden").length,
        [catalog]
    );

    const unavailableCount = useMemo(
        () => (catalog?.products ?? []).filter(p => p.visibility_state === "unavailable").length,
        [catalog]
    );

    const columns = useMemo<ColumnDefinition<RenderableProduct>[]>(
        () => [
            {
                id: "product",
                header: "Prodotto",
                width: "2fr",
                cell: (_, product) => {
                    const ov = overrides[product.product_id]?.visible_override;
                    const isOverridden = ov !== undefined && ov !== null;
                    return (
                        <div className={styles.productCell}>
                            <div className={styles.productNameRow}>
                                <Text weight={600} variant="body-sm">
                                    {product.name}
                                </Text>
                                {isOverridden && (
                                    <Tooltip content={overrideMarkerLabel(product.visibility_state)}>
                                        <span
                                            className={styles.overrideMarker}
                                            aria-label={overrideMarkerLabel(product.visibility_state)}
                                        >
                                            <IconAlertCircle size={15} />
                                        </span>
                                    </Tooltip>
                                )}
                            </div>
                            {product.category_name && (
                                <Text variant="caption" colorVariant="muted">
                                    {product.category_name}
                                </Text>
                            )}
                        </div>
                    );
                }
            },
            {
                id: "price",
                header: "Prezzo",
                width: "100px",
                align: "right",
                cell: (_, product) => (
                    <Text variant="body-sm" weight={500}>
                        {
                            getDisplayPrice({
                                base_price: product.final_price,
                                from_price: product.from_price
                            }).label
                        }
                    </Text>
                )
            },
            {
                id: "visibility",
                header: "Disponibilità",
                width: "156px",
                align: "right",
                cell: (_, product) => (
                    <div
                        className={styles.visibilityCell}
                        onClick={e => e.stopPropagation()}
                    >
                        <SegmentedControl<ProductVisibilityState>
                            value={product.visibility_state}
                            onChange={next => handleSetState(product.product_id, next)}
                            size="sm"
                            iconsOnly
                            options={VISIBILITY_OPTIONS}
                        />
                    </div>
                )
            }
        ],
        [overrides]
    );

    if (isLoading) {
        return (
            <div className={styles.loading}>
                <Skeleton height={40} />
                <Skeleton height={40} />
                <Skeleton height={40} />
            </div>
        );
    }

    if (!catalog || !catalog.catalogId) {
        return (
            <div className={styles.emptyState}>
                <Text variant="body" weight={600}>
                    Nessun catalogo attivo
                </Text>
                <Text variant="body-sm" colorVariant="muted">
                    Le impostazioni di disponibilità saranno disponibili quando una regola di
                    programmazione assegnerà un catalogo a questa sede.
                </Text>
            </div>
        );
    }

    if (catalog.products.length === 0) {
        return (
            <div className={styles.emptyState}>
                <Text variant="body" weight={600}>
                    Catalogo senza prodotti
                </Text>
                <Text variant="body-sm" colorVariant="muted">
                    Il catalogo attivo non contiene prodotti.
                </Text>
            </div>
        );
    }

    const countText = (
        <Text variant="caption" colorVariant="muted">
            {catalog.products.length} prodotti totali · {hiddenCount} nascost
            {hiddenCount === 1 ? "o" : "i"}
            {unavailableCount > 0 && ` · ${unavailableCount} non disponibil${unavailableCount === 1 ? "e" : "i"}`}
        </Text>
    );

    // Tab Prodotti/Ingredienti: se il parent le controlla (header del drawer,
    // Direzione A) non le renderizziamo qui. Altrimenti (uso di default, tab
    // Disponibilità inline — niente slot header disponibile per ospitarle,
    // vedi verifica Task 0) Direzione B: eyebrow "Vista" + pill piena, così da
    // pesare visivamente più del filtro di stato sotto (subordinato).
    const viewTabs = controlledView === undefined && (
        <div className={styles.viewSwitch}>
            <Text variant="caption" colorVariant="muted" className={styles.viewSwitchLabel}>
                Vista
            </Text>
            <Tabs<VisibilityView> value={view} onChange={setView} variant="secondary">
                <Tabs.List>
                    <Tabs.Tab value="products" badge={catalog.products.length}>
                        Prodotti
                    </Tabs.Tab>
                    <Tabs.Tab value="ingredients" badge={ingredientCount ?? undefined}>
                        Ingredienti
                    </Tabs.Tab>
                </Tabs.List>
            </Tabs>
        </div>
    );

    return (
        <div className={styles.container}>
            {viewTabs}

            <div className={view === "products" ? styles.viewPanel : styles.viewPanelHidden}>
                <div className={styles.toolbar}>
                    <SegmentedControl<FilterValue>
                        value={filter}
                        onChange={setFilter}
                        options={[
                            { value: "all", label: "Tutti" },
                            { value: "visible", label: "Visibili" },
                            { value: "hidden", label: "Nascosti" },
                            { value: "unavailable", label: "Non disponibili" }
                        ]}
                    />
                    <div className={styles.searchSlot}>
                        <ToolbarSearch
                            value={search}
                            onChange={setSearch}
                            placeholder="Cerca prodotto…"
                        />
                    </div>
                </div>

                {countPlacement === "top" && (
                    <div className={styles.countTop}>{countText}</div>
                )}

                {filtered.length === 0 ? (
                    <div className={styles.emptyFilter}>
                        <Text variant="body-sm" colorVariant="muted">
                            Nessun prodotto corrispondente ai filtri.
                        </Text>
                    </div>
                ) : (
                    <div className={styles.tableWrapper}>
                        <DataTable
                            data={filtered}
                            columns={columns}
                            getRowId={p => p.product_id}
                            disabledRowIds={savingId ? [savingId] : []}
                        />
                    </div>
                )}

                {countPlacement === "bottom" && (
                    <div className={styles.footer}>{countText}</div>
                )}
            </div>

            {ingredientsMounted && tenantId && (
                <div
                    className={view === "ingredients" ? styles.viewPanel : styles.viewPanelHidden}
                >
                    <ActivityVisibilityIngredients
                        activityId={activityId}
                        tenantId={tenantId}
                        products={catalog.products}
                        overrides={overrides}
                        onBulkApplied={refreshData}
                        onCountChange={setIngredientCount}
                    />
                </div>
            )}
        </div>
    );
};
