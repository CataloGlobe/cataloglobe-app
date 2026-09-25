import { useCallback, useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Tabs } from "@/components/ui/Tabs/Tabs";
import { usePageHeader } from "@/context/usePageHeader";
import { useTenantId } from "@/context/useTenantId";
import { useTenant } from "@/context/useTenant";
import { useToast } from "@/context/Toast/ToastContext";
import { useVerticalConfig } from "@/hooks/useVerticalConfig";
import {
    useFilteredProductTabs,
    type ProductTabDef
} from "@/hooks/useFilteredProductTabs";
import { useEnsureActive } from "./hooks/useEnsureActive";
import { usePermissions } from "@/context/PermissionsContext";
import { canDoOnTenant } from "@/lib/permissions";
import { PageGate } from "@/components/PageGate/PageGate";
import { ToolbarSearch } from "@/components/ui/ToolbarSearch";
import { ChipGroupSingle } from "@/components/ui/Chip/ChipGroup";
import { SegmentedControl } from "@/components/ui/SegmentedControl/SegmentedControl";
import { DataTable, DATA_TABLE_CLASSES, type ColumnDefinition } from "@/components/ui/DataTable/DataTable";
import { CardGrid, CardGridItem } from "@/components/ui/CardGrid";
import { FramedMedia } from "@components/ui/FramedMedia";
import { Badge } from "@/components/ui/Badge/Badge";
import { Button } from "@/components/ui/Button/Button";
import type { PageHeaderAction, PageHeaderCompactConfig } from "@/context/PageHeaderContext";
import { IconChevronDown, IconChevronRight } from "@tabler/icons-react";
import { Package, LayoutGrid, List as ListIcon } from "lucide-react";
import { TableRowActions } from "@/components/ui/TableRowActions/TableRowActions";
import { Link } from "react-router-dom";
import { ProductRowMeta } from "./components/ProductRowMeta";
import { PRODUCT_IMAGE_DEFAULT_FRAMING } from "./components/productImageFraming";
import { describeFormats, describeMenus, describePrice } from "./productRowSummary";
import styles from "./Products.module.scss";

import {
    listBaseProductsWithVariants,
    V2Product,
    duplicateProduct,
    deleteProduct,
    getProductListMetadata,
    ProductListMetadata
} from "@/services/supabase/products";

import {
    getProductIssues,
    type ProductCompletenessFacts,
    type ProductIssues
} from "@/utils/productCompleteness";

import { EmptyState } from "@/components/ui/EmptyState/EmptyState";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog/ConfirmDialog";
import { useBulkDelete } from "./hooks/useBulkDelete";
import { ProductCreateEditDrawer, ProductFormMode } from "./ProductCreateEditDrawer";
import { ProductDeleteDrawer } from "./ProductDeleteDrawer";
import ProductGroupsTab from "@/components/Products/ProductGroupsTab/ProductGroupsTab";
import { ProductsAttributesTab } from "./ProductsAttributesTab";
import { Ingredients } from "./Ingredients/Ingredients";

type ProductTableRow = {
    id: string; // Add id for DataTable selection
    kind: "base" | "variant";
    product: V2Product;
    parent?: V2Product;
    hasVariants: boolean;
    visibleVariants: V2Product[];
    isExpanded: boolean;
};

const EMPTY_PRODUCT_METADATA: ProductListMetadata = {
    formatsCount: 0,
    configurationsCount: 0,
    catalogsCount: 0,
    fromPrice: null,
    toPrice: null,
    pricedFormatsCount: 0
};

/** Valori del filtro "mancanze" in header. */
type IssueFilter = "all" | "missing-price" | "out-of-catalog";

export default function Products() {
    const currentTenantId = useTenantId();
    const navigate = useNavigate();
    const { selectedTenant } = useTenant();
    const { showToast } = useToast();
    const verticalConfig = useVerticalConfig();
    // "Fuori menù" per food & beverage, "Fuori catalogo" per retail/hotel:
    // `catalogLabel` è capitalizzato (è una label di navigazione), qui vive
    // dentro una frase → stessa minuscola già usata da `catalogLower` in
    // Catalogs.tsx. Le card in griglia rileggono l'hook per conto loro.
    const outOfCatalogLabel = `Fuori ${verticalConfig.catalogLabel.toLowerCase()}`;
    const { canEdit, ensureActive } = useEnsureActive();
    const { permissions } = usePermissions();
    const canWriteProduct = permissions != null ? canDoOnTenant(permissions, "products.write") : false;
    const canWriteAttribute = permissions != null ? canDoOnTenant(permissions, "attributes.write") : false;

    const [isLoading, setIsLoading] = useState(true);
    const [loadError, setLoadError] = useState(false);
    const [allProducts, setAllProducts] = useState<V2Product[]>([]);
    const [productMetadata, setProductMetadata] = useState<Record<string, ProductListMetadata>>({});
    const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

    type ProductsTab = "products" | "groups" | "attributes" | "ingredients";
    const allTabs = useMemo<ProductTabDef<ProductsTab>[]>(
        () => [
            { value: "products", label: verticalConfig.productLabelPlural },
            { value: "groups", label: "Gruppi" },
            {
                value: "attributes",
                label: verticalConfig.copy.productSections.customAttributes,
                gated: c => c.productSections.customAttributes
            },
            {
                value: "ingredients",
                label: verticalConfig.copy.productSections.ingredients,
                gated: c => c.productSections.ingredients
            }
        ],
        [verticalConfig]
    );
    const { visibleTabs, initialTab } = useFilteredProductTabs<ProductsTab>(allTabs, "products");
    const [activeTab, setActiveTab] = useState<ProductsTab>(initialTab);
    const [isCreateGroupOpen, setCreateGroupOpen] = useState(false);
    const [attrCreateSeq, setAttrCreateSeq] = useState(0);
    const [ingredientCreateSeq, setIngredientCreateSeq] = useState(0);

    // Filter State
    const [searchQuery, setSearchQuery] = useState("");
    /**
     * Filtro sulle mancanze: vale per entrambe le viste, lista e griglia.
     * Mutuamente esclusivo (le due pill precedenti erano in OR): su staging
     * solo 6 prodotti su 744 hanno entrambe le mancanze e i due insiemi sono
     * quasi disgiunti, quindi la combinazione non paga un secondo controllo.
     */
    const [issueFilter, setIssueFilter] = useState<IssueFilter>("all");
    const [groupsSearchQuery, setGroupsSearchQuery] = useState("");
    const [ingredientsSearchQuery, setIngredientsSearchQuery] = useState("");
    const [attributesSearchQuery, setAttributesSearchQuery] = useState("");
    const [viewMode, setViewMode] = useState<"list" | "grid">(() => {
        const saved = localStorage.getItem("products_view_mode");
        // Lista di default (§50.9/1): la riga del mockup dice prezzo e menù
        // a colpo d'occhio; la griglia resta, e la scelta si ricorda.
        return (saved === "list" || saved === "grid") ? saved : "list";
    });

    // Drawer States
    const [isCreateEditOpen, setIsCreateEditOpen] = useState(false);
    const [createEditMode, setCreateEditMode] = useState<ProductFormMode>("create_base");
    const [productToEdit, setProductToEdit] = useState<V2Product | null>(null);
    const [parentForVariant, setParentForVariant] = useState<V2Product | null>(null);

    const [isDeleteOpen, setIsDeleteOpen] = useState(false);
    const [productToDelete, setProductToDelete] = useState<V2Product | null>(null);

    const loadData = useCallback(async () => {
        if (!currentTenantId) return;
        try {
            setIsLoading(true);
            setLoadError(false);
            const data = await listBaseProductsWithVariants(currentTenantId);
            setAllProducts(data);
            const baseProductIds = data.map(p => p.id);
            const variantIds = data.flatMap(p => p.variants?.map(v => v.id) ?? []);

            try {
                const metadata = await getProductListMetadata(currentTenantId, [...baseProductIds, ...variantIds]);
                setProductMetadata(metadata);
            } catch {
                setProductMetadata({});
                showToast({
                    message: "Alcuni dati prodotto non sono disponibili al momento.",
                    type: "info"
                });
            }
        } catch (error) {
            // Un errore non è un elenco vuoto: la pagina lo dice, con «Riprova».
            console.error("Caricamento prodotti:", error);
            setLoadError(true);
        } finally {
            setIsLoading(false);
        }
    }, [currentTenantId, showToast]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    // Fatti sulle mancanze di un prodotto, letti dai dati già in memoria dopo
    // `loadData`: `base_price` dalla riga, formati prezzati e menù dal
    // metadata. Nessuna query in più.
    const factsFor = useCallback(
        (product: V2Product): ProductCompletenessFacts => {
            const meta = productMetadata[product.id] ?? EMPTY_PRODUCT_METADATA;
            return {
                basePrice: product.base_price,
                pricedFormatsCount: meta.pricedFormatsCount,
                catalogsCount: meta.catalogsCount
            };
        },
        [productMetadata]
    );

    // I filtri lavorano sul prodotto base, che è l'unità di entrambe le viste:
    // matcha se la mancanza è sua o di almeno una sua variante, così la
    // riga/card che porta il badge non sparisce mai dal risultato.
    const productIssues = useCallback(
        (product: V2Product): ProductIssues => {
            const parentFacts = factsFor(product);
            const own = getProductIssues(parentFacts);
            const variantIssues = (product.variants ?? []).map(variant =>
                getProductIssues(factsFor(variant), parentFacts)
            );
            return {
                missingPrice: own.missingPrice || variantIssues.some(i => i.missingPrice),
                outOfCatalog: own.outOfCatalog || variantIssues.some(i => i.outOfCatalog)
            };
        },
        [factsFor]
    );

    const filteredProducts = useMemo(() => {
        return allProducts.filter(product => {
            // Search filter
            if (searchQuery && !product.name.toLowerCase().includes(searchQuery.toLowerCase())) {
                // Check if any variant matches
                const variantsMatch = product.variants?.some(v =>
                    v.name.toLowerCase().includes(searchQuery.toLowerCase())
                );
                if (!variantsMatch) return false;
            }
            // Mancanze: una sola alla volta, quella scelta nel select.
            if (issueFilter !== "all") {
                const issues = productIssues(product);
                const matches =
                    issueFilter === "missing-price"
                        ? issues.missingPrice
                        : issues.outOfCatalog;
                if (!matches) return false;
            }
            return true;
        });
    }, [allProducts, searchQuery, issueFilter, productIssues]);

    // Discriminante dell'empty state: true se ALMENO un filtro che concorre a
    // `filteredProducts` è attivo. Nuovi filtri vanno aggiunti qui oltre che
    // nel useMemo sopra, così il copy "nessun risultato" non viene mai
    // scambiato per "vuoto assoluto".
    const hasActiveFilter = searchQuery.trim().length > 0 || issueFilter !== "all";

    // Conteggi sul set completo (non su `filteredProducts`): sono i numeri che
    // i filtri promettono di mostrare, e non devono cambiare mentre si cerca.
    const issueCounts = useMemo(() => {
        let missingPrice = 0;
        let outOfCatalog = 0;
        for (const product of allProducts) {
            const issues = productIssues(product);
            if (issues.missingPrice) missingPrice += 1;
            if (issues.outOfCatalog) outOfCatalog += 1;
        }
        return { missingPrice, outOfCatalog };
    }, [allProducts, productIssues]);

    // Tre chip sempre a vista (§25.3): un difetto non si cerca in un menu a
    // tendina. A zero il chip resta nella fila, spento: sparire cambierebbe
    // la fila mentre si lavora, e sceglierlo porterebbe a un elenco vuoto.
    const issueFilterOptions = useMemo(
        () => [
            { value: "all" as const, label: "Tutti", count: allProducts.length },
            {
                value: "missing-price" as const,
                label: "Senza prezzo",
                count: issueCounts.missingPrice,
                disabled: issueCounts.missingPrice === 0 && issueFilter !== "missing-price",
                tone: issueCounts.missingPrice > 0 ? ("warning" as const) : undefined
            },
            {
                value: "out-of-catalog" as const,
                label: outOfCatalogLabel,
                count: issueCounts.outOfCatalog,
                disabled: issueCounts.outOfCatalog === 0 && issueFilter !== "out-of-catalog",
                tone: issueCounts.outOfCatalog > 0 ? ("warning" as const) : undefined
            }
        ],
        [allProducts.length, issueCounts, issueFilter, outOfCatalogLabel]
    );

    const tableRows = useMemo<ProductTableRow[]>(() => {
        const rows: ProductTableRow[] = [];

        filteredProducts.forEach(product => {
            const hasVariants = Boolean(product.variants?.length);
            const isExpanded = expandedRows.has(product.id);
            const visibleVariants = product.variants || [];

            rows.push({
                id: product.id,
                kind: "base",
                product,
                hasVariants,
                visibleVariants,
                isExpanded
            });

            if (isExpanded) {
                visibleVariants.forEach(variant => {
                    rows.push({
                        id: variant.id,
                        kind: "variant",
                        product: variant,
                        parent: product,
                        hasVariants: false,
                        visibleVariants: [],
                        isExpanded: false
                    });
                });
            }
        });

        return rows;
    }, [filteredProducts, expandedRows]);

    // Lo spazio del chevron solo se almeno un prodotto ha varianti: allinea i
    // nomi senza rientrare tutte le righe per niente.
    const anyVariants = useMemo(() => filteredProducts.some(p => (p.variants?.length ?? 0) > 0), [filteredProducts]);

    // Le varianti aperte sotto il padre: righe con il fondo spento.
    const variantRowIds = useMemo(
        () => tableRows.filter(row => row.kind === "variant").map(row => row.id),
        [tableRows]
    );

    // Id completi (pre-ricerca) per la prune-selection: stessa logica di
    // espansione varianti, ma su allProducts invece del set filtrato.
    const allTableRowIds = useMemo(() => {
        const ids: string[] = [];
        allProducts.forEach(product => {
            ids.push(product.id);
            if (expandedRows.has(product.id)) {
                (product.variants || []).forEach(variant => ids.push(variant.id));
            }
        });
        return ids;
    }, [allProducts, expandedRows]);

    // Handlers
    const handleCreateBase = useCallback(() => {
        if (!ensureActive()) return;
        setCreateEditMode("create_base");
        setProductToEdit(null);
        setParentForVariant(null);
        setIsCreateEditOpen(true);
    }, [ensureActive]);

    const handleTabChange = useCallback((val: ProductsTab) => {
        setActiveTab(val);
    }, []);

    const handleViewChange = useCallback((v: "list" | "grid") => {
        setViewMode(v);
        localStorage.setItem("products_view_mode", v);
    }, []);

    // ── Header slot: leading (tabs controllati) + actions (search/view/CTA) ──
    const leading = useMemo(() => (
        <Tabs<ProductsTab>
            value={activeTab}
            onChange={handleTabChange}
            variant="line"
        >
            <Tabs.List>
                {visibleTabs.map(tab => (
                    <Tabs.Tab key={tab.value} value={tab.value}>
                        {tab.label}
                    </Tabs.Tab>
                ))}
            </Tabs.List>
        </Tabs>
    ), [activeTab, handleTabChange, visibleTabs]);

    // Una sola azione per collezione, dichiarata a dati una volta e letta sia
    // dalla testata comoda sia da quella compatta (come Sedi).
    const ctaAction = useMemo<PageHeaderAction | undefined>(
        () =>
            activeTab === "products" && canWriteProduct
                ? { label: `Crea ${verticalConfig.productLabel.toLowerCase()}`, onClick: handleCreateBase, disabled: !canEdit }
                : activeTab === "groups" && canWriteProduct
                ? { label: "Crea gruppo", onClick: () => setCreateGroupOpen(true), disabled: !canEdit }
                : activeTab === "attributes" && canWriteAttribute
                ? { label: "Nuovo attributo", onClick: () => setAttrCreateSeq(n => n + 1), disabled: !canEdit }
                : activeTab === "ingredients" && verticalConfig.productSections.ingredients && canWriteProduct
                ? { label: "Crea ingrediente", onClick: () => setIngredientCreateSeq(n => n + 1), disabled: !canEdit }
                : undefined,
        [activeTab, canWriteProduct, canWriteAttribute, canEdit, verticalConfig, handleCreateBase]
    );

    // La ricerca della collezione aperta: una sola `ToolbarSearch` in testata.
    const collectionSearch = useMemo(
        () =>
            activeTab === "groups"
                ? { value: groupsSearchQuery, onChange: setGroupsSearchQuery, placeholder: "Cerca gruppo..." }
                : activeTab === "ingredients"
                ? { value: ingredientsSearchQuery, onChange: setIngredientsSearchQuery, placeholder: "Cerca ingrediente..." }
                : activeTab === "attributes"
                ? { value: attributesSearchQuery, onChange: setAttributesSearchQuery, placeholder: "Cerca per nome o codice..." }
                : {
                      value: searchQuery,
                      onChange: setSearchQuery,
                      placeholder: `Cerca ${verticalConfig.productLabel.toLowerCase()} o variante...`
                  },
        [activeTab, groupsSearchQuery, ingredientsSearchQuery, attributesSearchQuery, searchQuery, verticalConfig]
    );

    const headerActions = useMemo(
        () => (
            <>
                <ToolbarSearch
                    value={collectionSearch.value}
                    onChange={collectionSearch.onChange}
                    placeholder={collectionSearch.placeholder}
                />
                {activeTab === "products" && (
                    <SegmentedControl<"list" | "grid">
                        iconsOnly
                        value={viewMode}
                        onChange={handleViewChange}
                        options={[
                            { value: "grid", icon: <LayoutGrid size={16} />, label: "Vista griglia" },
                            { value: "list", icon: <ListIcon size={16} />, label: "Vista lista" }
                        ]}
                    />
                )}
                {ctaAction && (
                    <Button
                        variant="primary"
                        disabled={ctaAction.disabled}
                        onClick={ctaAction.onClick}
                        className={styles.toolbarCta}
                    >
                        {ctaAction.label}
                    </Button>
                )}
            </>
        ),
        [activeTab, collectionSearch, viewMode, handleViewChange, ctaAction]
    );

    // Versione a dati della stessa toolbar per lo stato compatto.
    const headerCompact = useMemo<PageHeaderCompactConfig>(
        () => ({
            sections: visibleTabs.map(tab => ({ value: tab.value, label: tab.label })),
            activeSection: activeTab,
            onSectionChange: value => handleTabChange(value as ProductsTab),
            search: collectionSearch,
            // Il toggle vista esiste solo sui prodotti, e lì resta a vista.
            persistentIcons:
                activeTab === "products"
                    ? [
                          viewMode === "list"
                              ? { icon: <LayoutGrid size={18} />, label: "Vista griglia", onClick: () => handleViewChange("grid") }
                              : { icon: <ListIcon size={18} />, label: "Vista lista", onClick: () => handleViewChange("list") }
                      ]
                    : undefined,
            primaryAction: ctaAction
        }),
        [activeTab, visibleTabs, handleTabChange, collectionSearch, viewMode, handleViewChange, ctaAction]
    );

    usePageHeader({ leading, actions: headerActions, compact: headerCompact });

    const handleCreateVariant = (baseProduct: V2Product) => {
        if (!ensureActive()) return;
        setCreateEditMode("create_variant");
        setProductToEdit(null);
        setParentForVariant(baseProduct);
        setIsCreateEditOpen(true);
        // Expand the row so the user sees the new variant when it's created
        setExpandedRows(prev => {
            const next = new Set(prev);
            next.add(baseProduct.id);
            return next;
        });
    };

    const handleEdit = (product: V2Product) => {
        if (!ensureActive()) return;
        setCreateEditMode("edit");
        setProductToEdit(product);
        setParentForVariant(null);
        setIsCreateEditOpen(true);
    };

    const handleDuplicate = async (product: V2Product) => {
        if (!ensureActive()) return;
        try {
            await duplicateProduct(product.id, currentTenantId!);
            showToast({ message: "Prodotto duplicato con successo.", type: "success" });
            loadData();
        } catch {
            showToast({ message: "Errore durante la duplicazione del prodotto.", type: "error" });
        }
    };

    const handleDelete = (product: V2Product) => {
        setProductToDelete(product);
        setIsDeleteOpen(true);
    };

    const productLower = verticalConfig.productLabel.toLowerCase();
    const productPluralLower = verticalConfig.productLabelPlural.toLowerCase();
    const bulk = useBulkDelete({
        deleteOne: id => deleteProduct(id, currentTenantId!),
        onDone: loadData,
        nouns: { one: productLower, many: productPluralLower, deletedOne: "eliminato", deletedMany: "eliminati" }
    });

    const toggleRow = (id: string) => {
        setExpandedRows(prev => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    const menuLabels = useMemo(
        () => ({ catalogLabel: verticalConfig.catalogLabel, catalogLabelPlural: verticalConfig.catalogLabelPlural }),
        [verticalConfig.catalogLabel, verticalConfig.catalogLabelPlural]
    );

    /** Riga muta, badge e mancanze di un prodotto (o di una variante col suo padre). */
    const summaryOf = (product: V2Product, parent?: V2Product) => {
        const meta = productMetadata[product.id] ?? EMPTY_PRODUCT_METADATA;
        const parentMeta = parent ? (productMetadata[parent.id] ?? EMPTY_PRODUCT_METADATA) : null;
        const issues = getProductIssues(factsFor(product), parent ? factsFor(parent) : null);
        return {
            meta: (
                <ProductRowMeta
                    price={describePrice(product, meta, parent, parentMeta)}
                    missingPrice={issues.missingPrice}
                    menus={describeMenus(meta.catalogsCount, menuLabels, parentMeta?.catalogsCount)}
                />
            ),
            formats: describeFormats(meta)
        };
    };

    const productUrl = (id: string) => `/business/${currentTenantId}/products/${id}`;

    const rowActions = (product: V2Product, kind: "base" | "variant") => (
        <TableRowActions
            ariaLabel={`Azioni ${product.name}`}
            actions={[
                {
                    label: kind === "base" ? "Modifica prodotto" : "Modifica variante",
                    onClick: () => handleEdit(product)
                },
                {
                    label: "Aggiungi variante",
                    onClick: () => handleCreateVariant(product),
                    hidden: kind !== "base"
                },
                {
                    label: "Duplica",
                    onClick: () => handleDuplicate(product),
                    separator: true
                },
                {
                    label: kind === "base" ? "Elimina" : "Elimina variante",
                    onClick: () => handleDelete(product),
                    variant: "destructive" as const
                }
            ]}
        />
    );

    // Una colonna sola a due righe (§50.9/1): nome con i badge, poi «prezzo ·
    // in N {menù}». Il prezzo non ha più una colonna sua: a 375 la colonna
    // stringeva il nome a poche lettere.
    const columns: ColumnDefinition<ProductTableRow>[] = [
        {
            id: "name",
            header: "Nome",
            width: "1fr",
            accessor: row => row.product.name,
            cell: (_value, row) => {
                const summary = summaryOf(row.product, row.parent);
                return (
                    <div className={`${styles.nameCell} ${row.kind === "variant" ? styles.variantName : ""}`}>
                        {row.kind === "base" && row.hasVariants ? (
                            <button
                                type="button"
                                className={styles.expandButton}
                                onClick={() => toggleRow(row.product.id)}
                                aria-expanded={row.isExpanded}
                                aria-label={`${row.isExpanded ? "Nascondi" : "Mostra"} varianti di ${row.product.name}`}
                            >
                                {row.isExpanded ? <IconChevronDown size={16} /> : <IconChevronRight size={16} />}
                            </button>
                        ) : anyVariants ? (
                            <span className={styles.expanderSpacer} aria-hidden />
                        ) : null}
                        <div className={`${DATA_TABLE_CLASSES.cellTwoLine} ${DATA_TABLE_CLASSES.cellTwoLineWrap}`}>
                            <div className={styles.productNameRow}>
                                <Link to={productUrl(row.product.id)} className={styles.productLink}>
                                    {row.product.name}
                                </Link>
                                {row.kind === "variant" && <Badge variant="secondary">Variante</Badge>}
                                {summary.formats && <Badge variant="secondary">{summary.formats}</Badge>}
                            </div>
                            {summary.meta}
                        </div>
                    </div>
                );
            }
        },
        ...(canWriteProduct
            ? [
                  {
                      id: "actions",
                      header: "",
                      width: "56px",
                      align: "right" as const,
                      cell: (_value: unknown, row: ProductTableRow) => rowActions(row.product, row.kind)
                  }
              ]
            : [])
    ];

    return (
        <PageGate readPermission="products.read">
        {() => (
        <section className={styles.container}>
            {activeTab === "products" && (
                <>
                    <div className={styles.content} data-view-mode={viewMode}>
                        {!isLoading && allProducts.length > 0 && (
                            <ChipGroupSingle<IssueFilter>
                                ariaLabel="Filtra per qualità del dato"
                                layout="auto"
                                shape="pill"
                                options={issueFilterOptions}
                                value={issueFilter}
                                onChange={setIssueFilter}
                            />
                        )}
                        {loadError ? (
                            <EmptyState
                                icon={<Package size={40} strokeWidth={1.5} />}
                                title={`Non è stato possibile caricare i ${verticalConfig.productLabelPlural.toLowerCase()}`}
                                description="Controlla la connessione e riprova."
                                action={
                                    <Button variant="secondary" onClick={() => loadData()}>
                                        Riprova
                                    </Button>
                                }
                            />
                        ) : !isLoading && filteredProducts.length === 0 ? (
                            <EmptyState
                                icon={<Package size={40} strokeWidth={1.5} />}
                                title={
                                    hasActiveFilter
                                        ? "Nessun risultato"
                                        : `Crei un ${verticalConfig.productLabel.toLowerCase()} una volta, lo usi in ogni ${verticalConfig.catalogLabel.toLowerCase()}`
                                }
                                description={
                                    hasActiveFilter
                                        ? `Nessun ${verticalConfig.productLabel.toLowerCase()} corrisponde ai filtri attivi.`
                                        : "Nome, prezzo, foto, allergeni: li imposti qui e restano aggiornati ovunque compaia."
                                }
                                action={
                                    !hasActiveFilter && canWriteProduct ? (
                                        <Button variant="primary" onClick={handleCreateBase} disabled={!canEdit}>
                                            {`Crea il primo ${verticalConfig.productLabel.toLowerCase()}`}
                                        </Button>
                                    ) : undefined
                                }
                            />
                        ) : viewMode === "list" ? (
                            <DataTable<ProductTableRow>
                                data={tableRows}
                                allRowIds={allTableRowIds}
                                columns={columns}
                                isLoading={isLoading}
                                ariaLabel={verticalConfig.productLabelPlural}
                                selectable={canWriteProduct}
                                selectedRowIds={bulk.selectedIds}
                                onSelectedRowsChange={bulk.setSelectedIds}
                                onBulkDelete={canWriteProduct ? bulk.request : undefined}
                                onRowClick={row => navigate(productUrl(row.product.id))}
                                mutedRowIds={variantRowIds}
                            />
                        ) : (
                            <CardGrid
                                loading={isLoading}
                                skeletonShape={{ media: true }}
                                aria-label={verticalConfig.productLabelPlural}
                            >
                                {filteredProducts.flatMap(product =>
                                    [product, ...(product.variants ?? [])].map(item => {
                                        const parent = item === product ? undefined : product;
                                        const summary = summaryOf(item, parent);
                                        return (
                                            <CardGridItem
                                                key={item.id}
                                                to={productUrl(item.id)}
                                                aria-label={item.name}
                                                media={
                                                    item.image_url ? (
                                                        <FramedMedia
                                                            source={item.image_url}
                                                            framing={item.image_framing ?? PRODUCT_IMAGE_DEFAULT_FRAMING}
                                                            aspectRatio={null}
                                                            alt={item.name}
                                                        />
                                                    ) : (
                                                        <div className={styles.mediaPlaceholder} aria-hidden>
                                                            <Package size={28} strokeWidth={1.5} />
                                                        </div>
                                                    )
                                                }
                                                title={item.name}
                                                subtitle={summary.meta}
                                                badge={
                                                    parent || summary.formats ? (
                                                        <Badge variant="secondary">{parent ? "Variante" : summary.formats}</Badge>
                                                    ) : undefined
                                                }
                                                actions={canWriteProduct ? rowActions(item, parent ? "variant" : "base") : undefined}
                                            />
                                        );
                                    })
                                )}
                            </CardGrid>
                        )}
                    </div>

                    <ProductCreateEditDrawer
                        open={isCreateEditOpen}
                        onClose={() => setIsCreateEditOpen(false)}
                        mode={createEditMode}
                        productData={productToEdit}
                        parentProduct={parentForVariant}
                        onSuccess={loadData}
                        tenantId={currentTenantId ?? undefined}
                    />

                    <ConfirmDialog
                        {...bulk.dialog}
                        message={`Si eliminano anche le loro varianti e i collegamenti ai ${verticalConfig.catalogLabel.toLowerCase()}, e non si torna indietro.`}
                    />

                    <ProductDeleteDrawer
                        open={isDeleteOpen}
                        onClose={() => setIsDeleteOpen(false)}
                        productData={productToDelete}
                        onSuccess={loadData}
                    />
                </>
            )}
            {activeTab === "groups" && (
                <ProductGroupsTab
                    tenantId={currentTenantId ?? undefined}
                    isCreateOpen={isCreateGroupOpen}
                    onCloseCreate={() => setCreateGroupOpen(false)}
                    searchQuery={groupsSearchQuery}
                    onSearchQueryChange={setGroupsSearchQuery}
                    canWrite={canWriteProduct}
                />
            )}
            {activeTab === "attributes" && verticalConfig.productSections.customAttributes && (
                <ProductsAttributesTab
                    tenantId={currentTenantId ?? undefined}
                    vertical={selectedTenant?.vertical_type}
                    createTrigger={attrCreateSeq}
                    searchQuery={attributesSearchQuery}
                    canWrite={canWriteAttribute}
                />
            )}
            {activeTab === "ingredients" && verticalConfig.productSections.ingredients && (
                <Ingredients
                    createTrigger={ingredientCreateSeq}
                    searchQuery={ingredientsSearchQuery}
                    onSearchQueryChange={setIngredientsSearchQuery}
                    canWrite={canWriteProduct}
                />
            )}
        </section>
        )}
        </PageGate>
    );
}
