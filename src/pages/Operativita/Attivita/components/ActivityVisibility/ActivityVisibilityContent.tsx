import React, { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
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
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useTenantId } from "@/context/useTenantId";
import {
    getActivityProductOverrides,
    getRenderableCatalogForActivity,
    updateActivityProductVisibility,
    type ActivityProductOverride,
    type CatalogExplanationData,
    type ProductVisibilityState,
    type RenderableCatalog,
    type RenderableProduct
} from "@/services/supabase/activeCatalog";
import type { CustomerState } from "@/utils/catalogExplanation";
import { getDisplayPrice } from "@/utils/priceDisplay";
import { useToast } from "@/context/Toast/ToastContext";
import { useEnsureActive } from "@/hooks/useEnsureActive";
import styles from "./ActivityVisibilityContent.module.scss";

/** `manual` = le righe con una modifica a mano: il contenuto dello strato 4 (§19.4). */
type FilterValue = "all" | "visible" | "hidden" | "unavailable" | "manual";

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

// Con la spiegazione la prima voce dice cosa fa davvero (§19.4): toglie la
// modifica a mano e torna a quello che dicono le regole, che può essere
// «nascosto». Chiamarla «Visibile» sarebbe falso; la riga dice dove porta.
const EXPLAINED_OPTIONS: { value: ProductVisibilityState; label: string }[] = [
    { value: "visible", label: "Come dice la regola" },
    { value: "hidden", label: "Nascosto" },
    { value: "unavailable", label: "Non disponibile" }
];

/**
 * La spiegazione che la rotta ha letto (§50.20), solo con
 * `canExplainActivityCatalog`. Senza, la pagina legge da sé le sole
 * modifiche a mano, come prima della milestone 7.
 */
export type VisibilityExplanationSource = {
    data: CatalogExplanationData | null;
    loading: boolean;
    error: boolean;
    reload: (silent?: boolean) => Promise<void>;
};

type ActivityVisibilityContentProps = {
    activityId: string;
    explanation?: VisibilityExplanationSource;
    /** Sola lettura: il tri-stato e le azioni in blocco sono spenti (fieldset). */
    readOnly?: boolean;
};

/**
 * Sotto questa larghezza della pagina l'elenco va a una colonna: prodotto
 * (~200) + prezzo + tri-stato. Con la spiegazione prezzo 160 e tri-stato 424.
 */
const TABLE_MIN_WIDTH = { plain: 640, explained: 840 } as const;

/** Una riga dell'elenco, da qualunque delle due letture venga. */
type VisibilityRow = {
    productId: string;
    name: string;
    categoryName: string | null;
    price: string;
    /** Il listino barrato, quando la regola prezzi lo mostra al cliente. */
    originalPrice: string | null;
    /** «Prezzo dalla regola «X»». */
    priceNote: string | null;
    /** Il valore del tri-stato: la modifica a mano (`visible` = nessuna). */
    control: ProductVisibilityState;
    /** Lo stato su cui contano filtri e conteggi: per il cliente, se lo sappiamo. */
    state: CustomerState;
    /** Ha una modifica a mano, qualunque. */
    manual: boolean;
    note: string | null;
};

function rowsFromRenderable(
    products: RenderableProduct[],
    overrides: Record<string, ActivityProductOverride>
): VisibilityRow[] {
    return products.map(p => ({
        productId: p.product_id,
        name: p.name,
        categoryName: p.category_name ?? null,
        price: getDisplayPrice({ base_price: p.final_price, from_price: p.from_price }).label,
        originalPrice: null,
        priceNote: null,
        control: p.visibility_state,
        state: p.visibility_state,
        manual: overrides[p.product_id]?.visible_override != null,
        note: null
    }));
}

function rowsFromExplanation(data: CatalogExplanationData): VisibilityRow[] {
    return (data.explanation?.products ?? []).map(p => ({
        productId: p.productId,
        name: p.name,
        categoryName: p.categoryName,
        price: p.price ?? "—",
        originalPrice: p.originalPrice,
        priceNote: p.priceNote,
        control: p.manual === "hidden" || p.manual === "unavailable" ? p.manual : "visible",
        state: p.state,
        manual: p.manual !== null,
        note: p.note
    }));
}

/** La vista Ingredienti lavora sulle modifiche a mano, come le scrive il service. */
function renderableFromExplanation(data: CatalogExplanationData): {
    products: RenderableProduct[];
    overrides: Record<string, ActivityProductOverride>;
} {
    const products: RenderableProduct[] = [];
    const overrides: Record<string, ActivityProductOverride> = {};
    for (const p of data.explanation?.products ?? []) {
        const control: ProductVisibilityState = p.manual === "hidden" || p.manual === "unavailable" ? p.manual : "visible";
        products.push({
            product_id: p.productId,
            name: p.name,
            category_name: p.categoryName,
            final_price: null,
            from_price: null,
            visibility_state: control,
            is_visible: control !== "hidden"
        });
        if (p.manual !== null) {
            overrides[p.productId] = {
                visible_override: p.manual === "visible",
                price_override: null,
                mode: p.manual === "unavailable" ? "disable" : p.manual === "hidden" ? "hide" : null
            };
        }
    }
    return { products, overrides };
}

function plural(n: number, one: string, many: string): string {
    return n === 1 ? one : many;
}

/**
 * L'elenco di «Cosa vedono i clienti»: i prodotti del menù attivo con le
 * modifiche a mano (strato 4 del resolver), per prodotto o per ingrediente.
 * Con la spiegazione (§50.20) filtri e conteggi seguono lo stato per il
 * cliente e ogni riga dice chi l'ha deciso; senza, le sole modifiche a mano.
 */
export const ActivityVisibilityContent: React.FC<ActivityVisibilityContentProps> = ({
    activityId,
    explanation,
    readOnly = false
}) => {
    const explained = explanation !== undefined;
    const tenantId = useTenantId();
    const navigate = useNavigate();
    const { showToast } = useToast();
    const { ensureActive } = useEnsureActive();
    const [searchParams, setSearchParams] = useSearchParams();
    // Una colonna sola quando le tre non ci stanno (regola DataTable): prezzo
    // e tri-stato scendono sotto il nome. Si misura lo spazio della pagina,
    // non la finestra, come la Settimana e la matrice: con la spiegazione il
    // tri-stato e il prezzo sono più larghi e la soglia sale.
    // Sotto 768 la pagina scorre intera (ActivityDetailPage.module.scss): la
    // tabella non ha un'altezza da riempire, quindi una pagina da 10 righe
    // invece del calcolo «Auto», che senza altezza ne darebbe zero.
    const pageScrolls = useMediaQuery("(max-width: 767px)");
    const [box, setBox] = useState<HTMLDivElement | null>(null);
    const [isPhone, setIsPhone] = useState(false);
    useLayoutEffect(() => {
        if (!box) return;
        const min = explained ? TABLE_MIN_WIDTH.explained : TABLE_MIN_WIDTH.plain;
        const measure = () => setIsPhone(box.clientWidth < min);
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(box);
        return () => observer.disconnect();
    }, [box, explained]);

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

    const loadData = useCallback(async () => {
        if (!tenantId || explained) return;
        setIsLoading(true);
        setLoadError(false);
        try {
            const [cat, ovs] = await Promise.all([
                getRenderableCatalogForActivity(activityId, tenantId),
                getActivityProductOverrides(activityId)
            ]);
            setCatalog(cat);
            setOverrides(ovs);
        } catch (e) {
            // Un errore non è «Nessun catalogo attivo»: la pagina lo dice, con «Riprova».
            console.error("Error loading visibility data:", e);
            setLoadError(true);
        } finally {
            setIsLoading(false);
        }
    }, [activityId, tenantId, explained]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const reloadExplanation = explanation?.reload;

    // Reload silenzioso (niente skeleton): usato dopo il singolo cambio stato
    // e dopo le azioni in blocco della vista Ingredienti. Con la spiegazione
    // rilegge la rotta: banda ed elenco vengono dalla stessa lettura.
    const refreshData = useCallback(async () => {
        if (!tenantId) return;
        if (reloadExplanation) {
            await reloadExplanation(true);
            return;
        }
        const [cat, ovs] = await Promise.all([
            getRenderableCatalogForActivity(activityId, tenantId),
            getActivityProductOverrides(activityId)
        ]);
        setCatalog(cat);
        setOverrides(ovs);
    }, [activityId, tenantId, reloadExplanation]);

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

    const explanationData = explanation?.data ?? null;
    const rows = useMemo<VisibilityRow[]>(
        () => (explained ? (explanationData ? rowsFromExplanation(explanationData) : []) : rowsFromRenderable(catalog?.products ?? [], overrides)),
        [explained, explanationData, catalog, overrides]
    );
    // La vista Ingredienti e le sue conferme leggono le modifiche a mano.
    const ingredientSource = useMemo(
        () =>
            explained
                ? explanationData
                    ? renderableFromExplanation(explanationData)
                    : { products: [], overrides: {} }
                : { products: catalog?.products ?? [], overrides },
        [explained, explanationData, catalog, overrides]
    );

    const counts = useMemo(
        () => ({
            all: rows.length,
            visible: rows.filter(p => p.state === "visible").length,
            hidden: rows.filter(p => p.state === "hidden").length,
            unavailable: rows.filter(p => p.state === "unavailable").length,
            manual: rows.filter(p => p.manual).length
        }),
        [rows]
    );

    const filtered = useMemo(() => {
        const term = search.trim().toLowerCase();
        return rows.filter(p => {
            // Filtri mutuamente esclusivi sullo stato (unavailable NON è "visibile").
            if (filter === "manual" ? !p.manual : filter !== "all" && p.state !== filter) return false;
            if (!term) return true;
            const inName = p.name.toLowerCase().includes(term);
            const inCategory = p.categoryName?.toLowerCase().includes(term) ?? false;
            return inName || inCategory;
        });
    }, [rows, search, filter]);

    // Conteggi a vista, e a zero il filtro resta nella fila, spento.
    const filterOptions = useMemo<ChipOption<FilterValue>[]>(
        () => [
            { value: "all", label: "Tutti", count: counts.all },
            { value: "visible", label: "Visibili", count: counts.visible, disabled: counts.visible === 0 },
            { value: "hidden", label: "Nascosti", count: counts.hidden, disabled: counts.hidden === 0 },
            { value: "unavailable", label: "Non disponibili", count: counts.unavailable, disabled: counts.unavailable === 0 },
            // Il conteggio delle modifiche a mano sta qui, non in un badge sulla voce (§50.20, D5).
            { value: "manual", label: "Modificati a mano", count: counts.manual, disabled: counts.manual === 0 }
        ],
        [counts]
    );

    const columns = useMemo<ColumnDefinition<VisibilityRow>[]>(() => {
        // La provenienza (§19.4): sotto il nome, chi ha deciso lo stato.
        const note = (product: VisibilityRow) =>
            [product.note, product.priceNote].filter(Boolean).map(line => (
                <Text key={line} as="span" variant="caption" colorVariant="muted" className={styles.note}>
                    {line}
                </Text>
            ));
        // Il prezzo che vede il cliente; il listino barrato se la regola lo mostra.
        const price = (product: VisibilityRow) => (
            <>
                {product.originalPrice && (
                    <>
                        <s className={styles.listPrice}>
                            {product.originalPrice}
                        </s>{" "}
                    </>
                )}
                {product.price}
            </>
        );
        const control = (product: VisibilityRow) => (
            // Sola lettura come Prodotti: fieldset disabled, ma solo sul
            // controllo, così ricerca e filtri restano.
            <fieldset className={styles.readOnlyScope} disabled={readOnly}>
                <SegmentedControl<ProductVisibilityState>
                    value={product.control}
                    onChange={next => handleSetState(product.productId, next)}
                    size="sm"
                    options={explained ? EXPLAINED_OPTIONS : VISIBILITY_OPTIONS}
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
                                    {product.categoryName ? `${product.categoryName} · ` : ""}
                                    {price(product)}
                                </span>
                                {note(product)}
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
                        <span>{product.categoryName}</span>
                        {note(product)}
                    </div>
                )
            },
            {
                id: "price",
                header: "Prezzo",
                // Con il listino barrato accanto: due prezzi «da» non stanno in 100.
                width: "160px",
                align: "right",
                cell: (_, product) => (
                    <Text variant="body-sm" weight={500}>
                        {price(product)}
                    </Text>
                )
            },
            {
                id: "visibility",
                header: "Disponibilità",
                // Il tri-stato `sm` scritto è largo 280: con i 24 + 24 della
                // cella, 300 lo troncava e «Non disponibile» scorreva dentro.
                // «Come dice la regola» al posto di «Visibile» ne chiede 80 in più.
                width: explained ? "424px" : "344px",
                align: "right",
                cell: (_, product) => control(product)
            }
        ];
    }, [isPhone, readOnly, handleSetState, explained]);

    const showLoading = explained ? explanation.loading : isLoading;
    const showError = explained ? explanation.error : loadError;
    const retry = () => void (explained ? explanation.reload() : loadData());

    if (showLoading) {
        return <DataTable<VisibilityRow> ariaLabel="Prodotti del menù" data={[]} columns={columns} isLoading />;
    }

    if (showError) {
        return (
            <EmptyState
                variant="page"
                icon={<IconListDetails />}
                title="Non è stato possibile caricare la disponibilità"
                description="Controlla la connessione e riprova."
                action={
                    <Button variant="secondary" onClick={retry}>
                        Riprova
                    </Button>
                }
            />
        );
    }

    // Con la spiegazione il perché lo dice la banda («Cosa manca»): qui solo il vuoto.
    if (explained && !explanationData?.catalogId) {
        return (
            <EmptyState
                variant="inline"
                icon={<IconListDetails />}
                title="Nessun menù attivo"
                description="Quando una regola assegna un menù a questa sede, qui trovi i suoi prodotti."
            />
        );
    }

    if (!explained && (!catalog || !catalog.catalogId)) {
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

    if (rows.length === 0) {
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
        <div ref={setBox} className={styles.container}>
            <div className={styles.viewTabs}>
                <Tabs<VisibilityView> value={view} onChange={setView} variant="primary">
                    <Tabs.List>
                        <Tabs.Tab value="products" badge={rows.length}>
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
                    <DataTable<VisibilityRow>
                        ariaLabel="Prodotti del menù"
                        data={filtered}
                        columns={columns}
                        getRowId={p => p.productId}
                        pageSize={pageScrolls ? 10 : undefined}
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
                        products={ingredientSource.products}
                        overrides={ingredientSource.overrides}
                        onBulkApplied={refreshData}
                        onCountChange={setIngredientCount}
                        readOnly={readOnly}
                    />
                </div>
            )}
        </div>
    );
};
