import { useEffect, useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import Breadcrumb from "@/components/ui/Breadcrumb/Breadcrumb";
import PageHeader from "@/components/ui/PageHeader/PageHeader";
import { Button } from "@/components/ui/Button/Button";
import { Card } from "@/components/ui/Card/Card";
import { Tabs } from "@/components/ui/Tabs/Tabs";
import Text from "@/components/ui/Text/Text";
import { useTenantId } from "@/context/useTenantId";
import { getProduct, V2Product } from "@/services/supabase/v2/products";
import { getProductOptions, GroupWithValues } from "@/services/supabase/v2/productOptions";
import { supabase } from "@/services/supabase/client";
import { GeneralTab } from "./GeneralTab";
import { PricingTab } from "./PricingTab";
import { ConfigTab } from "./ConfigTab";
import { UsageTab } from "./UsageTab";
import styles from "./ProductPage.module.scss";

export default function ProductPage() {
    const { productId } = useParams<{ productId: string }>();
    const navigate = useNavigate();
    const location = useLocation();
    const tenantId = useTenantId();
    const queryTab = new URLSearchParams(location.search).get("tab");

    const [product, setProduct] = useState<V2Product | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState(queryTab || "general");

    const [optionsLoading, setOptionsLoading] = useState(true);
    const [primaryPriceGroup, setPrimaryPriceGroup] = useState<GroupWithValues | null>(null);
    const [addonGroups, setAddonGroups] = useState<GroupWithValues[]>([]);

    const [usageLoading, setUsageLoading] = useState(true);
    const [usageData, setUsageData] = useState<{
        catalogs: { id: string; name: string }[];
        schedules: { id: string; name: string }[];
        activities: { id: string; name: string }[];
    } | null>(null);

    const loadOptions = async () => {
        if (!productId) return;
        try {
            setOptionsLoading(true);
            const opts = await getProductOptions(productId);
            setPrimaryPriceGroup(opts.primaryPriceGroup);
            setAddonGroups(opts.addonGroups);
        } catch (err) {
            console.error("Errore caricamento opzioni:", err);
        } finally {
            setOptionsLoading(false);
        }
    };

    const loadUsage = async () => {
        if (!productId) return;
        try {
            setUsageLoading(true);

            // Step 1: catalog IDs that contain this product
            console.log("[usage] step1 start", productId);
            const { data: catalogItems, error: ciError } = await supabase
                .from("v2_catalog_category_products")
                .select("catalog_id")
                .eq("product_id", productId);
            if (ciError) throw new Error(`step1: ${ciError.message}`);

            const catalogIds = (catalogItems ?? [])
                .map((r: any) => r.catalog_id)
                .filter(Boolean) as string[];
            console.log("[usage] step1 catalogIds", catalogIds);

            // Step 2: catalog names
            let catalogs: { id: string; name: string }[] = [];
            if (catalogIds.length > 0) {
                const { data: catalogsData, error: cError } = await supabase
                    .from("v2_catalogs")
                    .select("id, name")
                    .in("id", catalogIds);
                if (cError) throw new Error(`step2: ${cError.message}`);
                catalogs = (catalogsData ?? []) as { id: string; name: string }[];
                console.log("[usage] step2 catalogs", catalogs);
            }

            // Step 3: schedules that reference those catalogs via v2_schedule_layout
            let schedules: { id: string; name: string }[] = [];
            let activities: { id: string; name: string }[] = [];
            if (catalogIds.length > 0) {
                const { data: layoutData, error: layoutError } = await supabase
                    .from("v2_schedule_layout")
                    .select("schedule_id")
                    .in("catalog_id", catalogIds);
                if (layoutError) throw new Error(`step3 layout: ${layoutError.message}`);

                const scheduleIds = [
                    ...new Set(
                        (layoutData ?? [])
                            .map((r: any) => r.schedule_id)
                            .filter(Boolean) as string[]
                    )
                ];
                console.log("[usage] step3 scheduleIds", scheduleIds);

                if (scheduleIds.length > 0) {
                    const { data: schedulesData, error: sError } = await supabase
                        .from("v2_schedules")
                        .select("id, name, target_type, target_id")
                        .in("id", scheduleIds);
                    if (sError) throw new Error(`step3 schedules: ${sError.message}`);
                    schedules = (schedulesData ?? []).map((s: any) => ({ id: s.id, name: s.name }));
                    console.log("[usage] step3 schedules", schedules);

                    // Step 4: activities – read directly from v2_schedules.target_type/target_id
                    const activityIds = [
                        ...new Set(
                            (schedulesData ?? [])
                                .filter((s: any) => s.target_type === "activity" && s.target_id)
                                .map((s: any) => s.target_id as string)
                        )
                    ];
                    console.log("[usage] step4 activityIds", activityIds);

                    if (activityIds.length > 0) {
                        const { data: activitiesData, error: aError } = await supabase
                            .from("v2_activities")
                            .select("id, name")
                            .in("id", activityIds)
                            .order("name", { ascending: true });
                        if (aError) throw new Error(`step4 activities: ${aError.message}`);
                        activities = (activitiesData ?? []) as { id: string; name: string }[];
                        console.log("[usage] step4 activities", activities);
                    }
                }
            }

            setUsageData({ catalogs, schedules, activities });
        } catch (err) {
            console.error("[usage] ERRORE:", err);
            setUsageData({ catalogs: [], schedules: [], activities: [] });
        } finally {
            setUsageLoading(false);
        }
    };

    const loadProduct = async () => {
        if (!productId || !tenantId) return;
        try {
            setLoading(true);
            setError(null);
            const data = await getProduct(productId, tenantId);
            setProduct(data);
        } catch (err: any) {
            console.error(err);
            setError("Prodotto non trovato");
        } finally {
            setLoading(false);
        }

        await Promise.all([loadOptions(), loadUsage()]);
    };

    useEffect(() => {
        loadProduct();
    }, [productId, tenantId]);

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
                <div style={{ marginTop: "24px" }}>
                    <Text variant="title-sm" colorVariant="error">
                        {error || "Prodotto non trovato"}
                    </Text>
                    <div style={{ marginTop: "16px" }}>
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

            <Tabs value={activeTab} onChange={setActiveTab}>
                <Tabs.List>
                    <Tabs.Tab value="general">Generale</Tabs.Tab>
                    <Tabs.Tab value="pricing">Prezzi</Tabs.Tab>
                    <Tabs.Tab value="config">Configurazioni</Tabs.Tab>
                    <Tabs.Tab value="usage">Utilizzo</Tabs.Tab>
                </Tabs.List>

                <div style={{ marginTop: "24px" }}>
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
        </div>
    );
}
