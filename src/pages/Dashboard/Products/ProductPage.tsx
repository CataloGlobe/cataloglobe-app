import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Breadcrumb from "@/components/ui/Breadcrumb/Breadcrumb";
import PageHeader from "@/components/ui/PageHeader/PageHeader";
import { Button } from "@/components/ui/Button/Button";
import { Card } from "@/components/ui/Card/Card";
import { Tabs } from "@/components/ui/Tabs/Tabs";
import Text from "@/components/ui/Text/Text";
import { useTenantId } from "@/context/useTenantId";
import { useTenant } from "@/context/useTenant";
import { useToast } from "@/context/Toast/ToastContext";
import { useVerticalConfig } from "@/hooks/useVerticalConfig";
import {
    useFilteredProductTabs,
    type ProductTabDef
} from "@/hooks/useFilteredProductTabs";
import { getProduct, V2Product } from "@/services/supabase/products";
import { getProductOptions, GroupWithValues } from "@/services/supabase/productOptions";
import { getVariantMatrixConfig, VariantMatrixConfig } from "@/services/supabase/productVariants";
import { getProductUsage, ProductUsageData } from "@/services/supabase/productUsage";
import DetailsTab from "./DetailsTab";
import { PricingTab } from "./PricingTab";
import { ConfigTab } from "./ConfigTab";
import { UsageTab } from "./UsageTab";
import { VariantsTab } from "./VariantsTab";
import { AttributesTab } from "./AttributesTab";
import { TranslationsTab } from "./TranslationsTab";
import { ProductCreateEditDrawer } from "./ProductCreateEditDrawer";
import { MatrixConfigDrawer } from "./MatrixConfigDrawer";
import styles from "./ProductPage.module.scss";

export default function ProductPage() {
    const { productId } = useParams<{ productId: string }>();
    const navigate = useNavigate();
    const tenantId = useTenantId();
    const { selectedTenant } = useTenant();
    const verticalConfig = useVerticalConfig();

    const [product, setProduct] = useState<V2Product | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    type ProductPageTab =
        | "details"
        | "pricing"
        | "config"
        | "attributes"
        | "translations"
        | "usage";
    const allTabs = useMemo<ProductTabDef<ProductPageTab>[]>(
        () => [
            { value: "details", label: "Dettagli" },
            {
                value: "pricing",
                label: product?.parent_product_id ? "Prezzi" : "Prezzi & Varianti"
            },
            { value: "config", label: "Opzioni" },
            {
                value: "attributes",
                label: verticalConfig.copy.productSections.customAttributes,
                gated: c => c.productSections.customAttributes
            },
            {
                value: "translations",
                label: "Traduzioni",
                // Translations live on the base product; variants inherit the
                // parent's translated description through the resolver.
                gated: () => product === null || product.parent_product_id === null
            },
            { value: "usage", label: "Utilizzo" }
        ],
        [product, verticalConfig]
    );
    const { visibleTabs, initialTab } = useFilteredProductTabs<ProductPageTab>(
        allTabs,
        "details",
        // Legacy redirects:
        // - ?tab=variants used to be a separate tab; merged into pricing
        // - ?tab=general / ?tab=characteristics merged into details (Task 1.1)
        {
            variants: "pricing",
            general: "details",
            characteristics: "details"
        }
    );
    const [activeTab, setActiveTab] = useState<ProductPageTab>(initialTab);

    const [optionsLoading, setOptionsLoading] = useState(true);
    const [primaryPriceGroup, setPrimaryPriceGroup] = useState<GroupWithValues | null>(null);
    const [addonGroups, setAddonGroups] = useState<GroupWithValues[]>([]);

    const [isVariantDrawerOpen, setIsVariantDrawerOpen] = useState(false);

    const [matrixConfig, setMatrixConfig] = useState<VariantMatrixConfig | null>(null);
    const [matrixLoading, setMatrixLoading] = useState(false);
    const [isMatrixDrawerOpen, setIsMatrixDrawerOpen] = useState(false);

    const [usageLoading, setUsageLoading] = useState(true);
    const [usageData, setUsageData] = useState<ProductUsageData | null>(null);

    const { showToast } = useToast();

    const loadOptions = useCallback(async () => {
        if (!productId) return;
        try {
            setOptionsLoading(true);
            const opts = await getProductOptions(productId);
            setPrimaryPriceGroup(opts.primaryPriceGroup);
            setAddonGroups(opts.addonGroups);
        } catch {
            showToast({ message: "Errore caricamento opzioni", type: "error" });
        } finally {
            setOptionsLoading(false);
        }
    }, [productId, showToast]);

    const loadUsage = useCallback(async () => {
        if (!productId || !tenantId) return;
        try {
            setUsageLoading(true);
            const data = await getProductUsage(productId, tenantId);
            setUsageData(data);
        } catch {
            setUsageData({ catalogs: [], schedules: [], activities: [] });
        } finally {
            setUsageLoading(false);
        }
    }, [productId, tenantId]);

    const loadMatrixConfig = useCallback(async (pid: string, tid: string, isBaseProduct: boolean) => {
        if (!isBaseProduct) return;
        try {
            setMatrixLoading(true);
            const config = await getVariantMatrixConfig(pid, tid);
            setMatrixConfig(config);
        } catch {
            setMatrixConfig(null);
        } finally {
            setMatrixLoading(false);
        }
    }, []);

    const loadProduct = useCallback(async () => {
        if (!productId || !tenantId) return;
        try {
            setLoading(true);
            setError(null);
            const data = await getProduct(productId, tenantId);
            setProduct(data);
            await Promise.all([
                loadOptions(),
                loadUsage(),
                loadMatrixConfig(productId, tenantId, data.parent_product_id === null)
            ]);
        } catch {
            setError("Prodotto non trovato");
        } finally {
            setLoading(false);
        }
    }, [productId, tenantId, loadOptions, loadUsage, loadMatrixConfig]);

    useEffect(() => {
        loadProduct();
    }, [loadProduct]);


    const breadcrumbItems = [
        { label: "Prodotti", to: `/business/${tenantId}/products` },
        { label: loading ? "Caricamento..." : product?.name || "Prodotto non trovato" }
    ];

    if (loading) {
        return (
            <div className={styles.container}>
                <Breadcrumb items={breadcrumbItems} />
                <PageHeader title="Caricamento prodotto..." />
            </div>
        );
    }

    if (error || !product) {
        return (
            <div className={styles.container}>
                <Breadcrumb items={breadcrumbItems} />
                <div className={styles.errorBlock}>
                    <Text variant="title-sm" colorVariant="error">
                        {error || "Prodotto non trovato"}
                    </Text>
                    <div className={styles.errorActions}>
                        <Button variant="secondary" onClick={() => navigate(`/business/${tenantId}/products`)}>
                            Torna alla lista
                        </Button>
                    </div>
                </div>
            </div>
        );
    }

    const isChildVariant = product.parent_product_id !== null;

    return (
        <div className={styles.container}>
            <Breadcrumb items={breadcrumbItems} />

            <PageHeader title={product.name} />

            <Tabs value={activeTab} onChange={val => setActiveTab(val as ProductPageTab)}>
                <Tabs.List>
                    {visibleTabs.map(tab => (
                        <Tabs.Tab key={tab.value} value={tab.value}>
                            {tab.label}
                        </Tabs.Tab>
                    ))}
                </Tabs.List>

                <div className={styles.tabContent}>
                    <Tabs.Panel value="details">
                        <Card>
                            <DetailsTab
                                product={product}
                                productId={productId!}
                                tenantId={tenantId!}
                                vertical={selectedTenant?.vertical_type}
                                onProductUpdated={updated => setProduct(updated)}
                                onNavigateToTab={tab =>
                                    setActiveTab(tab as ProductPageTab)
                                }
                            />
                        </Card>
                    </Tabs.Panel>

                    <Tabs.Panel value="pricing">
                        <Card>
                            <PricingTab
                                product={product}
                                tenantId={tenantId!}
                                primaryPriceGroup={primaryPriceGroup}
                                optionsLoading={optionsLoading}
                                onRefreshOptions={loadOptions}
                                onProductUpdated={updated => setProduct(updated)}
                            />
                        </Card>
                        {!isChildVariant && (
                            <div className={styles.tabSectionGap}>
                                <VariantsTab
                                    product={product}
                                    tenantId={tenantId!}
                                    onOpenVariantDrawer={() => setIsVariantDrawerOpen(true)}
                                    onVariantUpdated={loadProduct}
                                />
                            </div>
                        )}
                    </Tabs.Panel>

                    <Tabs.Panel value="config">
                        <Card>
                            <ConfigTab
                                productId={productId!}
                                tenantId={tenantId!}
                                addonGroups={addonGroups}
                                optionsLoading={optionsLoading}
                                onRefreshOptions={loadOptions}
                            />
                        </Card>
                    </Tabs.Panel>

                    {verticalConfig.productSections.customAttributes && (
                        <Tabs.Panel value="attributes">
                            <Card>
                                <AttributesTab
                                    productId={productId!}
                                    tenantId={tenantId!}
                                    vertical={selectedTenant?.vertical_type}
                                />
                            </Card>
                        </Tabs.Panel>
                    )}

                    {product.parent_product_id === null && (
                        <Tabs.Panel value="translations">
                            <Card>
                                <TranslationsTab
                                    productId={productId!}
                                    tenantId={tenantId!}
                                    product={product}
                                />
                            </Card>
                        </Tabs.Panel>
                    )}

                    <Tabs.Panel value="usage">
                        <Card>
                            <UsageTab
                                productId={productId!}
                                usageData={usageData}
                                usageLoading={usageLoading}
                            />
                        </Card>
                    </Tabs.Panel>
                </div>
            </Tabs>

            <ProductCreateEditDrawer
                open={isVariantDrawerOpen}
                onClose={() => setIsVariantDrawerOpen(false)}
                mode="create_variant"
                productData={null}
                parentProduct={product}
                tenantId={tenantId ?? undefined}
                onSuccess={() => {
                    setIsVariantDrawerOpen(false);
                    loadProduct();
                }}
            />

            {product.parent_product_id === null && tenantId && (
                <MatrixConfigDrawer
                    open={isMatrixDrawerOpen}
                    onClose={() => setIsMatrixDrawerOpen(false)}
                    productId={product.id}
                    tenantId={tenantId}
                    parentBasePrice={product.base_price}
                    matrixConfig={matrixConfig}
                    onSaveSuccess={() => loadMatrixConfig(product.id, tenantId, true)}
                    onGenerateSuccess={() => loadProduct()}
                />
            )}
        </div>
    );
}
