import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { IconListDetails } from "@tabler/icons-react";
import Text from "@/components/ui/Text/Text";
import { Button } from "@/components/ui/Button/Button";
import { ChipGroupSingle, type ChipOption } from "@/components/ui/Chip/ChipGroup";
import { DataTable, DATA_TABLE_CLASSES, type ColumnDefinition } from "@/components/ui/DataTable/DataTable";
import { EmptyState } from "@/components/ui/EmptyState/EmptyState";
import { SegmentedControl } from "@/components/ui/SegmentedControl/SegmentedControl";
import { Tabs } from "@/components/ui/Tabs/Tabs";
import { ToolbarSearch } from "@/components/ui/ToolbarSearch";
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
import { useEnsureActive } from "@/hooks/useEnsureActive";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import styles from "./ActivityVisibilityContent.module.scss";

type FilterValue = "all" | "visible" | "hidden" | "unavailable";

/** Le due viste della pagina: tabella prodotti o tabella ingredienti. */
type VisibilityView = "products" | "ingredients";

/**
 * La vista nell'URL (D4): resta al refresh e si può linkare. `?vista=` e non
 * `?tab=`: la scheda della sede reindirizza i vecchi `?tab=` (ActivityDetailPage).
 */
const VIEW_PARAM = "vista";
const INGREDIENTS_PARAM_VALUE = "ingredienti";

// I tre stati con l'etichetta scritta (§19.4, D3): tre icone senza legenda
// visibile non si leggevano, e i filtri sopra erano già a parole.
const VISIBILITY_OPTIONS: { value: ProductVisibilityState; label: string }[] = [
    { value: "visible", label: "Visibile" },
    { value: "hidden", label: "Nascosto" },
    { value: "unavailable", label: "Non disponibile" }
];

export type VisibilityContentMeta = {
    catalogId: string | null;
    catalogName: string | null;
};

type ActivityVisibilityContentProps = {
    activityId: string;
    onMetaChange?: (meta: VisibilityContentMeta) => void;
    /** Dopo ogni scrittura riuscita: la banda dell'esito si rilegge. */
    onChanged?: () => void;
    /** Sola lettura: il tri-stato e le azioni in blocco sono spenti (fieldset). */
    readOnly?: boolean;
};

function plural(n: number, one: string, many: string): string {
    return n === 1 ? one : many;
}

/**
 * Disponibilità della sede: le modifiche a mano (strato 4 del resolver) sui
 * prodotti del menù attivo, per prodotto o per ingrediente. La pagina «Cosa
 * vedono i clienti» (§19: esito, catena, provenienza) è la milestone 7.
 */
export const ActivityVisibilityContent: React.FC<ActivityVisibilityContentProps> = ({
    activityId,
    onMetaChange,
    onChanged,
    readOnly = false
}) => {
    const tenantId = useTenantId();
    const navigate = useNavigate();
    const { showToast } = useToast();
    const { ensureActive } = useEnsureActive();
    const [searchParams, setSearchParams] = useSearchParams();
    // Sul telefono una colonna sola (regola DataTable): prezzo e tri-stato
    // scendono sotto il nome. Colonne scelte qui, non duplicate in CSS.
    const isPhone = useMediaQuery("(max-width: 767px)");

    const [isLoading, setIsLoading] = useState(true);
    const [loadError, setLoadError] = useState(false);
    const [catalog, setCatalog] = useState<RenderableCatalog | null>(null);
    const [overrides, setOverrides] = useState<Record<string, ActivityProductOverride>>({});
    const [savingId, setSavingId] = useState<string | null>(null);
    const [search, setSearch] = useState("");
    const [filter, setFilter] = useState<FilterValue>("all");
    const view: VisibilityView = searchParams.get(VIEW_PARAM) === INGREDIENTS_PARAM_VALUE ? "ingredients" : "products";
    // La vista Ingredienti monta al PRIMO ingresso e resta montata (nascosta
    // via CSS) al cambio: le sue due query lazy non si ripetono e filtro e
    // ricerca sopravvivono.
    const [ingredientsMounted, setIngredientsMounted] = useState(view === "ingredients");
    const [ingredientCount, setIngredientCount] = useState<number | null>(null);

    useEffect(() => {
        if (view === "ingredients") setIngredientsMounted(true);
    }, [view]);

    const setView = useCallback(
        (next: VisibilityView) => {
            setSearchParams(
                prev => {
                    if (next === "ingredients") prev.set(VIEW_PARAM, INGREDIENTS_PARAM_VALUE);
                    else prev.delete(VIEW_PARAM);
                    return prev;
                },
                { replace: true }
            );
        },
        [setSearchParams]
    );

    const onMetaChangeRef = useRef(onMetaChange);
    useEffect(() => {
        onMetaChangeRef.current = onMetaChange;
    }, [onMetaChange]);

    const loadData = useCallback(async () => {
        if (!tenantId) return;
        setIsLoading(true);
        setLoadError(false);
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
            // Un errore non è «Nessun catalogo attivo»: la pagina lo dice, con «Riprova».
            console.error("Error loading visibility data:", e);
            setLoadError(true);
        } finally {
            setIsLoading(false);
        }
    }, [activityId, tenantId]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const onChangedRef = useRef(onChanged);
    useEffect(() => {
        onChangedRef.current = onChanged;
    }, [onChanged]);

    // Reload silenzioso (niente skeleton): usato dopo il singolo cambio stato
    // e dopo le azioni in blocco della vista Ingredienti.
    const refreshData = useCallback(async () => {
        if (!tenantId) return;
        onChangedRef.current?.();
        const [cat, ovs] = await Promise.all([
            getRenderableCatalogForActivity(activityId, tenantId),
            getActivityProductOverrides(activityId)
        ]);
        setCatalog(cat);
        setOverrides(ovs);
    }, [activityId, tenantId]);

    const handleSetState = useCallback(
        async (productId: string, state: ProductVisibilityState) => {
            if (!tenantId || readOnly || !ensureActive()) return;
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
        },
        [tenantId, readOnly, ensureActive, activityId, refreshData, showToast]
    );

    const products = useMemo(() => catalog?.products ?? [], [catalog]);

    const counts = useMemo(
        () => ({
            all: products.length,
            visible: products.filter(p => p.visibility_state === "visible").length,
            hidden: products.filter(p => p.visibility_state === "hidden").length,
            unavailable: products.filter(p => p.visibility_state === "unavailable").length
        }),
        [products]
    );

    const filtered = useMemo(() => {
        const term = search.trim().toLowerCase();
        return products.filter(p => {
            // Filtri mutuamente esclusivi via visibility_state (unavailable NON è "visibile").
            if (filter !== "all" && p.visibility_state !== filter) return false;
            if (!term) return true;
            const inName = p.name.toLowerCase().includes(term);
            const inCategory = p.category_name?.toLowerCase().includes(term) ?? false;
            return inName || inCategory;
        });
    }, [products, search, filter]);

    // Conteggi a vista, e a zero il filtro resta nella fila, spento.
    const filterOptions = useMemo<ChipOption<FilterValue>[]>(
        () => [
            { value: "all", label: "Tutti", count: counts.all },
            { value: "visible", label: "Visibili", count: counts.visible, disabled: counts.visible === 0 },
            { value: "hidden", label: "Nascosti", count: counts.hidden, disabled: counts.hidden === 0 },
            { value: "unavailable", label: "Non disponibili", count: counts.unavailable, disabled: counts.unavailable === 0 }
        ],
        [counts]
    );

    const columns = useMemo<ColumnDefinition<RenderableProduct>[]>(() => {
        const priceOf = (product: RenderableProduct) =>
            getDisplayPrice({ base_price: product.final_price, from_price: product.from_price }).label;
        const control = (product: RenderableProduct) => (
            // Sola lettura come Prodotti: fieldset disabled, ma solo sul
            // controllo, così ricerca e filtri restano.
            <fieldset className={styles.readOnlyScope} disabled={readOnly}>
                <SegmentedControl<ProductVisibilityState>
                    value={product.visibility_state}
                    onChange={next => handleSetState(product.product_id, next)}
                    size="sm"
                    options={VISIBILITY_OPTIONS}
                />
            </fieldset>
        );
        if (isPhone) {
            return [
                {
                    id: "product",
                    header: "Prodotto",
                    width: "minmax(0, 1fr)",
                    cell: (_, product) => (
                        <div className={styles.productCell}>
                            <div className={`${DATA_TABLE_CLASSES.cellTwoLine} ${DATA_TABLE_CLASSES.cellTwoLineWrap}`}>
                                <span>{product.name}</span>
                                <span>
                                    {[product.category_name, priceOf(product)].filter(Boolean).join(" · ")}
                                </span>
                            </div>
                            {control(product)}
                        </div>
                    )
                }
            ];
        }
        return [
            {
                id: "product",
                header: "Prodotto",
                width: "minmax(0, 2fr)",
                cell: (_, product) => (
                    <div className={DATA_TABLE_CLASSES.cellTwoLine}>
                        <span>{product.name}</span>
                        <span>{product.category_name}</span>
                    </div>
                )
            },
            {
                id: "price",
                header: "Prezzo",
                width: "100px",
                align: "right",
                cell: (_, product) => (
                    <Text variant="body-sm" weight={500}>
                        {priceOf(product)}
                    </Text>
                )
            },
            {
                id: "visibility",
                header: "Disponibilità",
                // Il tri-stato `sm` scritto è largo 280: con i 24 + 24 della
                // cella, 300 lo troncava e «Non disponibile» scorreva dentro.
                width: "344px",
                align: "right",
                cell: (_, product) => control(product)
            }
        ];
    }, [isPhone, readOnly, handleSetState]);

    if (isLoading) {
        return <DataTable<RenderableProduct> ariaLabel="Prodotti del menù" data={[]} columns={columns} isLoading />;
    }

    if (loadError) {
        return (
            <EmptyState
                variant="page"
                icon={<IconListDetails />}
                title="Non è stato possibile caricare la disponibilità"
                description="Controlla la connessione e riprova."
                action={
                    <Button variant="secondary" onClick={() => void loadData()}>
                        Riprova
                    </Button>
                }
            />
        );
    }

    if (!catalog || !catalog.catalogId) {
        return (
            <EmptyState
                variant="page"
                icon={<IconListDetails />}
                title="Nessun catalogo attivo"
                description="La disponibilità si gestisce quando una regola di programmazione assegna un menù a questa sede."
                action={
                    <Button variant="secondary" onClick={() => navigate(`/business/${tenantId}/scheduling`)}>
                        Vai a Programmazione
                    </Button>
                }
            />
        );
    }

    if (catalog.products.length === 0) {
        return (
            <EmptyState
                variant="inline"
                icon={<IconListDetails />}
                title="Catalogo senza prodotti"
                description="Il catalogo attivo non contiene prodotti."
            />
        );
    }

    const countText = [
        `${counts.all} ${plural(counts.all, "prodotto totale", "prodotti totali")}`,
        `${counts.hidden} ${plural(counts.hidden, "nascosto", "nascosti")}`,
        counts.unavailable > 0
            ? `${counts.unavailable} ${plural(counts.unavailable, "non disponibile", "non disponibili")}`
            : null
    ]
        .filter(Boolean)
        .join(" · ");

    const isFiltered = filter !== "all" || search.trim() !== "";

    return (
        <div className={styles.container}>
            <div className={styles.viewTabs}>
                <Tabs<VisibilityView> value={view} onChange={setView} variant="primary">
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

            <div className={view === "products" ? styles.viewPanel : styles.viewPanelHidden}>
                <div className={styles.toolbar}>
                    <ChipGroupSingle<FilterValue>
                        ariaLabel="Filtra per stato"
                        layout="auto"
                        shape="pill"
                        value={filter}
                        onChange={setFilter}
                        options={filterOptions}
                    />
                    <div className={styles.searchSlot}>
                        <ToolbarSearch value={search} onChange={setSearch} placeholder="Cerca prodotto…" />
                    </div>
                </div>

                <Text variant="caption" colorVariant="muted">
                    {countText}
                </Text>

                <div className={styles.tableWrapper}>
                    <DataTable<RenderableProduct>
                        ariaLabel="Prodotti del menù"
                        data={filtered}
                        columns={columns}
                        getRowId={p => p.product_id}
                        disabledRowIds={savingId ? [savingId] : []}
                        isFiltered={isFiltered}
                        onClearFilters={() => {
                            setFilter("all");
                            setSearch("");
                        }}
                        emptyState={{ title: "Nessun prodotto corrispondente ai filtri" }}
                    />
                </div>
            </div>

            {ingredientsMounted && tenantId && (
                <div className={view === "ingredients" ? styles.viewPanel : styles.viewPanelHidden}>
                    <ActivityVisibilityIngredients
                        activityId={activityId}
                        tenantId={tenantId}
                        products={catalog.products}
                        overrides={overrides}
                        onBulkApplied={refreshData}
                        onCountChange={setIngredientCount}
                        readOnly={readOnly}
                    />
                </div>
            )}
        </div>
    );
};
