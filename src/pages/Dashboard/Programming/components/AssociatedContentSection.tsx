import { NumberInput } from "@/components/ui/Input/NumberInput";
import { PillGroupMultiple } from "@/components/ui/PillGroup/PillGroupMultiple";
import { Select } from "@/components/ui/Select/Select";
import { Switch } from "@/components/ui/Switch/Switch";
import { TextInput } from "@/components/ui/Input/TextInput";
import Text from "@/components/ui/Text/Text";
import { RuleType, LayoutRuleOption } from "@/services/supabase/v2/layoutScheduling";
import styles from "../ProgrammingRuleDetail.module.scss";

interface FeaturedContentItem {
    featuredContentId: string;
    slot: "hero" | "before_catalog" | "after_catalog";
    sortOrder: number;
}

interface ProductOverride {
    overridePrice: string;
    showOriginalPrice: boolean;
    visible: boolean;
}

interface AssociatedContentSectionProps {
    ruleType: RuleType;
    catalogId?: string;
    styleId?: string;
    featuredContents?: FeaturedContentItem[];
    selectedProductIds?: string[];
    productOverrides?: Record<string, ProductOverride>;
    tenantCatalogs: LayoutRuleOption[];
    tenantStyles: LayoutRuleOption[];
    tenantFeaturedContents: LayoutRuleOption[];
    tenantProducts: LayoutRuleOption[];
    onFormChange: (
        updates: Partial<{
            catalogId: string;
            styleId: string;
            featuredContents: FeaturedContentItem[];
            selectedProductIds: string[];
            productOverrides: Record<string, ProductOverride>;
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
    tenantCatalogs,
    tenantStyles,
    tenantFeaturedContents,
    tenantProducts,
    onFormChange
}: AssociatedContentSectionProps) {
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
                                                slot: event.target.value as any
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

    // Price or Visibility Rules
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
                                showOriginalPrice: false,
                                visible: ruleType === "visibility"
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

                                    {ruleType === "visibility" && (
                                        <div className={styles.switchRow}>
                                            <Text variant="caption">Visibile</Text>
                                            <Switch
                                                checked={override?.visible ?? false}
                                                onChange={val => {
                                                    const nextOverrides = { ...productOverrides };
                                                    nextOverrides[productId] = {
                                                        ...nextOverrides[productId],
                                                        visible: val
                                                    };
                                                    onFormChange({
                                                        productOverrides: nextOverrides
                                                    });
                                                }}
                                            />
                                        </div>
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
