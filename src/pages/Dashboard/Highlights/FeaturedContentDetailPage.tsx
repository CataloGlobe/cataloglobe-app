import React, { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import PageHeader from "@/components/ui/PageHeader/PageHeader";
import Text from "@/components/ui/Text/Text";
import { Card } from "@/components/ui/Card/Card";
import { Button } from "@/components/ui/Button/Button";
import { useToast } from "@/context/Toast/ToastContext";
import Breadcrumb from "@/components/ui/Breadcrumb/Breadcrumb";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { Tabs } from "@/components/ui/Tabs/Tabs";
import { Pencil, Image } from "lucide-react";
import ProductPickerList from "./ProductPickerList";
import ProductsManagerCard from "./ProductsManagerCard";
import { ProductForm } from "@/pages/Dashboard/Products/components/ProductForm";
import { type V2Product } from "@/services/supabase/products";
import {
    type FeaturedContentWithProducts,
    type FeaturedContentPricingMode,
    getFeaturedContentById
} from "@/services/supabase/featuredContents";
import { useTenantId } from "@/context/useTenantId";
import { useSubscriptionGuard } from "@/hooks/useSubscriptionGuard";
import { FeaturedIdentityDrawer } from "./components/FeaturedIdentityDrawer";
import { FeaturedMediaDrawer } from "./components/FeaturedMediaDrawer";
import { FeaturedPricingModeDrawer } from "./components/FeaturedPricingModeDrawer";
import { FeaturedCtaDrawer } from "./components/FeaturedCtaDrawer";
import styles from "./FeaturedContentDetailPage.module.scss";

const PRICING_MODE_INFO: Record<FeaturedContentPricingMode, { label: string; description: string }> = {
    none: {
        label: "Solo informativo",
        description: "Banner editoriale senza listino prezzi. Titolo, testo e CTA."
    },
    per_item: {
        label: "Con prodotti",
        description: "Mostra una lista di prodotti con il loro prezzo singolo."
    },
    bundle: {
        label: "Prezzo fisso",
        description: "Aggrega prodotti con un unico prezzo bundle definito da te."
    }
};

export default function FeaturedContentDetailPage() {
    const { featuredId } = useParams<{ featuredId: string }>();
    const navigate = useNavigate();
    const { showToast } = useToast();
    const tenantId = useTenantId();
    const { canEdit } = useSubscriptionGuard();

    const [content, setContent] = useState<FeaturedContentWithProducts | null>(null);
    const [loading, setLoading] = useState(true);
    const [pageError, setPageError] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<"info" | "products">("info");

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

    const breadcrumbItems = [
        { label: "Contenuti in evidenza", to: `/business/${tenantId}/featured` },
        { label: loading ? "Caricamento..." : content?.title || "Dettaglio" }
    ];

    if (pageError) {
        return (
            <div className={styles.wrapper}>
                <Breadcrumb items={breadcrumbItems} />
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
        <Card>
            {/* ── Identità ────────────────────────────────── */}
            <div className={styles.block}>
                <div className={styles.blockHeaderRow}>
                    <p className={styles.blockHeaderTitle}>Identità</p>
                    <Button
                        variant="ghost"
                        size="sm"
                        leftIcon={<Pencil size={14} />}
                        onClick={() => setIsIdentityDrawerOpen(true)}
                        disabled={loading || !canEdit}
                    >
                        Modifica
                    </Button>
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
                    <Button
                        variant="ghost"
                        size="sm"
                        leftIcon={<Pencil size={14} />}
                        onClick={() => setIsMediaDrawerOpen(true)}
                        disabled={loading || !canEdit}
                    >
                        Modifica
                    </Button>
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

            {/* ── Modalità contenuto ───────────────────────── */}
            <div className={styles.block}>
                <div className={styles.blockHeaderRow}>
                    <p className={styles.blockHeaderTitle}>Modalità contenuto</p>
                    <Button
                        variant="ghost"
                        size="sm"
                        leftIcon={<Pencil size={14} />}
                        onClick={() => setIsPricingDrawerOpen(true)}
                        disabled={loading || !canEdit}
                    >
                        Modifica
                    </Button>
                </div>
                {content && (
                    <div className={styles.pricingModeCard}>
                        <span className={styles.pricingModeCardLabel}>
                            {PRICING_MODE_INFO[content.pricing_mode].label}
                        </span>
                        <span className={styles.pricingModeCardDescription}>
                            {PRICING_MODE_INFO[content.pricing_mode].description}
                        </span>
                        {content.pricing_mode === "bundle" && content.bundle_price != null && (
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
                        {content.pricing_mode !== "none" &&
                            content.layout_style === "with_images" && (
                                <span className={styles.pricingModeBundleDetail}>
                                    Immagini prodotti: Sì
                                </span>
                            )}
                    </div>
                )}
            </div>

            {/* ── Call to Action ───────────────────────────── */}
            <div className={styles.block}>
                <div className={styles.blockHeaderRow}>
                    <p className={styles.blockHeaderTitle}>Call to Action</p>
                    <Button
                        variant="ghost"
                        size="sm"
                        leftIcon={<Pencil size={14} />}
                        onClick={() => setIsCtaDrawerOpen(true)}
                        disabled={loading || !canEdit}
                    >
                        Modifica
                    </Button>
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
        </Card>
    );

    return (
        <div className={styles.wrapper}>
            <Breadcrumb items={breadcrumbItems} />

            <PageHeader
                title={loading ? "Caricamento..." : content?.title || "Senza titolo"}
                subtitle={loading ? "" : content?.internal_name || ""}
            />

            <Tabs
                value={activeTab}
                onChange={(v: "info" | "products") => setActiveTab(v)}
            >
                <Tabs.List>
                    <Tabs.Tab value="info">Informazioni</Tabs.Tab>
                    <Tabs.Tab value="products">Prodotti inclusi</Tabs.Tab>
                </Tabs.List>

                <Tabs.Panel value="info">{renderInfoCard()}</Tabs.Panel>

                <Tabs.Panel value="products">
                    {content?.pricing_mode === "none" ? (
                        <Card>
                            <div className={styles.productsEmptyState}>
                                <Text colorVariant="muted">
                                    Seleziona la modalità &quot;Con prodotti&quot; o
                                    &quot;Prezzo fisso&quot; per associare prodotti a questo
                                    contenuto.
                                </Text>
                            </div>
                        </Card>
                    ) : (
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
                        />
                    )}
                </Tabs.Panel>
            </Tabs>

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
    );
}
