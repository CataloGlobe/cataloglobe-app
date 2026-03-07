import { useMemo, useState } from "react";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { Button } from "@/components/ui/Button/Button";
import { NumberInput } from "@/components/ui/Input/NumberInput";
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
} from "@/services/supabase/v2/layoutScheduling";
import styles from "../ProgrammingRuleDetail.module.scss";

interface FeaturedContentItem {
    featuredContentId: string;
    slot: "hero" | "before_catalog" | "after_catalog";
    sortOrder: number;
}

interface ProductOverride {
    overridePrice: string;
    showOriginalPrice: boolean;
}

interface AssociatedContentSectionProps {
    ruleType: RuleType;
    catalogId?: string;
    styleId?: string;
    featuredContents?: FeaturedContentItem[];
    selectedProductIds?: string[];
    productOverrides?: Record<string, ProductOverride>;
    visibilityProductModes?: Record<string, VisibilityMode>;
    tenantCatalogs: LayoutRuleOption[];
    tenantStyles: LayoutRuleOption[];
    tenantFeaturedContents: LayoutRuleOption[];
    tenantProducts: LayoutRuleOption[];
    tenantProductGroups?: LayoutRuleOption[];
    tenantProductGroupItems?: ProductGroupAssignmentOption[];
    onFormChange: (
        updates: Partial<{
            catalogId: string;
            styleId: string;
            featuredContents: FeaturedContentItem[];
            selectedProductIds: string[];
            productOverrides: Record<string, ProductOverride>;
            visibilityProductModes: Record<string, VisibilityMode>;
        }>
    ) => void;
}

export function AssociatedContentSection({
    ruleType,
    catalogId,
    styleId,
    featuredContents = [],
    selectedProductIds = [],
    productOverrides = {},
    visibilityProductModes = {},
    tenantCatalogs,
    tenantStyles,
    tenantFeaturedContents,
    tenantProducts,
    tenantProductGroups = [],
    tenantProductGroupItems = [],
    onFormChange
}: AssociatedContentSectionProps) {
    const [isProductsDrawerOpen, setIsProductsDrawerOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const [selectedGroupId, setSelectedGroupId] = useState("");
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

    const filteredProducts = useMemo(() => {
        const normalizedSearch = searchTerm.trim().toLowerCase();
        const allowedProductIds =
            selectedGroupId.length > 0 ? productIdSetByGroupId.get(selectedGroupId) : null;

        return tenantProducts.filter(product => {
            if (allowedProductIds && !allowedProductIds.has(product.id)) return false;
            if (!normalizedSearch) return true;
            return product.name.toLowerCase().includes(normalizedSearch);
        });
    }, [productIdSetByGroupId, searchTerm, selectedGroupId, tenantProducts]);

    const sortedSelectedProductIds = useMemo(
        () =>
            [...selectedProductIds].sort((a, b) => {
                const aName = tenantProducts.find(product => product.id === a)?.name ?? a;
                const bName = tenantProducts.find(product => product.id === b)?.name ?? b;
                return aName.localeCompare(bName, "it");
            }),
        [selectedProductIds, tenantProducts]
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

                <div className={styles.inlineBlock}>
                    <Text variant="caption" colorVariant="muted">
                        Contenuti in evidenza
                    </Text>
                    <PillGroupMultiple
                        ariaLabel="Seleziona contenuti in evidenza"
                        options={tenantFeaturedContents.map(content => ({
                            value: content.id,
                            label: content.name
                        }))}
                        value={featuredContents.map(fc => fc.featuredContentId)}
                        onChange={value => {
                            const nextIds = [...value];
                            const nextFeaturedContents = nextIds.map(id => {
                                const existing = featuredContents.find(
                                    fc => fc.featuredContentId === id
                                );
                                return (
                                    existing ?? {
                                        featuredContentId: id,
                                        slot: "hero" as const,
                                        sortOrder: 0
                                    }
                                );
                            });
                            onFormChange({ featuredContents: nextFeaturedContents });
                        }}
                        layout="auto"
                    />
                </div>

                {featuredContents.length > 0 && (
                    <div className={styles.itemCards}>
                        {featuredContents.map((fc, index) => (
                            <div key={fc.featuredContentId} className={styles.itemCard}>
                                <Text variant="body-sm" weight={600}>
                                    {tenantFeaturedContents.find(
                                        opt => opt.id === fc.featuredContentId
                                    )?.name ?? fc.featuredContentId}
                                </Text>

                                <div className={styles.itemCardControls}>
                                    <Select
                                        label="Slot"
                                        value={fc.slot}
                                        onChange={event => {
                                            const copy = [...featuredContents];
                                            copy[index] = {
                                                ...copy[index],
                                                slot: event.target.value as FeaturedContentItem["slot"]
                                            };
                                            onFormChange({ featuredContents: copy });
                                        }}
                                        options={[
                                            { value: "hero", label: "Hero" },
                                            {
                                                value: "before_catalog",
                                                label: "Prima del catalogo"
                                            },
                                            { value: "after_catalog", label: "Dopo il catalogo" }
                                        ]}
                                    />

                                    <NumberInput
                                        label="Ordinamento"
                                        value={String(fc.sortOrder)}
                                        onChange={event => {
                                            const val = Number(event.target.value);
                                            const copy = [...featuredContents];
                                            copy[index] = {
                                                ...copy[index],
                                                sortOrder: Number.isNaN(val) ? 0 : val
                                            };
                                            onFormChange({ featuredContents: copy });
                                        }}
                                        min={0}
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                )}
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
                            const productName =
                                tenantProducts.find(product => product.id === productId)?.name ??
                                productId;
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
                                                        [productId]:
                                                            event.target.value as VisibilityMode
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
                                    filteredProducts.map(product => {
                                        const checked = pendingSelectedIds.includes(product.id);
                                        return (
                                            <label
                                                key={product.id}
                                                className={styles.visibilityDrawerListItem}
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={checked}
                                                    onChange={event =>
                                                        togglePendingProduct(
                                                            product.id,
                                                            event.target.checked
                                                        )
                                                    }
                                                />
                                                <Text variant="body-sm">{product.name}</Text>
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
                <PillGroupMultiple
                    ariaLabel="Seleziona prodotti"
                    options={tenantProducts.map(product => ({
                        value: product.id,
                        label: product.name
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
                <div className={styles.itemCards}>
                    {selectedProductIds.map(productId => {
                        const override = productOverrides[productId];
                        const productName =
                            tenantProducts.find(p => p.id === productId)?.name ?? productId;

                        return (
                            <div key={productId} className={styles.itemCard}>
                                <Text variant="body-sm" weight={600}>
                                    {productName}
                                </Text>

                                <div className={styles.itemCardControls}>
                                    {ruleType === "price" && (
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
                                                    onFormChange({
                                                        productOverrides: nextOverrides
                                                    });
                                                }}
                                                placeholder="0.00"
                                            />
                                            <div className={styles.switchRow}>
                                                <Text variant="caption">
                                                    Mostra prezzo originale
                                                </Text>
                                                <Switch
                                                    checked={override?.showOriginalPrice ?? false}
                                                    onChange={val => {
                                                        const nextOverrides = {
                                                            ...productOverrides
                                                        };
                                                        nextOverrides[productId] = {
                                                            ...nextOverrides[productId],
                                                            showOriginalPrice: val
                                                        };
                                                        onFormChange({
                                                            productOverrides: nextOverrides
                                                        });
                                                    }}
                                                />
                                            </div>
                                        </>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </section>
    );
}
