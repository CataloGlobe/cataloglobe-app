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
import { getProductUsage, ProductUsageData } from "@/services/supabase/productUsage";
import SchedaTab from "./SchedaTab";
import PrezziOpzioniTab from "./PrezziOpzioniTab";
import { UsageTab } from "./UsageTab";
import { AttributesTab } from "./AttributesTab";
import { TranslationsTab } from "./TranslationsTab";
import { ProductCreateEditDrawer } from "./ProductCreateEditDrawer";
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
        | "scheda"
        | "prezzi-opzioni"
        | "attributes"
        | "translations"
        | "usage";
    const allTabs = useMemo<ProductTabDef<ProductPageTab>[]>(
        () => [
            { value: "scheda", label: "Scheda" },
            { value: "prezzi-opzioni", label: "Prezzi & Opzioni" },
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
        "scheda",
        // Legacy redirects:
        // - ?tab=general / ?tab=characteristics merged into details (Task 1.1)
        // - ?tab=details renamed to ?tab=scheda (Task 1.5)
        // - ?tab=pricing / ?tab=config / ?tab=variants merged into
        //   prezzi-opzioni (Task 2.1)
        {
            general: "scheda",
            characteristics: "scheda",
            details: "scheda",
            pricing: "prezzi-opzioni",
            config: "prezzi-opzioni",
            variants: "prezzi-opzioni"
        }
    );
    const [activeTab, setActiveTab] = useState<ProductPageTab>(initialTab);

    const [optionsLoading, setOptionsLoading] = useState(true);
    const [primaryPriceGroup, setPrimaryPriceGroup] = useState<GroupWithValues | null>(null);
    const [addonGroups, setAddonGroups] = useState<GroupWithValues[]>([]);

    const [isVariantDrawerOpen, setIsVariantDrawerOpen] = useState(false);

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

    const loadProduct = useCallback(async () => {
        if (!productId || !tenantId) return;
        try {
            setLoading(true);
            setError(null);
            const data = await getProduct(productId, tenantId);
            setProduct(data);
            await Promise.all([loadOptions(), loadUsage()]);
        } catch {
            setError("Prodotto non trovato");
        } finally {
            setLoading(false);
        }
    }, [productId, tenantId, loadOptions, loadUsage]);

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
                    <Tabs.Panel value="scheda">
                        <Card>
                            <SchedaTab
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

                    <Tabs.Panel value="prezzi-opzioni">
                        <Card>
                            <PrezziOpzioniTab
                                product={product}
                                productId={productId!}
                                tenantId={tenantId!}
                                primaryPriceGroup={primaryPriceGroup}
                                addonGroups={addonGroups}
                                optionsLoading={optionsLoading}
                                onRefreshOptions={loadOptions}
                                onProductUpdated={updated => setProduct(updated)}
                                onOpenVariantDrawer={() => setIsVariantDrawerOpen(true)}
                                onVariantUpdated={loadProduct}
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
                                tenantId={tenantId!}
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
        </div>
    );
}
