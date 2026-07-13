import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useBreadcrumbItems } from "@/context/useBreadcrumbItems";
import { usePageHeader } from "@/context/usePageHeader";
import { Button } from "@/components/ui/Button/Button";
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
import { useSchedaDraft } from "./hooks/useSchedaDraft";
import { HeaderSaveAction } from "@/pages/Dashboard/Stories/components/HeaderSaveAction";
import { useBeforeUnloadWarning } from "@/pages/Dashboard/Stories/hooks/useBeforeUnloadWarning";
import SchedaTab from "./SchedaTab";
import PrezziOpzioniTab from "./PrezziOpzioniTab";
import { UsageTab } from "./UsageTab";
import { AttributesTab } from "./AttributesTab";
import { TranslationsTab } from "@/components/ui/TranslationsTab/TranslationsTab";
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
    const [, setSearchParams] = useSearchParams();
    const [activeTab, setActiveTab] = useState<ProductPageTab>(initialTab);

    // Tab change: sincronizza ?tab= con lo stato (replace per non polluire history).
    // Il `useFilteredProductTabs` continua a gestire la legacy map al mount iniziale.
    const handleTabChange = useCallback((next: ProductPageTab) => {
        setActiveTab(next);
        setSearchParams(prev => {
            prev.set("tab", next);
            return prev;
        }, { replace: true });
    }, [setSearchParams]);

    const [optionsLoading, setOptionsLoading] = useState(true);
    const [primaryPriceGroup, setPrimaryPriceGroup] = useState<GroupWithValues | null>(null);
    const [addonGroups, setAddonGroups] = useState<GroupWithValues[]>([]);

    const [isVariantDrawerOpen, setIsVariantDrawerOpen] = useState(false);

    const [usageLoading, setUsageLoading] = useState(true);
    const [usageData, setUsageData] = useState<ProductUsageData | null>(null);

    const { showToast } = useToast();

    // Stabile: `setProduct` è già stabile (useState), ma un'arrow inline qui
    // sarebbe una nuova referenza ad ogni render — instabilità che risale a
    // handleSaveImage/Information/Notes → handleSaveAll → `actions` → loop
    // sull'effect di `usePageHeader` (già capitato, vedi diagnosi task).
    const handleProductUpdated = useCallback((updated: V2Product) => {
        setProduct(updated);
    }, []);

    // Draft Scheda sollevato qui: sopravvive allo smontaggio di `SchedaTab`
    // al cambio tab (mount condizionale sotto).
    const schedaDraft = useSchedaDraft(
        product,
        productId!,
        tenantId!,
        handleProductUpdated
    );

    // Guardia abbandono pagina — stesso hook di StoryDetailPage, riflette
    // solo il draft Scheda (unica tab con stato non salvato).
    useBeforeUnloadWarning(schedaDraft.isDirty);

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


    const breadcrumbItems = useMemo(() => [
        { label: "Prodotti", to: `/business/${tenantId}/products` },
        { label: loading ? "Caricamento..." : product?.name || "Prodotto non trovato" }
    ], [tenantId, loading, product?.name]);

    useBreadcrumbItems(breadcrumbItems);

    // Note prodotto come campo secondario read-only della tab Traduzioni
    // (memoizzato per evitare reload loop nell'effect di TranslationsTab).
    const notesSecondaryField = useMemo(
        () => ({
            entityType: "product_notes" as const,
            field: "notes" as const,
            label: "Note",
            sourceItems: product?.notes ?? []
        }),
        [product?.notes]
    );

    // ── Header band: leading (tab line controllati, sync URL) ──
    const leading = useMemo(() => (
        <Tabs<ProductPageTab>
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

    // Azione Salva/Annulla di pagina — riflette solo il draft Scheda (unica
    // tab con stato), visibile su tutti i tab come Storie.
    const actions = useMemo(
        () => (
            <HeaderSaveAction
                isDirty={schedaDraft.isDirty}
                isSaving={schedaDraft.isSavingAll}
                onSave={schedaDraft.handleSaveAll}
                onDiscard={schedaDraft.handleDiscardAll}
            />
        ),
        [schedaDraft.isDirty, schedaDraft.isSavingAll, schedaDraft.handleSaveAll, schedaDraft.handleDiscardAll]
    );

    usePageHeader({
        leading,
        actions,
        sticky: true,
    });

    if (loading) {
        return null;
    }

    if (error || !product) {
        return (
            <div className={styles.container}>
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
            {activeTab === "scheda" && (
                <SchedaTab
                    product={product}
                    productId={productId!}
                    tenantId={tenantId!}
                    vertical={selectedTenant?.vertical_type}
                    onNavigateToTab={tab =>
                        handleTabChange(tab as ProductPageTab)
                    }
                    draft={schedaDraft}
                />
            )}
            {activeTab === "prezzi-opzioni" && (
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
            )}
            {activeTab === "attributes" && verticalConfig.productSections.customAttributes && (
                <AttributesTab
                    productId={productId!}
                    tenantId={tenantId!}
                    vertical={selectedTenant?.vertical_type}
                />
            )}
            {activeTab === "translations" && product.parent_product_id === null && (
                <TranslationsTab
                    entityType="product"
                    entityId={productId!}
                    tenantId={tenantId!}
                    sourceText={product.description ?? ""}
                    fieldKey="description"
                    sectionLabel="Traduzioni descrizione"
                    sectionDescription="Modifica manualmente le traduzioni della descrizione e gestisci le note. Le modifiche manuali non vengono sovrascritte dalla traduzione automatica."
                    primaryLabel="Descrizione"
                    secondaryField={notesSecondaryField}
                    onSourceUpdated={text =>
                        setProduct(p => (p ? { ...p, description: text || null } : p))
                    }
                    flush
                />
            )}
            {activeTab === "usage" && (
                <UsageTab
                    productId={productId!}
                    tenantId={tenantId!}
                    usageData={usageData}
                    usageLoading={usageLoading}
                />
            )}

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
