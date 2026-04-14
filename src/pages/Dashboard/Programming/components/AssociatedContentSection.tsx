import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, X } from "lucide-react";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { Button } from "@/components/ui/Button/Button";
import { TextInput } from "@/components/ui/Input/TextInput";
import { PillGroupMultiple } from "@/components/ui/PillGroup/PillGroupMultiple";
import { Select } from "@/components/ui/Select/Select";
import { Switch } from "@/components/ui/Switch/Switch";
import Text from "@/components/ui/Text/Text";
import {
    LayoutRuleOption,
    RuleType,
    type ProductGroupAssignmentOption,
    type VisibilityMode
} from "@/services/supabase/layoutScheduling";
import styles from "../ProgrammingRuleDetail.module.scss";

export interface FeaturedContentItem {
    featuredContentId: string;
    slot: "hero" | "before_catalog" | "after_catalog";
    sortOrder: number;
}

interface ProductOverride {
    overridePrice: string;
    showOriginalPrice: boolean;
    valueOverrides?: Record<string, { overridePrice: string; showOriginalPrice: boolean }>;
}

// ─── PriceOverrideRow ────────────────────────────────────────────────────────

interface PriceOverrideRowProps {
    productId: string;
    productName: string;
    isVariant: boolean;
    parentHasOverride: boolean;
    hasVariantOverrides: boolean;
    formatValues?: Array<{ id: string; name: string }>;
    override: ProductOverride | undefined;
    productOverrides: Record<string, ProductOverride>;
    onOverrideChange: (next: Record<string, ProductOverride>) => void;
    onRemove: (productId: string) => void;
}

function PriceOverrideRow({
    productId,
    productName,
    isVariant,
    parentHasOverride,
    hasVariantOverrides,
    formatValues,
    override,
    productOverrides,
    onOverrideChange,
    onRemove
}: PriceOverrideRowProps) {
    const hasFormats = (formatValues?.length ?? 0) > 0;

    const hasCompiledOverride = hasFormats
        ? (formatValues ?? []).some(
              fv => (override?.valueOverrides?.[fv.id]?.overridePrice ?? "").trim() !== ""
          )
        : (override?.overridePrice ?? "").trim() !== "";

    const [isOpen, setIsOpen] = useState(hasCompiledOverride);

    return (
        <div className={styles.priceRow}>
            <div
                className={styles.priceRowHeader}
                onClick={() => setIsOpen(v => !v)}
            >
                <span className={styles.priceRowChevron}>
                    {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </span>

                <span className={styles.priceRowName}>
                    <span style={{ fontSize: "0.875rem", fontWeight: 600 }}>
                        {productName}
                    </span>
                </span>

                {(isVariant || parentHasOverride) && (
                    <span className={styles.priceRowBadges}>
                        {isVariant && (
                            <span
                                className={styles.badgeVariant}
                                title="Questo è una variante — eredita il prezzo del prodotto principale se non ha un override specifico"
                            >
                                Variante
                            </span>
                        )}
                        {isVariant && parentHasOverride && (
                            <span
                                className={styles.badgeSpecific}
                                title="Sia questa variante che il prodotto principale hanno un override — questo override ha la priorità"
                            >
                                Override specifico
                            </span>
                        )}
                    </span>
                )}

                <button
                    type="button"
                    className={styles.priceRowRemove}
                    onClick={e => {
                        e.stopPropagation();
                        onRemove(productId);
                    }}
                    aria-label={`Rimuovi ${productName}`}
                >
                    <X size={13} />
                </button>
            </div>

            {isOpen && (
                <div className={styles.priceControls}>
                    {hasFormats && formatValues ? (
                        formatValues.map(fv => {
                            const valOvr = override?.valueOverrides?.[fv.id];
                            return (
                                <div key={fv.id} className={styles.formatRow}>
                                    <span style={{ fontSize: "0.8rem", fontWeight: 600 }}>
                                        {fv.name}
                                    </span>
                                    <TextInput
                                        label="Prezzo override"
                                        value={valOvr?.overridePrice ?? ""}
                                        onChange={event => {
                                            const nextOverrides = { ...productOverrides };
                                            const existing = nextOverrides[productId] ?? {
                                                overridePrice: "",
                                                showOriginalPrice: false
                                            };
                                            const nextVals = { ...existing.valueOverrides };
                                            nextVals[fv.id] = {
                                                ...nextVals[fv.id],
                                                overridePrice: event.target.value
                                            };
                                            nextOverrides[productId] = {
                                                ...existing,
                                                valueOverrides: nextVals
                                            };
                                            onOverrideChange(nextOverrides);
                                        }}
                                        placeholder="0.00"
                                    />
                                    <div className={styles.switchRow}>
                                        <Text variant="caption">Mostra originale</Text>
                                        <Switch
                                            checked={valOvr?.showOriginalPrice ?? false}
                                            onChange={val => {
                                                const nextOverrides = { ...productOverrides };
                                                const existing = nextOverrides[productId] ?? {
                                                    overridePrice: "",
                                                    showOriginalPrice: false
                                                };
                                                const nextVals = { ...existing.valueOverrides };
                                                nextVals[fv.id] = {
                                                    overridePrice:
                                                        nextVals[fv.id]?.overridePrice ?? "",
                                                    showOriginalPrice: val
                                                };
                                                nextOverrides[productId] = {
                                                    ...existing,
                                                    valueOverrides: nextVals
                                                };
                                                onOverrideChange(nextOverrides);
                                            }}
                                        />
                                    </div>
                                </div>
                            );
                        })
                    ) : (
                        <>
                            <TextInput
                                label="Prezzo override"
                                value={override?.overridePrice ?? ""}
                                onChange={event => {
                                    const nextOverrides = { ...productOverrides };
                                    nextOverrides[productId] = {
                                        ...nextOverrides[productId],
                                        overridePrice: event.target.value
                                    };
                                    onOverrideChange(nextOverrides);
                                }}
                                placeholder="0.00"
                            />
                            <div className={styles.switchRow}>
                                <Text variant="caption">Mostra prezzo originale</Text>
                                <Switch
                                    checked={override?.showOriginalPrice ?? false}
                                    onChange={val => {
                                        const nextOverrides = { ...productOverrides };
                                        nextOverrides[productId] = {
                                            ...nextOverrides[productId],
                                            showOriginalPrice: val
                                        };
                                        onOverrideChange(nextOverrides);
                                    }}
                                />
                            </div>
                            {isVariant && !parentHasOverride && (
                                <Text
                                    variant="caption"
                                    colorVariant="muted"
                                    className={styles.inheritanceNote}
                                    title="Se il prodotto principale ha un override attivo, verrà applicato a tutte le varianti senza override specifico"
                                >
                                    Override indipendente dal prodotto principale
                                </Text>
                            )}
                            {!isVariant && hasVariantOverrides && (
                                <Text
                                    variant="caption"
                                    colorVariant="muted"
                                    className={styles.inheritanceNote}
                                    title="Le varianti con override specifico useranno il proprio prezzo; le altre erediteranno questo override"
                                >
                                    Alcune varianti hanno override specifici
                                </Text>
                            )}
                        </>
                    )}
                </div>
            )}
        </div>
    );
}

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
    onFormChange
}: AssociatedContentSectionProps) {
    const [isProductsDrawerOpen, setIsProductsDrawerOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const [selectedGroupId, setSelectedGroupId] = useState("");
    const [productSearch, setProductSearch] = useState("");
    const [pendingSelectedIds, setPendingSelectedIds] = useState<string[]>([]);

    const productIdSetByGroupId = useMemo(() => {
        const map = new Map<string, Set<string>>();
        for (const item of tenantProductGroupItems) {
            const current = map.get(item.group_id) ?? new Set<string>();
            current.add(item.product_id);
            map.set(item.group_id, current);
        }
        return map;
    }, [tenantProductGroupItems]);

    const productDisplayOptions = useMemo(() => {
        type ProductDisplayOption = {
            id: string;
            label: string;
            isVariant: boolean;
            parentId?: string;
        };

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

    const filteredProductOptions = useMemo(
        () =>
            productDisplayOptions.filter(opt =>
                opt.label.toLowerCase().includes(productSearch.toLowerCase())
            ),
        [productDisplayOptions, productSearch]
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

    const togglePendingProduct = (productId: string, checked: boolean) => {
        setPendingSelectedIds(prev => {
            if (checked) {
                if (prev.includes(productId)) return prev;
                return [...prev, productId];
            }
            return prev.filter(id => id !== productId);
        });
    };

    const confirmProductsSelection = () => {
        const nextIds = [...pendingSelectedIds];
        const nextModes: Record<string, VisibilityMode> = {};
        for (const productId of nextIds) {
            nextModes[productId] = visibilityProductModes[productId] ?? "hide";
        }

        onFormChange({
            selectedProductIds: nextIds,
            visibilityProductModes: nextModes
        });

        closeProductsDrawer();
    };

    const removeSelectedProduct = (productId: string) => {
        const nextIds = selectedProductIds.filter(id => id !== productId);
        const nextModes = { ...visibilityProductModes };
        delete nextModes[productId];
        onFormChange({
            selectedProductIds: nextIds,
            visibilityProductModes: nextModes
        });
    };

    if (ruleType === "layout") {
        return (
            <section className={styles.sectionCard}>
                <Text as="h3" variant="title-sm">
                    Contenuti associati
                </Text>

                <div className={styles.sectionGrid}>
                    <Select
                        label="Catalogo"
                        value={catalogId}
                        onChange={event => onFormChange({ catalogId: event.target.value })}
                        options={[
                            { value: "", label: "Nessun catalogo" },
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
                        options={[
                            { value: "", label: "Nessuno stile" },
                            ...tenantStyles.map(style => ({
                                value: style.id,
                                label: style.name
                            }))
                        ]}
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
                        Prodotti
                    </Text>
                    <Button variant="secondary" size="sm" onClick={openProductsDrawer}>
                        + Aggiungi prodotti
                    </Button>
                </div>

                <Text variant="caption" colorVariant="muted">
                    Ogni prodotto selezionato può avere un comportamento diverso quando la regola è
                    attiva.
                </Text>

                {sortedSelectedProductIds.length === 0 ? (
                    <div className={styles.hintCard}>
                        <Text variant="body-sm" colorVariant="muted">
                            Nessun prodotto selezionato.
                        </Text>
                    </div>
                ) : (
                    <div className={styles.visibilityTable}>
                        <div className={styles.visibilityTableHeader}>
                            <Text variant="caption" colorVariant="muted">
                                Prodotto
                            </Text>
                            <Text variant="caption" colorVariant="muted">
                                Comportamento
                            </Text>
                            <Text variant="caption" colorVariant="muted">
                                Remove
                            </Text>
                        </div>

                        {sortedSelectedProductIds.map(productId => {
                            const productName = productLabelById.get(productId) ?? productId;
                            const mode = visibilityProductModes[productId] ?? "hide";
                            const impactLabel =
                                mode === "hide"
                                    ? "Verrà nascosto"
                                    : "Verrà mostrato come non disponibile";

                            return (
                                <div key={productId} className={styles.visibilityTableRow}>
                                    <Text variant="body-sm" weight={600}>
                                        {productName}
                                    </Text>

                                    <div className={styles.visibilityModeCell}>
                                        <Select
                                            value={mode}
                                            aria-label={`Comportamento per ${productName}`}
                                            onChange={event => {
                                                onFormChange({
                                                    visibilityProductModes: {
                                                        ...visibilityProductModes,
                                                        [productId]: event.target
                                                            .value as VisibilityMode
                                                    }
                                                });
                                            }}
                                            options={[
                                                { value: "hide", label: "Nascondi" },
                                                {
                                                    value: "disable",
                                                    label: "Mostra come non disponibile"
                                                }
                                            ]}
                                        />
                                        <Text
                                            variant="caption"
                                            className={styles.visibilityImpactBadge}
                                        >
                                            {impactLabel}
                                        </Text>
                                    </div>

                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => removeSelectedProduct(productId)}
                                    >
                                        Rimuovi
                                    </Button>
                                </div>
                            );
                        })}
                    </div>
                )}

                <SystemDrawer
                    open={isProductsDrawerOpen}
                    onClose={closeProductsDrawer}
                    width={560}
                    aria-labelledby="visibility-products-drawer-title"
                >
                    <DrawerLayout
                        header={
                            <div className={styles.drawerHeader}>
                                <Text
                                    as="h3"
                                    variant="title-sm"
                                    id="visibility-products-drawer-title"
                                >
                                    Aggiungi prodotti
                                </Text>
                                <Text variant="body-sm" colorVariant="muted">
                                    Cerca e filtra i prodotti da associare alla regola.
                                </Text>
                            </div>
                        }
                        footer={
                            <>
                                <Button variant="secondary" onClick={closeProductsDrawer}>
                                    Annulla
                                </Button>
                                <Button variant="primary" onClick={confirmProductsSelection}>
                                    Conferma
                                </Button>
                            </>
                        }
                    >
                        <div className={styles.visibilityDrawerContent}>
                            <TextInput
                                label="Cerca prodotto"
                                value={searchTerm}
                                onChange={event => setSearchTerm(event.target.value)}
                                placeholder="Nome prodotto..."
                            />

                            <Select
                                label="Gruppo prodotto"
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

                            <div className={styles.visibilityDrawerCount}>
                                <Text variant="caption" colorVariant="muted">
                                    {filteredProducts.length} risultati
                                </Text>
                            </div>

                            <div className={styles.visibilityDrawerList}>
                                {filteredProducts.length === 0 ? (
                                    <Text variant="body-sm" colorVariant="muted">
                                        Nessun prodotto trovato con i filtri attuali.
                                    </Text>
                                ) : (
                                    filteredProducts.map(opt => {
                                        const checked = pendingSelectedIds.includes(opt.id);
                                        return (
                                            <label
                                                key={opt.id}
                                                className={`${styles.visibilityDrawerListItem}${opt.isVariant ? ` ${styles.visibilityDrawerListItemVariant}` : ""}`}
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={checked}
                                                    onChange={event =>
                                                        togglePendingProduct(
                                                            opt.id,
                                                            event.target.checked
                                                        )
                                                    }
                                                />
                                                <Text
                                                    variant="body-sm"
                                                    colorVariant={
                                                        opt.isVariant ? "muted" : undefined
                                                    }
                                                >
                                                    {opt.isVariant && (
                                                        <span className={styles.variantArrow}>
                                                            ↳{" "}
                                                        </span>
                                                    )}
                                                    {opt.label}
                                                </Text>
                                            </label>
                                        );
                                    })
                                )}
                            </div>
                        </div>
                    </DrawerLayout>
                </SystemDrawer>
            </section>
        );
    }

    return (
        <section className={styles.sectionCard}>
            <Text as="h3" variant="title-sm">
                Prodotti
            </Text>

            <div className={styles.inlineBlock}>
                <Text variant="caption" colorVariant="muted">
                    Seleziona prodotti
                </Text>
                <TextInput
                    placeholder="Cerca prodotto..."
                    value={productSearch}
                    onChange={e => setProductSearch(e.target.value)}
                    className={styles.productSearch}
                />
                <PillGroupMultiple
                    ariaLabel="Seleziona prodotti"
                    options={filteredProductOptions.map(opt => ({
                        value: opt.id,
                        label: opt.isVariant ? `↳ ${opt.label}` : opt.label
                    }))}
                    value={selectedProductIds}
                    onChange={value => {
                        const nextIds = [...value];
                        const nextOverrides: Record<string, ProductOverride> = {};
                        for (const id of nextIds) {
                            nextOverrides[id] = productOverrides[id] ?? {
                                overridePrice: "",
                                showOriginalPrice: false
                            };
                        }
                        onFormChange({
                            selectedProductIds: nextIds,
                            productOverrides: nextOverrides
                        });
                    }}
                    layout="auto"
                />
            </div>

            {selectedProductIds.length > 0 && (
                <div className={styles.priceList}>
                    {sortedSelectedProductIds.map(productId => {
                        const productOption = productOptionById.get(productId);
                        const isVariant = productOption?.isVariant ?? false;
                        const parentId = productOption?.parentId;
                        const parentHasOverride = parentId
                            ? selectedProductIds.includes(parentId)
                            : false;
                        const hasVariantOverrides =
                            !isVariant &&
                            selectedProductIds.some(id => {
                                const opt = productOptionById.get(id);
                                return opt?.isVariant && opt.parentId === productId;
                            });
                        const formatValues = tenantProducts.find(
                            p => p.id === productId
                        )?.format_values;

                        return (
                            <PriceOverrideRow
                                key={productId}
                                productId={productId}
                                productName={productLabelById.get(productId) ?? productId}
                                isVariant={isVariant}
                                parentHasOverride={parentHasOverride}
                                hasVariantOverrides={hasVariantOverrides}
                                formatValues={formatValues}
                                override={productOverrides[productId]}
                                productOverrides={productOverrides}
                                onOverrideChange={next =>
                                    onFormChange({ productOverrides: next })
                                }
                                onRemove={removeSelectedProduct}
                            />
                        );
                    })}
                </div>
            )}
        </section>
    );
}
