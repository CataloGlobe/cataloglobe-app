import { useCallback, useMemo, useState, type ReactNode } from "react";
import { IconEyeOff, IconClockExclamation, IconTrash } from "@tabler/icons-react";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { Button } from "@/components/ui/Button/Button";
import { IconButton } from "@/components/ui/Button/IconButton";
import { DataTable, ColumnDefinition } from "@/components/ui/DataTable/DataTable";
import { TextInput } from "@/components/ui/Input/TextInput";
import { SegmentedControl } from "@/components/ui/SegmentedControl/SegmentedControl";
import { Select } from "@/components/ui/Select/Select";
import { Switch } from "@/components/ui/Switch/Switch";
import Text from "@/components/ui/Text/Text";
import { ToolbarSearch } from "@/components/ui/ToolbarSearch";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { withPluralArticle } from "@/utils/ruleDetailForm";
import { useVerticalConfig } from "@/hooks/useVerticalConfig";
import {
    LayoutRuleOption,
    RuleType,
    type ProductGroupAssignmentOption,
    type VisibilityMode
} from "@/services/supabase/layoutScheduling";
import styles from "../ProgrammingRuleDetail.module.scss";

export interface FeaturedContentItem {
    featuredContentId: string;
    slot: "before_catalog" | "after_catalog";
    sortOrder: number;
}

type ProductDisplayOption = {
    id: string;
    label: string;
    isVariant: boolean;
    parentId?: string;
};

type VisibilityProductRow = {
    id: string;
    label: string;
    isVariant: boolean;
    mode: VisibilityMode;
};

const VISIBILITY_MODE_OPTIONS: { value: VisibilityMode; label: string; icon: ReactNode }[] = [
    { value: "hide", label: "Nascosto", icon: <IconEyeOff size={14} /> },
    { value: "disable", label: "Non disponibile", icon: <IconClockExclamation size={14} /> }
];

interface ProductOverride {
    overridePrice: string;
    showOriginalPrice: boolean;
    valueOverrides?: Record<string, { overridePrice: string; showOriginalPrice: boolean }>;
}

/** Una riga della tabella prezzi: un prodotto, o un suo formato. */
type PriceTableRow = {
    key: string;
    productId: string;
    /** Il formato (option value) quando il prodotto ne ha. */
    formatId?: string;
    formatName?: string;
    label: string;
    isVariant: boolean;
    /** La prima riga del prodotto porta il «Rimuovi». */
    isFirstOfProduct: boolean;
    /** Variante con un prezzo suo mentre anche il principale ne ha uno. */
    ownsVariantPrice: boolean;
    price: string;
    showOriginalPrice: boolean;
};

interface AssociatedContentSectionProps {
    ruleType: RuleType;
    catalogId?: string;
    styleId?: string;
    selectedProductIds?: string[];
    productOverrides?: Record<string, ProductOverride>;
    visibilityProductModes?: Record<string, VisibilityMode>;
    tenantCatalogs: LayoutRuleOption[];
    tenantStyles: LayoutRuleOption[];
    tenantProducts: LayoutRuleOption[];
    tenantProductGroups?: LayoutRuleOption[];
    tenantProductGroupItems?: ProductGroupAssignmentOption[];
    onFormChange: (
        updates: Partial<{
            catalogId: string;
            styleId: string;
            selectedProductIds: string[];
            productOverrides: Record<string, ProductOverride>;
            visibilityProductModes: Record<string, VisibilityMode>;
        }>
    ) => void;
    /** Prezzi: l'errore di `validateRuleForm`, sotto il titolo. */
    pricesError?: string;
}

// ─── AssociatedContentSection ───────────────────────────────────────────────

export function AssociatedContentSection({
    ruleType,
    catalogId,
    styleId,
    selectedProductIds = [],
    productOverrides = {},
    visibilityProductModes = {},
    tenantCatalogs,
    tenantStyles,
    tenantProducts,
    tenantProductGroups = [],
    tenantProductGroupItems = [],
    onFormChange,
    pricesError
}: AssociatedContentSectionProps) {
    const [isProductsDrawerOpen, setIsProductsDrawerOpen] = useState(false);
    const { catalogLabel, productLabel, productLabelPlural } = useVerticalConfig();
    // La parola del vertical per «prodotto» (P10): minuscola dentro le frasi.
    const product = productLabel.toLowerCase();
    const products = productLabelPlural.toLowerCase();
    const [searchTerm, setSearchTerm] = useState("");
    const [selectedGroupId, setSelectedGroupId] = useState("");
    const [pendingSelectedIds, setPendingSelectedIds] = useState<string[]>([]);
    // Sotto ~420px lo SegmentedControl Comportamento non ha spazio per stare
    // sulla stessa riga del nome prodotto senza comprimersi eccessivamente —
    // la riga va a capo (nome sopra, comportamento+rimuovi sotto) invece di
    // schiacciare il controllo in orizzontale.
    const isMobile = useMediaQuery("(max-width: 420px)");

    const productIdSetByGroupId = useMemo(() => {
        const map = new Map<string, Set<string>>();
        for (const item of tenantProductGroupItems) {
            const current = map.get(item.group_id) ?? new Set<string>();
            current.add(item.product_id);
            map.set(item.group_id, current);
        }
        return map;
    }, [tenantProductGroupItems]);

    const productDisplayOptions = useMemo<ProductDisplayOption[]>(() => {
        const parentById = new Map(
            tenantProducts.filter(p => !p.parent_product_id).map(p => [p.id, p])
        );

        const result: ProductDisplayOption[] = [];

        const parents = [...tenantProducts]
            .filter(p => !p.parent_product_id)
            .sort((a, b) => a.name.localeCompare(b.name, "it"));

        for (const parent of parents) {
            result.push({ id: parent.id, label: parent.name, isVariant: false });

            const variants = [...tenantProducts]
                .filter(p => p.parent_product_id === parent.id)
                .sort((a, b) => a.name.localeCompare(b.name, "it"));

            for (const v of variants) {
                result.push({ id: v.id, label: v.name, isVariant: true, parentId: parent.id });
            }
        }

        for (const p of tenantProducts) {
            if (p.parent_product_id && !parentById.has(p.parent_product_id)) {
                result.push({
                    id: p.id,
                    label: p.name,
                    isVariant: true,
                    parentId: p.parent_product_id ?? undefined
                });
            }
        }

        return result;
    }, [tenantProducts]);

    const productLabelById = useMemo(
        () => new Map(productDisplayOptions.map(o => [o.id, o.label])),
        [productDisplayOptions]
    );

    const productOptionById = useMemo(
        () => new Map(productDisplayOptions.map(o => [o.id, o])),
        [productDisplayOptions]
    );

    const filteredProducts = useMemo(() => {
        const normalizedSearch = searchTerm.trim().toLowerCase();
        const allowedProductIds =
            selectedGroupId.length > 0 ? productIdSetByGroupId.get(selectedGroupId) : null;

        return productDisplayOptions.filter(opt => {
            if (allowedProductIds && !allowedProductIds.has(opt.id)) return false;
            if (!normalizedSearch) return true;
            return opt.label.toLowerCase().includes(normalizedSearch);
        });
    }, [productDisplayOptions, productIdSetByGroupId, searchTerm, selectedGroupId]);

    const sortedSelectedProductIds = useMemo(
        () =>
            [...selectedProductIds].sort((a, b) => {
                const aLabel = productLabelById.get(a) ?? a;
                const bLabel = productLabelById.get(b) ?? b;
                return aLabel.localeCompare(bLabel, "it");
            }),
        [selectedProductIds, productLabelById]
    );

    const removeSelectedProduct = useCallback(
        (productId: string) => {
            const nextIds = selectedProductIds.filter(id => id !== productId);
            const nextModes = { ...visibilityProductModes };
            delete nextModes[productId];
            onFormChange({
                selectedProductIds: nextIds,
                visibilityProductModes: nextModes
            });
        },
        [selectedProductIds, visibilityProductModes, onFormChange]
    );

    const visibilityTableRows = useMemo<VisibilityProductRow[]>(
        () =>
            sortedSelectedProductIds.map(productId => {
                const option = productOptionById.get(productId);
                return {
                    id: productId,
                    label: option?.label ?? productLabelById.get(productId) ?? productId,
                    isVariant: option?.isVariant ?? false,
                    mode: visibilityProductModes[productId] ?? "hide"
                };
            }),
        [sortedSelectedProductIds, productOptionById, productLabelById, visibilityProductModes]
    );

    const visibilityTableColumns = useMemo<ColumnDefinition<VisibilityProductRow>[]>(() => {
        if (isMobile) {
            return [
                {
                    id: "product",
                    header: productLabel,
                    cell: (_, row) => (
                        <div className={styles.visibilityRowStacked}>
                            <Text variant="body-sm" weight={row.isVariant ? 400 : 600}>
                                {row.isVariant && <span className={styles.variantArrow}>↳ </span>}
                                {row.label}
                            </Text>
                            <div className={styles.visibilityRowStackedControls}>
                                <SegmentedControl<VisibilityMode>
                                    value={row.mode}
                                    size="sm"
                                    options={VISIBILITY_MODE_OPTIONS}
                                    onChange={next => {
                                        onFormChange({
                                            visibilityProductModes: {
                                                ...visibilityProductModes,
                                                [row.id]: next
                                            }
                                        });
                                    }}
                                />
                                <IconButton
                                    icon={<IconTrash size={16} />}
                                    aria-label={`Rimuovi ${product}`}
                                    variant="ghost"
                                    size="md"
                                    onClick={() => removeSelectedProduct(row.id)}
                                />
                            </div>
                        </div>
                    )
                }
            ];
        }
        return [
            {
                id: "product",
                header: productLabel,
                cell: (_, row) => (
                    <Text variant="body-sm" weight={row.isVariant ? 400 : 600}>
                        {row.isVariant && <span className={styles.variantArrow}>↳ </span>}
                        {row.label}
                    </Text>
                )
            },
            {
                id: "behavior",
                header: "Comportamento",
                width: "180px",
                align: "right",
                cell: (_, row) => (
                    <SegmentedControl<VisibilityMode>
                        value={row.mode}
                        size="sm"
                        options={VISIBILITY_MODE_OPTIONS}
                        onChange={next => {
                            onFormChange({
                                visibilityProductModes: {
                                    ...visibilityProductModes,
                                    [row.id]: next
                                }
                            });
                        }}
                    />
                )
            },
            {
                id: "actions",
                header: "",
                width: "56px",
                align: "right",
                cell: (_, row) => (
                    <IconButton
                        icon={<IconTrash size={16} />}
                        aria-label={`Rimuovi ${product}`}
                        variant="ghost"
                        size="sm"
                        onClick={() => removeSelectedProduct(row.id)}
                    />
                )
            }
        ];
    }, [isMobile, onFormChange, visibilityProductModes, removeSelectedProduct, product, productLabel]);

    const openProductsDrawer = () => {
        setPendingSelectedIds([...selectedProductIds]);
        setSearchTerm("");
        setSelectedGroupId("");
        setIsProductsDrawerOpen(true);
    };

    const closeProductsDrawer = () => {
        setIsProductsDrawerOpen(false);
        setPendingSelectedIds([]);
    };

    const productDrawerColumns = useMemo<ColumnDefinition<ProductDisplayOption>[]>(
        () => [
            {
                id: "product",
                header: productLabel,
                cell: (_, opt) => (
                    <Text
                        variant="body-sm"
                        weight={opt.isVariant ? 400 : 600}
                        colorVariant={opt.isVariant ? "muted" : undefined}
                    >
                        {opt.isVariant && <span className={styles.variantArrow}>↳ </span>}
                        {opt.label}
                    </Text>
                )
            }
        ],
        [productLabel]
    );

    // Lo stesso drawer per prezzi e disponibilità (§50.1 c): cambia solo cosa
    // si tiene dei prodotti già scelti.
    const confirmProductsSelection = () => {
        const nextIds = [...pendingSelectedIds];
        if (ruleType === "price") {
            const nextOverrides: Record<string, ProductOverride> = {};
            for (const productId of nextIds) {
                nextOverrides[productId] = productOverrides[productId] ?? { overridePrice: "", showOriginalPrice: false };
            }
            onFormChange({ selectedProductIds: nextIds, productOverrides: nextOverrides });
        } else {
            const nextModes: Record<string, VisibilityMode> = {};
            for (const productId of nextIds) {
                nextModes[productId] = visibilityProductModes[productId] ?? "hide";
            }
            onFormChange({ selectedProductIds: nextIds, visibilityProductModes: nextModes });
        }
        closeProductsDrawer();
    };

    const priceRows = useMemo<PriceTableRow[]>(() => {
        const rows: PriceTableRow[] = [];
        for (const productId of sortedSelectedProductIds) {
            const option = productOptionById.get(productId);
            const label = option?.label ?? productLabelById.get(productId) ?? productId;
            const isVariant = option?.isVariant ?? false;
            const ownsVariantPrice = Boolean(isVariant && option?.parentId && selectedProductIds.includes(option.parentId));
            const override = productOverrides[productId];
            const formats = tenantProducts.find(p => p.id === productId)?.format_values ?? [];
            if (formats.length === 0) {
                rows.push({
                    key: productId,
                    productId,
                    label,
                    isVariant,
                    isFirstOfProduct: true,
                    ownsVariantPrice,
                    price: override?.overridePrice ?? "",
                    showOriginalPrice: override?.showOriginalPrice ?? false
                });
                continue;
            }
            formats.forEach((format, index) => {
                const value = override?.valueOverrides?.[format.id];
                rows.push({
                    key: `${productId}:${format.id}`,
                    productId,
                    formatId: format.id,
                    formatName: format.name,
                    label,
                    isVariant,
                    isFirstOfProduct: index === 0,
                    ownsVariantPrice,
                    price: value?.overridePrice ?? "",
                    showOriginalPrice: value?.showOriginalPrice ?? false
                });
            });
        }
        return rows;
    }, [sortedSelectedProductIds, productOptionById, productLabelById, selectedProductIds, productOverrides, tenantProducts]);

    const setPriceRow = useCallback(
        (row: PriceTableRow, patch: Partial<{ overridePrice: string; showOriginalPrice: boolean }>) => {
            const existing = productOverrides[row.productId] ?? { overridePrice: "", showOriginalPrice: false };
            const next: ProductOverride = row.formatId
                ? {
                      ...existing,
                      valueOverrides: {
                          ...existing.valueOverrides,
                          [row.formatId]: {
                              overridePrice: existing.valueOverrides?.[row.formatId]?.overridePrice ?? "",
                              showOriginalPrice: existing.valueOverrides?.[row.formatId]?.showOriginalPrice ?? false,
                              ...patch
                          }
                      }
                  }
                : { ...existing, ...patch };
            onFormChange({ productOverrides: { ...productOverrides, [row.productId]: next } });
        },
        [productOverrides, onFormChange]
    );

    const priceColumns = useMemo<ColumnDefinition<PriceTableRow>[]>(() => {
        const rowName = (row: PriceTableRow) => (row.formatName ? `${row.label}, ${row.formatName}` : row.label);
        const nameCell = (row: PriceTableRow) => (
            <div className={styles.priceName}>
                <Text variant="body-sm" weight={row.isVariant ? 400 : 600}>
                    {row.isVariant && <span className={styles.variantArrow}>↳ </span>}
                    {row.label}
                </Text>
                {(row.formatName || row.ownsVariantPrice) && (
                    <Text variant="caption" colorVariant="muted">
                        {row.formatName ?? `Prezzo suo: anche il ${product} principale ne ha uno`}
                    </Text>
                )}
            </div>
        );
        const priceInput = (row: PriceTableRow) => (
            <TextInput
                aria-label={`Prezzo di ${rowName(row)}`}
                value={row.price}
                inputMode="decimal"
                placeholder="0,00"
                onChange={event => setPriceRow(row, { overridePrice: event.target.value })}
            />
        );
        const originalSwitch = (row: PriceTableRow) => (
            <Switch
                ariaLabel={`Listino barrato per ${rowName(row)}`}
                checked={row.showOriginalPrice}
                onChange={checked => setPriceRow(row, { showOriginalPrice: checked })}
            />
        );
        const removeButton = (row: PriceTableRow, size: "sm" | "md") =>
            row.isFirstOfProduct ? (
                <IconButton
                    icon={<IconTrash size={16} />}
                    aria-label={`Rimuovi ${row.label}`}
                    variant="ghost"
                    size={size}
                    onClick={() => removeSelectedProduct(row.productId)}
                />
            ) : null;

        if (isMobile) {
            return [
                {
                    id: "product",
                    header: productLabel,
                    cell: (_, row) => (
                        <div className={styles.visibilityRowStacked}>
                            {nameCell(row)}
                            <div className={styles.priceRowStackedControls}>
                                {priceInput(row)}
                                <span className={styles.priceStackedSwitch}>
                                    <Text variant="caption" colorVariant="muted" as="span">
                                        Barrato
                                    </Text>
                                    {originalSwitch(row)}
                                </span>
                                {/* I formati dopo il primo non hanno «Rimuovi»: lo spazio resta, così i campi si allineano. */}
                                {removeButton(row, "md") ?? <span className={styles.priceRemoveSpacer} aria-hidden="true" />}
                            </div>
                        </div>
                    )
                }
            ];
        }
        return [
            { id: "product", header: productLabel, cell: (_, row) => nameCell(row) },
            { id: "price", header: "Prezzo", width: "140px", cell: (_, row) => priceInput(row) },
            { id: "original", header: "Listino barrato", width: "160px", align: "center", cell: (_, row) => originalSwitch(row) },
            { id: "actions", header: "", width: "56px", align: "right", cell: (_, row) => removeButton(row, "sm") }
        ];
    }, [isMobile, product, productLabel, setPriceRow, removeSelectedProduct]);

    const productsDrawer = (
        <SystemDrawer
            open={isProductsDrawerOpen}
            onClose={closeProductsDrawer}
            size="md"
            aria-labelledby="rule-products-drawer-title"
        >
            <DrawerLayout
                bodyLayout="flex"
                header={
                    <div className={styles.drawerHeader}>
                        <Text as="h3" variant="title-sm" id="rule-products-drawer-title">
                            {`Aggiungi ${products}`}
                        </Text>
                        <Text variant="body-sm" colorVariant="muted">
                            {`Scegli ${withPluralArticle(products)} su cui agisce la regola.`}
                        </Text>
                    </div>
                }
                footer={
                    <>
                        <Button variant="secondary" onClick={closeProductsDrawer}>
                            Annulla
                        </Button>
                        <Button variant="primary" onClick={confirmProductsSelection}>
                            Applica
                        </Button>
                    </>
                }
            >
                <div className={styles.visibilityDrawerContent}>
                    <div className={styles.visibilityDrawerFilters}>
                        <ToolbarSearch
                            value={searchTerm}
                            onChange={setSearchTerm}
                            placeholder={`Cerca ${product}…`}
                            className={styles.visibilityDrawerSearch}
                        />

                        <Select
                            label={`Gruppo ${product}`}
                            value={selectedGroupId}
                            onChange={event => setSelectedGroupId(event.target.value)}
                            options={[
                                { value: "", label: "Tutti i gruppi" },
                                ...tenantProductGroups.map(group => ({
                                    value: group.id,
                                    label: group.name
                                }))
                            ]}
                        />
                    </div>

                    <div className={styles.visibilityDrawerTableWrap}>
                        <DataTable<ProductDisplayOption>
                            data={filteredProducts}
                            columns={productDrawerColumns}
                            selectable
                            selectedRowIds={pendingSelectedIds}
                            onSelectedRowsChange={setPendingSelectedIds}
                            showSelectionBar={false}
                            emptyState={{
                                title: `Nessun ${product} trovato`,
                                description: `Nessun ${product} corrispondente ai filtri attuali.`
                            }}
                        />
                    </div>
                </div>
            </DrawerLayout>
        </SystemDrawer>
    );

    if (ruleType === "layout") {
        return (
            <section className={styles.sectionCard}>
                <Text as="h3" variant="title-sm">
                    {catalogLabel} e stile
                </Text>

                <div className={styles.sectionGrid}>
                    <Select
                        label={catalogLabel}
                        value={catalogId}
                        onChange={event => onFormChange({ catalogId: event.target.value })}
                        options={[
                            { value: "", label: `Nessun ${catalogLabel.toLowerCase()}` },
                            ...tenantCatalogs.map(catalog => ({
                                value: catalog.id,
                                label: catalog.name
                            }))
                        ]}
                    />

                    <Select
                        label="Stile"
                        value={styleId}
                        onChange={event => onFormChange({ styleId: event.target.value })}
                        options={tenantStyles.map(style => ({
                            value: style.id,
                            label: style.name
                        }))}
                    />
                </div>
            </section>
        );
    }

    if (ruleType === "visibility") {
        return (
            <section className={styles.sectionCard}>
                <div className={styles.sectionHeader}>
                    <Text as="h3" variant="title-sm">
                        {productLabelPlural}
                    </Text>
                    <Button variant="secondary" size="sm" onClick={openProductsDrawer}>
                        {`Aggiungi ${products}`}
                    </Button>
                </div>

                <Text variant="caption" colorVariant="muted">
                    {`Ogni ${product} selezionato può avere un comportamento diverso quando la regola è attiva.`}
                </Text>

                {sortedSelectedProductIds.length === 0 ? (
                    <div className={styles.hintCard}>
                        <Text variant="body-sm" colorVariant="muted">
                            {`Nessun ${product} ancora: aggiungine uno per dire cosa cambia.`}
                        </Text>
                    </div>
                ) : (
                    <DataTable<VisibilityProductRow>
                        data={visibilityTableRows}
                        columns={visibilityTableColumns}
                        pageSize={9999}
                        pageSizeOptions={["all"]}
                    />
                )}

                {productsDrawer}
            </section>
        );
    }

    return (
        <section className={styles.sectionCard}>
            <div className={styles.sectionHeader}>
                <Text as="h3" variant="title-sm">
                    {productLabelPlural}
                </Text>
                <Button variant="secondary" size="sm" onClick={openProductsDrawer}>
                    {`Aggiungi ${products}`}
                </Button>
            </div>
            {pricesError && (
                <Text id="rule-field-prices" tabIndex={-1} variant="caption" colorVariant="error">
                    {pricesError}
                </Text>
            )}

            {sortedSelectedProductIds.length === 0 ? (
                <div className={styles.hintCard}>
                    <Text variant="body-sm" colorVariant="muted">
                        {`Nessun ${product} ancora: aggiungine uno per dargli un prezzo.`}
                    </Text>
                </div>
            ) : (
                <DataTable<PriceTableRow>
                    data={priceRows}
                    columns={priceColumns}
                    getRowId={row => row.key}
                    // Dentro una card di una pagina che scorre: la tabella è
                    // alta quanto le righe, come RuleTable.
                    maxHeight="none"
                    showFooter={false}
                    pageSize={9999}
                    pageSizeOptions={["all"]}
                />
            )}

            {productsDrawer}
        </section>
    );
}
