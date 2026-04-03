import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import Breadcrumb from "@/components/ui/Breadcrumb/Breadcrumb";
import PageHeader from "@/components/ui/PageHeader/PageHeader";
import { Button } from "@/components/ui/Button/Button";
import { Card } from "@/components/ui/Card/Card";
import { Tabs } from "@/components/ui/Tabs/Tabs";
import Text from "@/components/ui/Text/Text";
import { useTenantId } from "@/context/useTenantId";
import { useTenant } from "@/context/useTenant";
import { useToast } from "@/context/Toast/ToastContext";
import { getProduct, V2Product } from "@/services/supabase/products";
import { getProductOptions, GroupWithValues } from "@/services/supabase/productOptions";
import { getVariantMatrixConfig, VariantMatrixConfig } from "@/services/supabase/productVariants";
import { getProductUsage, ProductUsageData } from "@/services/supabase/productUsage";
import { GeneralTab } from "./GeneralTab";
import { PricingTab } from "./PricingTab";
import { ConfigTab } from "./ConfigTab";
import { UsageTab } from "./UsageTab";
import { VariantsTab } from "./VariantsTab";
import { AttributesTab } from "./AttributesTab";
import { ProductCreateEditDrawer } from "./ProductCreateEditDrawer";
import { MatrixConfigDrawer } from "./MatrixConfigDrawer";
import styles from "./ProductPage.module.scss";

export default function ProductPage() {
    const { productId } = useParams<{ productId: string }>();
    const navigate = useNavigate();
    const location = useLocation();
    const tenantId = useTenantId();
    const { selectedTenant } = useTenant();
    const queryTab = new URLSearchParams(location.search).get("tab");

    const [product, setProduct] = useState<V2Product | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    // Map legacy "variants" deep-links to "pricing" (tab no longer exists separately).
    const initialTab = queryTab === "variants" ? "pricing" : (queryTab || "general");
    const [activeTab, setActiveTab] = useState(initialTab);

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

            <Tabs value={activeTab} onChange={setActiveTab}>
                <Tabs.List>
                    <Tabs.Tab value="general">Generale</Tabs.Tab>
                    <Tabs.Tab value="pricing">Prezzi & Varianti</Tabs.Tab>
                    <Tabs.Tab value="config">Opzioni</Tabs.Tab>
                    <Tabs.Tab value="attributes">Attributi</Tabs.Tab>
                    <Tabs.Tab value="usage">Utilizzo</Tabs.Tab>
                </Tabs.List>

                <div className={styles.tabContent}>
                    <Tabs.Panel value="general">
                        <Card>
                            <GeneralTab
                                product={product}
                                tenantId={tenantId!}
                                onProductUpdated={updated => setProduct(updated)}
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

                    <Tabs.Panel value="attributes">
                        <Card>
                            <AttributesTab
                                productId={productId!}
                                tenantId={tenantId!}
                                vertical={selectedTenant?.vertical_type}
                            />
                        </Card>
                    </Tabs.Panel>

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
