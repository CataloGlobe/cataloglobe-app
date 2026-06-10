import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useBreadcrumbItems } from "@/context/useBreadcrumbItems";
import { usePageHeader } from "@/context/usePageHeader";
import Text from "@/components/ui/Text/Text";
import { Button } from "@/components/ui/Button/Button";
import { useToast } from "@/context/Toast/ToastContext";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { Tabs } from "@/components/ui/Tabs/Tabs";
import { Pencil, Image, Megaphone, CalendarDays, Tag, Package } from "lucide-react";
import ProductPickerList from "./ProductPickerList";
import ProductsManagerCard from "./ProductsManagerCard";
import { ProductForm } from "@/pages/Dashboard/Products/components/ProductForm";
import { type V2Product } from "@/services/supabase/products";
import {
    type FeaturedContentWithProducts,
    type FeaturedContentType,
    getFeaturedContentById
} from "@/services/supabase/featuredContents";
import { useTenantId } from "@/context/useTenantId";
import { useSubscriptionGuard } from "@/hooks/useSubscriptionGuard";
import { usePermissions } from "@/context/PermissionsContext";
import { canDoOnAnyActivity } from "@/lib/permissions";
import { PageGate } from "@/components/PageGate/PageGate";
import { FeaturedIdentityDrawer } from "./components/FeaturedIdentityDrawer";
import { FeaturedMediaDrawer } from "./components/FeaturedMediaDrawer";
import { FeaturedPricingModeDrawer } from "./components/FeaturedPricingModeDrawer";
import { FeaturedCtaDrawer } from "./components/FeaturedCtaDrawer";
import styles from "./FeaturedContentDetailPage.module.scss";

const CONTENT_TYPE_INFO: Record<FeaturedContentType, { label: string; description: string; icon: React.ReactNode }> = {
    announcement: {
        label: "Annuncio",
        description: "Comunica un'informazione, una novità o un avviso.",
        icon: <Megaphone size={16} strokeWidth={1.75} />
    },
    event: {
        label: "Evento",
        description: "Promuovi una serata, un'inaugurazione o un'occasione speciale.",
        icon: <CalendarDays size={16} strokeWidth={1.75} />
    },
    promo: {
        label: "Promo",
        description: "Metti in evidenza una selezione di prodotti con i loro prezzi.",
        icon: <Tag size={16} strokeWidth={1.75} />
    },
    bundle: {
        label: "Bundle",
        description: "Proponi un pacchetto di prodotti a prezzo fisso.",
        icon: <Package size={16} strokeWidth={1.75} />
    }
};

export default function FeaturedContentDetailPage() {
    const { featuredId } = useParams<{ featuredId: string }>();
    const navigate = useNavigate();
    const { showToast } = useToast();
    const tenantId = useTenantId();
    const { canEdit } = useSubscriptionGuard();
    const { permissions } = usePermissions();
    const canWrite = permissions ? canDoOnAnyActivity(permissions, "featured.write") : false;

    const [content, setContent] = useState<FeaturedContentWithProducts | null>(null);
    const [loading, setLoading] = useState(true);
    const [pageError, setPageError] = useState<string | null>(null);

    type FeaturedDetailTab = "info" | "products";
    const [searchParams, setSearchParams] = useSearchParams();
    const initialTab: FeaturedDetailTab = useMemo(() => {
        const t = searchParams.get("tab");
        return t === "products" ? "products" : "info";
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    const [activeTab, setActiveTab] = useState<FeaturedDetailTab>(initialTab);

    const handleTabChange = useCallback((next: FeaturedDetailTab) => {
        setActiveTab(next);
        setSearchParams(prev => {
            prev.set("tab", next);
            return prev;
        }, { replace: true });
    }, [setSearchParams]);

    // Drawer open states
    const [isIdentityDrawerOpen, setIsIdentityDrawerOpen] = useState(false);
    const [isMediaDrawerOpen, setIsMediaDrawerOpen] = useState(false);
    const [isPricingDrawerOpen, setIsPricingDrawerOpen] = useState(false);
    const [isCtaDrawerOpen, setIsCtaDrawerOpen] = useState(false);

    // Product picker state
    const [isProductPickerOpen, setIsProductPickerOpen] = useState(false);
    const [linkedProductIds, setLinkedProductIds] = useState<string[]>([]);
    const [pendingSelectedProductIds, setPendingSelectedProductIds] = useState<string[]>([]);
    const onApplyProductsRef = useRef<((ids: string[]) => Promise<void>) | null>(null);
    const [addProductMode, setAddProductMode] = useState<"new" | "existing">("existing");
    const [isCreatingNewProduct, setIsCreatingNewProduct] = useState(false);

    const loadContent = useCallback(async () => {
        if (!featuredId || !tenantId) return;
        try {
            setLoading(true);
            setPageError(null);
            const data = await getFeaturedContentById(featuredId, tenantId);
            setContent(data);
        } catch (err) {
            console.error(err);
            setPageError("Impossibile caricare il contenuto.");
            showToast({ type: "error", message: "Errore nel caricamento del contenuto." });
        } finally {
            setLoading(false);
        }
    }, [featuredId, tenantId, showToast]);

    useEffect(() => {
        loadContent();
    }, [loadContent]);

    const closeProductPicker = () => {
        setIsProductPickerOpen(false);
        setPendingSelectedProductIds([]);
        setAddProductMode("existing");
    };

    const handleNewProductCreated = async (createdProduct?: V2Product) => {
        if (!createdProduct || !onApplyProductsRef.current) {
            closeProductPicker();
            return;
        }
        try {
            await onApplyProductsRef.current([...linkedProductIds, createdProduct.id]);
        } catch (err) {
            console.error(err);
            showToast({ type: "error", message: "Errore nell'associazione del prodotto." });
        }
        closeProductPicker();
    };

    const hasPendingProductChanges = useCallback(() => {
        const orig = new Set(linkedProductIds);
        const pend = new Set(pendingSelectedProductIds);
        if (orig.size !== pend.size) return true;
        for (const id of orig) {
            if (!pend.has(id)) return true;
        }
        return false;
    }, [linkedProductIds, pendingSelectedProductIds]);

    const applyProductSelection = async () => {
        if (!onApplyProductsRef.current) return;
        try {
            await onApplyProductsRef.current(pendingSelectedProductIds);
            closeProductPicker();
        } catch (err) {
            console.error(err);
            showToast({ type: "error", message: "Errore nel salvataggio selezione prodotti." });
        }
    };

    const breadcrumbItems = useMemo(() => [
        { label: "Contenuti in evidenza", to: `/business/${tenantId}/featured` },
        { label: loading ? "Caricamento..." : content?.title || "Dettaglio" }
    ], [tenantId, loading, content?.title]);

    useBreadcrumbItems(breadcrumbItems);

    const productsEnabled = !loading && content?.pricing_mode !== "none";

    // Se l'utente atterra con ?tab=products ma il tipo non supporta prodotti,
    // ripristina la tab Info e ripulisci ?tab=.
    useEffect(() => {
        if (!productsEnabled && activeTab === "products") {
            setActiveTab("info");
            setSearchParams(prev => {
                prev.delete("tab");
                return prev;
            }, { replace: true });
        }
    }, [productsEnabled, activeTab, setSearchParams]);

    const addProductTriggerRef = useRef<(() => void) | null>(null);

    const leading = useMemo(() => (
        <Tabs<FeaturedDetailTab>
            value={activeTab}
            onChange={handleTabChange}
            variant="line"
        >
            <Tabs.List>
                <Tabs.Tab value="info">Informazioni</Tabs.Tab>
                <Tabs.Tab
                    value="products"
                    disabled={!productsEnabled}
                    disabledTooltip="Seleziona il tipo Promo o Bundle"
                >
                    Prodotti inclusi
                </Tabs.Tab>
            </Tabs.List>
        </Tabs>
    ), [activeTab, handleTabChange, productsEnabled]);

    const actions = useMemo(() => {
        if (activeTab !== "products" || !productsEnabled || !canWrite) return undefined;
        return (
            <Button
                variant="primary"
                className={styles.toolbarCta}
                onClick={() => addProductTriggerRef.current?.()}
                disabled={!canEdit}
            >
                + Aggiungi prodotto
            </Button>
        );
    }, [activeTab, productsEnabled, canEdit, canWrite]);

    usePageHeader({
        leading,
        actions,
        sticky: true,
    });

    if (pageError) {
        return (
            <div className={styles.wrapper}>
                <Text variant="title-sm" colorVariant="error">
                    {pageError}
                </Text>
                <Button
                    variant="secondary"
                    onClick={() => navigate(`/business/${tenantId}/featured`)}
                >
                    Torna alla lista
                </Button>
            </div>
        );
    }

    const renderInfoCard = () => (
        <>
            {/* ── Identità ────────────────────────────────── */}
            <div className={styles.block}>
                <div className={styles.blockHeaderRow}>
                    <p className={styles.blockHeaderTitle}>Identità</p>
                    {canWrite && (
                        <Button
                            variant="ghost"
                            size="sm"
                            leftIcon={<Pencil size={14} />}
                            onClick={() => setIsIdentityDrawerOpen(true)}
                            disabled={loading || !canEdit}
                        >
                            Modifica
                        </Button>
                    )}
                </div>
                <div className={styles.readOnlyGrid}>
                    <div className={styles.roField}>
                        <span className={styles.roLabel}>Titolo pubblico</span>
                        <span className={styles.roValue}>{content?.title || "—"}</span>
                    </div>
                    <div className={styles.roField}>
                        <span className={styles.roLabel}>Nome interno</span>
                        <span className={styles.roValue}>{content?.internal_name || "—"}</span>
                    </div>
                    <div className={styles.roField}>
                        <span className={styles.roLabel}>Sottotitolo</span>
                        {content?.subtitle ? (
                            <span className={styles.roValue}>{content.subtitle}</span>
                        ) : (
                            <span className={styles.roValueEmpty}>Non impostato</span>
                        )}
                    </div>
                    <div className={`${styles.roField} ${styles.roFieldFull}`}>
                        <span className={styles.roLabel}>Descrizione</span>
                        {content?.description ? (
                            <span className={styles.roValue}>{content.description}</span>
                        ) : (
                            <span className={styles.roValueEmpty}>Nessuna descrizione</span>
                        )}
                    </div>
                </div>
            </div>

            {/* ── Immagine ─────────────────────────────────── */}
            <div className={styles.block}>
                <div className={styles.blockHeaderRow}>
                    <p className={styles.blockHeaderTitle}>Immagine</p>
                    {canWrite && (
                        <Button
                            variant="ghost"
                            size="sm"
                            leftIcon={<Pencil size={14} />}
                            onClick={() => setIsMediaDrawerOpen(true)}
                            disabled={loading || !canEdit}
                        >
                            Modifica
                        </Button>
                    )}
                </div>
                {content?.media_id ? (
                    <div className={styles.mediaPreview}>
                        <img
                            src={content.media_id}
                            alt="Anteprima"
                            className={styles.mediaPreviewImg}
                        />
                    </div>
                ) : (
                    <div className={styles.mediaPlaceholder}>
                        <Image size={20} strokeWidth={1.5} />
                        <span>Nessuna immagine caricata</span>
                    </div>
                )}
            </div>

            {/* ── Tipo di contenuto ────────────────────────── */}
            <div className={styles.block}>
                <div className={styles.blockHeaderRow}>
                    <p className={styles.blockHeaderTitle}>Tipo di contenuto</p>
                    {canWrite && (
                        <Button
                            variant="ghost"
                            size="sm"
                            leftIcon={<Pencil size={14} />}
                            onClick={() => setIsPricingDrawerOpen(true)}
                            disabled={loading || !canEdit}
                        >
                            Modifica
                        </Button>
                    )}
                </div>
                {content && (() => {
                    const ct = content.content_type ?? "announcement";
                    const info = CONTENT_TYPE_INFO[ct];
                    return (
                        <div className={styles.pricingModeCard}>
                            <span className={styles.pricingModeCardLabel} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                {info.icon}
                                {info.label}
                            </span>
                            <span className={styles.pricingModeCardDescription}>
                                {info.description}
                            </span>
                            {ct === "bundle" && content.bundle_price != null && (
                                <div className={styles.pricingModeBundleDetails}>
                                    <span className={styles.pricingModeBundleDetail}>
                                        Prezzo bundle:{" "}
                                        {new Intl.NumberFormat("it-IT", {
                                            style: "currency",
                                            currency: "EUR"
                                        }).format(content.bundle_price)}
                                    </span>
                                    {content.show_original_total && (
                                        <span className={styles.pricingModeBundleDetail}>
                                            Mostra totale originale: Sì
                                        </span>
                                    )}
                                </div>
                            )}
                            {(ct === "promo" || ct === "bundle") &&
                                content.layout_style === "with_images" && (
                                    <span className={styles.pricingModeBundleDetail}>
                                        Immagini prodotti: Sì
                                    </span>
                                )}
                        </div>
                    );
                })()}
            </div>

            {/* ── Call to Action ───────────────────────────── */}
            <div className={styles.block}>
                <div className={styles.blockHeaderRow}>
                    <p className={styles.blockHeaderTitle}>Call to Action</p>
                    {canWrite && (
                        <Button
                            variant="ghost"
                            size="sm"
                            leftIcon={<Pencil size={14} />}
                            onClick={() => setIsCtaDrawerOpen(true)}
                            disabled={loading || !canEdit}
                        >
                            Modifica
                        </Button>
                    )}
                </div>
                {content?.cta_text || content?.cta_url ? (
                    <div className={styles.readOnlyGrid}>
                        {content?.cta_text && (
                            <div className={styles.roField}>
                                <span className={styles.roLabel}>Testo pulsante</span>
                                <span className={styles.roValue}>{content.cta_text}</span>
                            </div>
                        )}
                        {content?.cta_url && (
                            <div className={styles.roField}>
                                <span className={styles.roLabel}>Link pulsante</span>
                                <span className={styles.roValue}>{content.cta_url}</span>
                            </div>
                        )}
                    </div>
                ) : (
                    <span className={styles.roValueEmpty}>Nessuna CTA configurata</span>
                )}
            </div>
        </>
    );

    return (
        <PageGate readPermission="featured.read">
            {() => (
        <div className={styles.wrapper}>
            {activeTab === "info" && renderInfoCard()}

            {activeTab === "products" && productsEnabled && (
                <ProductsManagerCard
                    featuredId={featuredId as string}
                    pricingMode={content?.pricing_mode ?? "none"}
                    showOriginalTotal={content?.show_original_total ?? false}
                    onOpenProductPicker={(linkedIds, onApply) => {
                        setLinkedProductIds(linkedIds);
                        setPendingSelectedProductIds(linkedIds);
                        onApplyProductsRef.current = onApply;
                        setIsProductPickerOpen(true);
                    }}
                    onRegisterAddTrigger={trigger => {
                        addProductTriggerRef.current = trigger;
                    }}
                />
            )}

            {/* ── Section drawers ──────────────────────────── */}
            {content && tenantId && (
                <>
                    <FeaturedIdentityDrawer
                        open={isIdentityDrawerOpen}
                        onClose={() => setIsIdentityDrawerOpen(false)}
                        content={content}
                        tenantId={tenantId}
                        onSuccess={loadContent}
                    />
                    <FeaturedMediaDrawer
                        open={isMediaDrawerOpen}
                        onClose={() => setIsMediaDrawerOpen(false)}
                        content={content}
                        tenantId={tenantId}
                        onSuccess={loadContent}
                    />
                    <FeaturedPricingModeDrawer
                        open={isPricingDrawerOpen}
                        onClose={() => setIsPricingDrawerOpen(false)}
                        content={content}
                        tenantId={tenantId}
                        onSuccess={loadContent}
                    />
                    <FeaturedCtaDrawer
                        open={isCtaDrawerOpen}
                        onClose={() => setIsCtaDrawerOpen(false)}
                        content={content}
                        tenantId={tenantId}
                        onSuccess={loadContent}
                    />
                </>
            )}

            {/* ── Product picker drawer ────────────────────── */}
            <SystemDrawer open={isProductPickerOpen} onClose={closeProductPicker} width={640}>
                <DrawerLayout
                    header={
                        <div className={styles.pickerDrawerHeader}>
                            <Text variant="title-sm" weight={700}>
                                Aggiungi prodotto
                            </Text>
                            <Tabs
                                value={addProductMode}
                                onChange={v => setAddProductMode(v as "new" | "existing")}
                            >
                                <Tabs.List>
                                    <Tabs.Tab value="new">Nuovo</Tabs.Tab>
                                    <Tabs.Tab value="existing">Esistente</Tabs.Tab>
                                </Tabs.List>
                            </Tabs>
                        </div>
                    }
                    footer={
                        addProductMode === "new" ? (
                            <>
                                <Button variant="secondary" onClick={closeProductPicker}>
                                    Annulla
                                </Button>
                                <Button
                                    variant="primary"
                                    type="submit"
                                    form="product-form-featured"
                                    loading={isCreatingNewProduct}
                                    disabled={isCreatingNewProduct}
                                >
                                    Crea e associa
                                </Button>
                            </>
                        ) : (
                            <>
                                <Button variant="secondary" onClick={closeProductPicker}>
                                    Annulla
                                </Button>
                                <Button
                                    variant="primary"
                                    onClick={applyProductSelection}
                                    disabled={!hasPendingProductChanges()}
                                >
                                    Applica
                                </Button>
                            </>
                        )
                    }
                >
                    {addProductMode === "new" ? (
                        <ProductForm
                            formId="product-form-featured"
                            mode="create_base"
                            productData={null}
                            parentProduct={null}
                            tenantId={tenantId ?? null}
                            onSuccess={handleNewProductCreated}
                            onSavingChange={setIsCreatingNewProduct}
                            skipAutoNavigate
                        />
                    ) : (
                        <ProductPickerList
                            selectedProductIds={pendingSelectedProductIds}
                            onSelectionChange={setPendingSelectedProductIds}
                        />
                    )}
                </DrawerLayout>
            </SystemDrawer>
        </div>
            )}
        </PageGate>
    );
}
