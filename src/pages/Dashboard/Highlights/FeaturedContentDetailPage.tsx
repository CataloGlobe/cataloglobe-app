import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useBreadcrumbItems } from "@/context/useBreadcrumbItems";
import { usePageHeader } from "@/context/usePageHeader";
import type { PageHeaderCompactConfig } from "@/context/PageHeaderContext";
import Text from "@/components/ui/Text/Text";
import { Button } from "@/components/ui/Button/Button";
import { Card } from "@/components/ui/Card/Card";
import { InlineBanner } from "@/components/ui/InlineBanner/InlineBanner";
import { TextInput } from "@/components/ui/Input/TextInput";
import { Textarea } from "@/components/ui/Textarea/Textarea";
import { Switch } from "@/components/ui/Switch/Switch";
import { SettingRow } from "@/components/ui/SettingRow";
import { ImageUploadEditor } from "@/components/ui/ImageUploadEditor";
import Skeleton from "@/components/ui/Skeleton/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState/EmptyState";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { Tabs } from "@/components/ui/Tabs/Tabs";
import { Megaphone } from "lucide-react";
import { useToast } from "@/context/Toast/ToastContext";
import ProductPickerList from "./ProductPickerList";
import { FeaturedProductsCard } from "./components/FeaturedProductsCard";
import { ProductForm } from "@/pages/Dashboard/Products/components/ProductForm";
import { type V2Product } from "@/services/supabase/products";
import {
    type FeaturedContent,
    type FeaturedContentWithProducts,
    type FeaturedContentType,
    type FeaturedPickerProduct,
    getFeaturedContentById,
    columnsToFraming
} from "@/services/supabase/featuredContents";
import { COMPRESS_PROFILES } from "@/utils/compressImage";
import { useTenantId } from "@/context/useTenantId";
import { useSubscriptionGuard } from "@/hooks/useSubscriptionGuard";
import { useRuleAppearance } from "@/hooks/useRuleAppearance";
import { appearanceOf } from "@/utils/ruleAppearance";
import { FeaturedPlacementCard } from "./components/FeaturedPlacementCard";
import { usePermissions } from "@/context/usePermissions";
import { canDoOnAnyActivity, canDoOnTenant } from "@/lib/permissions";
import { PageGate } from "@/components/PageGate/PageGate";
import { useUnsavedChangesGuard } from "@/components/ui/UnsavedChangesBar/useUnsavedChangesGuard";
import {
    HeaderSaveAction,
    DiscardChangesConfirmDialog
} from "@/components/ui/HeaderSaveAction/HeaderSaveAction";
import { buildSaveActionCompactConfig } from "@/components/ui/HeaderSaveAction/headerSaveActionCompact";
import {
    CONTENT_TYPE_LABEL,
    CONTENT_TYPE_SENTENCE,
    PRICING_OF_TYPE,
    productsLabel,
    typeHasProducts
} from "./featuredContentTypes";
import { FeaturedTypeCards } from "./components/FeaturedTypeCards";
import { useFeaturedDraft } from "./hooks/useFeaturedDraft";
import { useFeaturedProductsDraft } from "./hooks/useFeaturedProductsDraft";
import styles from "./FeaturedContentDetailPage.module.scss";

// EV8: Contenuto · Utilizzo. I prodotti stanno nel contenuto, sotto i testi.
type FeaturedDetailTab = "content" | "usage";

export default function FeaturedContentDetailPage() {
    const { featuredId } = useParams<{ featuredId: string }>();
    const navigate = useNavigate();
    const { showToast } = useToast();
    const tenantId = useTenantId();
    const { canEdit } = useSubscriptionGuard();
    const { permissions } = usePermissions();
    const canWrite = permissions ? canDoOnAnyActivity(permissions, "featured.write") : false;
    // Gate di lettura prima di ogni fetch; il blocco lo rende `PageGate`.
    const canRead = permissions != null && canDoOnAnyActivity(permissions, "featured.read");
    // Dove e quando compare (§28.1): dalle regole che lo nominano.
    const ruleAppearance = useRuleAppearance(tenantId, canRead);
    const featuredAppearance =
        ruleAppearance.index && featuredId ? appearanceOf(ruleAppearance.index, { kind: "featured", id: featuredId }) : null;
    const activityName = (id: string) => ruleAppearance.activities.find(activity => activity.id === id)?.name;
    // Creare un prodotto (tab «Nuovo») o modificarlo è `products.write`, che il
    // manager non ha anche quando può collegare prodotti al contenuto.
    const canWriteProducts = permissions != null && canDoOnTenant(permissions, "products.write");
    const readOnly = !canWrite || !canEdit;

    const [content, setContent] = useState<FeaturedContentWithProducts | null>(null);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(false);
    const [confirmDiscardOpen, setConfirmDiscardOpen] = useState(false);

    const [searchParams, setSearchParams] = useSearchParams();
    // `?tab=products` dei link vecchi apre il contenuto, dove ora stanno i prodotti.
    const [activeTab, setActiveTab] = useState<FeaturedDetailTab>(() =>
        searchParams.get("tab") === "usage" ? "usage" : "content"
    );
    const [typeDialogOpen, setTypeDialogOpen] = useState(false);
    const [pendingType, setPendingType] = useState<FeaturedContentType>("announcement");

    const handleTabChange = useCallback((next: FeaturedDetailTab) => {
        setActiveTab(next);
        setSearchParams(prev => {
            prev.set("tab", next);
            return prev;
        }, { replace: true });
    }, [setSearchParams]);

    // Product picker state
    const [isProductPickerOpen, setIsProductPickerOpen] = useState(false);
    const [pendingSelectedProductIds, setPendingSelectedProductIds] = useState<string[]>([]);
    const pickerCatalogRef = useRef<FeaturedPickerProduct[]>([]);
    const [addProductMode, setAddProductMode] = useState<"new" | "existing">("existing");
    const [isCreatingNewProduct, setIsCreatingNewProduct] = useState(false);

    const loadContent = useCallback(async () => {
        if (!featuredId || !tenantId || !canRead) return;
        try {
            setLoading(true);
            setLoadError(false);
            const data = await getFeaturedContentById(featuredId, tenantId);
            setContent(data);
        } catch (err) {
            // «Non trovato» è un 406 di PostgREST (PGRST116); ogni altro errore
            // è un errore, e la pagina lo dice con «Riprova».
            if ((err as { code?: string } | null)?.code === "PGRST116") {
                setContent(null);
            } else {
                console.error("Caricamento contenuto in evidenza:", err);
                setLoadError(true);
            }
        } finally {
            setLoading(false);
        }
    }, [featuredId, tenantId, canRead]);

    useEffect(() => {
        loadContent();
    }, [loadContent]);

    const handleSaved = useCallback((next: FeaturedContent) => {
        setContent(prev => (prev ? { ...prev, ...next } : prev));
    }, []);

    const draft = useFeaturedDraft(content, tenantId ?? null, handleSaved);
    // La tab Prodotti non c'è più (EV7): i prodotti si caricano quando il tipo
    // ne prevede, cioè quando la loro sezione si vede.
    const draftTypeForLoad: FeaturedContentType = draft.typeChoice?.type ?? content?.content_type ?? "announcement";
    const products = useFeaturedProductsDraft(
        featuredId,
        tenantId ?? null,
        content != null && typeHasProducts(draftTypeForLoad)
    );

    // Le azioni di testata dipendono da questi, non dagli oggetti delle bozze
    // (nuovi a ogni render: rifarebbero la testata a ogni render, e i menu
    // aperti nella pagina si richiuderebbero).
    const isDirty = draft.isDirty || products.isDirty;
    const isSaving = draft.isSaving || products.isSaving;
    const { save: saveInfo, discard: discardInfo, isDirty: infoDirty } = draft;
    const { save: saveProducts, discard: discardProducts, isDirty: productsDirty } = products;

    // Un Salva per la pagina: prima il contenuto, poi i suoi prodotti.
    const saveDraft = useCallback(async () => {
        if (infoDirty && !(await saveInfo())) return;
        if (productsDirty) {
            try {
                await saveProducts();
                if (!infoDirty) showToast({ message: "Prodotti aggiornati.", type: "success" });
            } catch (err) {
                console.error("Salvataggio prodotti del contenuto:", err);
                showToast({ message: "Impossibile salvare i prodotti.", type: "error" });
            }
        }
    }, [infoDirty, saveInfo, productsDirty, saveProducts, showToast]);

    const discardDraft = useCallback(() => {
        discardInfo();
        discardProducts();
    }, [discardInfo, discardProducts]);

    useUnsavedChangesGuard(isDirty && !readOnly);

    // La sezione Prodotti segue il tipo della bozza: sparisce appena scegli
    // Annuncio o Evento, torna se annulli (§28.4).
    const draftType = draftTypeForLoad;
    const productsEnabled = content != null && typeHasProducts(draftType);

    const closeProductPicker = () => {
        setIsProductPickerOpen(false);
        setPendingSelectedProductIds([]);
        setAddProductMode("existing");
    };

    const openProductPicker = useCallback(() => {
        setPendingSelectedProductIds(products.linkedProductIds);
        setIsProductPickerOpen(true);
    }, [products.linkedProductIds]);

    // «Nuovo»: il prodotto si crea subito (è un prodotto), il collegamento va in
    // bozza come gli altri.
    const handleNewProductCreated = (createdProduct?: V2Product) => {
        if (createdProduct) {
            products.applySelection([...products.linkedProductIds, createdProduct.id], [
                ...pickerCatalogRef.current,
                {
                    id: createdProduct.id,
                    name: createdProduct.name,
                    base_price: createdProduct.base_price ?? null,
                    option_groups: null
                }
            ]);
        }
        closeProductPicker();
    };

    const hasPendingProductChanges = useCallback(() => {
        const orig = new Set(products.linkedProductIds);
        const pend = new Set(pendingSelectedProductIds);
        if (orig.size !== pend.size) return true;
        for (const id of orig) {
            if (!pend.has(id)) return true;
        }
        return false;
    }, [products.linkedProductIds, pendingSelectedProductIds]);

    // «Applica»: la selezione entra nella bozza; si scrive col Salva.
    const applyProductSelection = () => {
        products.applySelection(pendingSelectedProductIds, pickerCatalogRef.current);
        closeProductPicker();
    };

    const breadcrumbItems = useMemo(() => [
        { label: "In evidenza", to: `/business/${tenantId}/featured` },
        { label: loading ? "Caricamento..." : content?.internal_name || content?.title || "Contenuto" }
    ], [tenantId, loading, content?.internal_name, content?.title]);

    useBreadcrumbItems(breadcrumbItems);

    const leading = useMemo(() => (
        <Tabs<FeaturedDetailTab> value={activeTab} onChange={handleTabChange} variant="line">
            <Tabs.List>
                <Tabs.Tab value="content">Contenuto</Tabs.Tab>
                <Tabs.Tab value="usage">Utilizzo</Tabs.Tab>
            </Tabs.List>
        </Tabs>
    ), [activeTab, handleTabChange]);

    const actions = useMemo(() => {
        if (readOnly || !content) return undefined;
        return (
            <HeaderSaveAction
                isDirty={isDirty}
                isSaving={isSaving}
                onSave={() => void saveDraft()}
                onDiscard={discardDraft}
            />
        );
    }, [readOnly, content, isDirty, isSaving, saveDraft, discardDraft]);

    const headerCompact = useMemo<PageHeaderCompactConfig>(() => ({
        sections: [
            { value: "content", label: "Contenuto" },
            { value: "usage", label: "Utilizzo" }
        ],
        activeSection: activeTab,
        onSectionChange: value => handleTabChange(value as FeaturedDetailTab),
        ...(!readOnly && content
            ? buildSaveActionCompactConfig({
                  isDirty,
                  isSaving,
                  onSave: () => void saveDraft(),
                  onRequestDiscard: () => setConfirmDiscardOpen(true)
              })
            : {})
    }), [activeTab, handleTabChange, readOnly, content, isDirty, isSaving, saveDraft]);

    usePageHeader({ leading, actions, compact: headerCompact });

    if (permissions != null && !canRead) {
        return <PageGate readPermission="featured.read">{() => null}</PageGate>;
    }

    if (loading) {
        // Stessa sagoma della tab Contenuto: la riga del tipo e i testi.
        return (
            <div className={styles.wrapper} aria-busy="true" aria-label="Caricamento">
                <Skeleton height="88px" />
                <Skeleton height="480px" />
            </div>
        );
    }

    if (loadError) {
        return (
            <EmptyState
                variant="page"
                icon={<Megaphone />}
                title="Non è stato possibile caricare il contenuto"
                description="Controlla la connessione e riprova."
                action={
                    <Button variant="secondary" onClick={() => loadContent()}>
                        Riprova
                    </Button>
                }
            />
        );
    }

    if (!content || !draft.text || !draft.typeChoice || !draft.image) {
        return (
            <EmptyState
                variant="page"
                icon={<Megaphone />}
                title="Contenuto non trovato"
                description="Il contenuto che cerchi non esiste o è stato eliminato."
                action={
                    <Button onClick={() => navigate(`/business/${tenantId}/featured`)}>
                        Torna a In evidenza
                    </Button>
                }
            />
        );
    }

    const { text, typeChoice, image } = draft;
    const pricing = PRICING_OF_TYPE[typeChoice.type];
    // «Cambia tipo» avvisa se i prodotti già collegati usciranno.
    const pendingDropsProducts = products.rows.length > 0 && typeHasProducts(typeChoice.type) && !typeHasProducts(pendingType);

    const openTypeDialog = () => {
        setPendingType(typeChoice.type);
        setTypeDialogOpen(true);
    };

    /** EV7: le opzioni che erano nella card Tipo, come righe sopra i prodotti. */
    const productOptions = (
        <>
            {typeChoice.type === "bundle" && (
                <>
                    <SettingRow
                        label="Prezzo del bundle"
                        htmlFor="featured-bundle-price"
                        description="Il prezzo unico, scritto anche sulla card."
                        control={
                            <TextInput
                                id="featured-bundle-price"
                                aria-label="Prezzo del bundle (€)"
                                type="number"
                                min="0.01"
                                step="0.01"
                                inputMode="decimal"
                                value={typeChoice.bundlePrice.replace(",", ".")}
                                onChange={e => draft.patchType({ bundlePrice: e.target.value })}
                                error={draft.errors.price}
                                placeholder="Es: 25.00"
                            />
                        }
                    />
                    <SettingRow
                        label="Totale originale barrato"
                        description="La somma dei prezzi singoli, barrata accanto al prezzo del bundle."
                        control={
                            <Switch
                                ariaLabel="Mostra il totale originale barrato"
                                checked={typeChoice.showOriginalTotal}
                                onChange={checked => draft.patchType({ showOriginalTotal: checked })}
                            />
                        }
                    />
                </>
            )}
            <SettingRow
                label="Immagini dei prodotti"
                description="La foto di ogni prodotto accanto al suo nome."
                control={
                    <Switch
                        ariaLabel="Mostra le immagini dei prodotti"
                        checked={typeChoice.showImages}
                        onChange={checked => draft.patchType({ showImages: checked })}
                    />
                }
            />
        </>
    );

    const renderContent = () => (
        <>
            {/* EV5: il tipo è una riga in cima; «Cambia tipo» riapre le quattro schede. */}
            <Card flush>
                <SettingRow
                    label={`Tipo: ${CONTENT_TYPE_LABEL[typeChoice.type]}`}
                    description={`${CONTENT_TYPE_SENTENCE[typeChoice.type]} ${productsLabel(typeChoice.type).replace(/^./, c => c.toUpperCase())}.`}
                    control={
                        readOnly ? undefined : (
                            <Button variant="secondary" size="sm" onClick={openTypeDialog}>
                                Cambia tipo
                            </Button>
                        )
                    }
                />
            </Card>

            <Card title="Cosa leggono i clienti">
                {/* EV6: testi a sinistra, immagine a destra (come la Scheda del prodotto, PS4). */}
                <div className={styles.infoGrid}>
                    <div className={styles.stack}>
                        <TextInput
                            label="Titolo"
                            required
                            value={text.title}
                            onChange={e => draft.setField("title", e.target.value)}
                            error={draft.errors.title}
                        />
                        <TextInput
                            label="Sottotitolo"
                            value={text.subtitle}
                            onChange={e => draft.setField("subtitle", e.target.value)}
                        />
                        <Textarea
                            label="Descrizione"
                            rows={3}
                            value={text.description}
                            onChange={e => draft.setField("description", e.target.value)}
                        />
                        <TextInput
                            label="Nome interno"
                            helperText="Serve a te per ritrovarlo: i clienti non lo vedono. Vuoto = il titolo."
                            value={text.internalName}
                            onChange={e => draft.setField("internalName", e.target.value)}
                        />
                        <div className={styles.twoFields}>
                            <TextInput
                                label="Testo del bottone"
                                value={text.ctaText}
                                onChange={e => draft.setField("ctaText", e.target.value)}
                                placeholder="Es: Scopri di più"
                            />
                            <TextInput
                                label="Link del bottone"
                                value={text.ctaUrl}
                                onChange={e => draft.setField("ctaUrl", e.target.value)}
                                placeholder="https://..."
                                error={draft.errors.url}
                            />
                        </div>
                    </div>
                    <div className={styles.media}>
                        <ImageUploadEditor
                            aspectRatio={16 / 9}
                            backgroundFillModes={["blur", "dominant", "color", "none"]}
                            compress={COMPRESS_PROFILES.featured}
                            fieldLabel="Immagine"
                            drawerTitle="Inquadra immagine"
                            requiresConfirm={false}
                            initialSource={draft.imageSource}
                            initialFraming={image.framing}
                            initialAspectRatio={image.file ? image.aspectRatio : content.media_aspect_ratio}
                            onConfirm={({ file, framing, aspectRatio }) => {
                                draft.setImage(prev =>
                                    prev
                                        ? {
                                              ...prev,
                                              framing,
                                              ...(file ? { file, aspectRatio, removed: false } : {})
                                          }
                                        : prev
                                );
                            }}
                            onRemove={() =>
                                draft.setImage(prev =>
                                    prev ? { ...prev, file: null, aspectRatio: null, removed: Boolean(content.media_id), framing: columnsToFraming({}) } : prev
                                )
                            }
                        />
                        {image.removed && (
                            <Text variant="caption" colorVariant="muted">
                                L'immagine si toglie al salvataggio: il blocco compare senza foto.
                            </Text>
                        )}
                    </div>
                </div>
            </Card>

            {productsEnabled && (
                <FeaturedProductsCard
                    rows={products.rows}
                    loading={!products.loaded && !products.loadError}
                    loadError={products.loadError}
                    onRetry={() => void products.reload()}
                    dirtyNoteKeys={products.dirtyNoteKeys}
                    showPrice={pricing === "per_item" || (pricing === "bundle" && typeChoice.showOriginalTotal)}
                    readOnly={readOnly}
                    onAdd={openProductPicker}
                    onMove={products.move}
                    onNoteChange={products.setNote}
                    onRemove={products.remove}
                    productUrl={productId => `/business/${tenantId}/products/${productId}`}
                    options={productOptions}
                />
            )}
        </>
    );

    return (
        <PageGate readPermission="featured.read">
            {() => (
        <div className={styles.wrapper}>
            {readOnly && permissions != null && (
                <InlineBanner variant="info">
                    {canWrite
                        ? "Sola lettura: l'abbonamento non è attivo."
                        : "Sola lettura: per modificare i contenuti in evidenza serve un ruolo da manager in su."}
                </InlineBanner>
            )}

            {activeTab === "content" && (
                <fieldset className={styles.readOnlyScope} disabled={readOnly}>
                    {renderContent()}
                </fieldset>
            )}

            {/* EV8: la tab Utilizzo, come nel prodotto: una riga per regola. */}
            {activeTab === "usage" && featuredAppearance && (
                <FeaturedPlacementCard
                    appearance={featuredAppearance}
                    activityName={activityName}
                    businessId={tenantId ?? ""}
                />
            )}

            <SystemDrawer open={typeDialogOpen} onClose={() => setTypeDialogOpen(false)} size="md">
                <DrawerLayout
                    header={
                        <Text variant="title-sm" weight={600}>
                            Cambia tipo
                        </Text>
                    }
                    footer={
                        <>
                            <Button variant="secondary" onClick={() => setTypeDialogOpen(false)}>
                                Annulla
                            </Button>
                            <Button
                                variant="primary"
                                onClick={() => {
                                    draft.setType(pendingType);
                                    setTypeDialogOpen(false);
                                }}
                            >
                                Applica
                            </Button>
                        </>
                    }
                >
                    <div className={styles.stack}>
                        <FeaturedTypeCards value={pendingType} onChange={setPendingType} />
                        {pendingDropsProducts && (
                            <InlineBanner variant="warning">
                                Cambiando tipo sparisce la sezione Prodotti. Le note già scritte sui prodotti non si
                                perdono: tornano se rimetti un tipo che li prevede.
                            </InlineBanner>
                        )}
                        <Text variant="caption" colorVariant="muted">
                            Il cambio si salva col Salva della pagina.
                        </Text>
                    </div>
                </DrawerLayout>
            </SystemDrawer>

            <DiscardChangesConfirmDialog
                isOpen={confirmDiscardOpen}
                onClose={() => setConfirmDiscardOpen(false)}
                onDiscard={draft.discard}
            />

            {/* ── Product picker drawer ────────────────────── */}
            <SystemDrawer open={isProductPickerOpen} onClose={closeProductPicker} size="lg">
                <DrawerLayout
                    bodyLayout={addProductMode === "existing" ? "flex" : "block"}
                    headerFlush
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
                                    {canWriteProducts && <Tabs.Tab value="new">Nuovo</Tabs.Tab>}
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
                            onCatalogLoaded={catalog => {
                                pickerCatalogRef.current = catalog;
                            }}
                        />
                    )}
                </DrawerLayout>
            </SystemDrawer>
        </div>
            )}
        </PageGate>
    );
}
