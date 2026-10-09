import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useBreadcrumbItems } from "@/context/useBreadcrumbItems";
import { usePageHeader } from "@/context/usePageHeader";
import type { PageHeaderCompactConfig } from "@/context/PageHeaderContext";
import { Button } from "@/components/ui/Button/Button";
import { Tabs } from "@/components/ui/Tabs/Tabs";
import { useTenantId } from "@/context/useTenantId";
import { useTenant } from "@/context/useTenant";
import { useToast } from "@/context/Toast/ToastContext";
import { useVerticalConfig } from "@/hooks/useVerticalConfig";
import { getProduct, V2Product } from "@/services/supabase/products";
import { getProductOptions, GroupWithValues } from "@/services/supabase/productOptions";
import { getProductUsage, ProductUsageData } from "@/services/supabase/productUsage";
import { useSchedaDraft } from "./hooks/useSchedaDraft";
import { useAttributeValuesDraft } from "./hooks/useAttributeValuesDraft";
import { useBasePriceDraft } from "./hooks/useBasePriceDraft";
import { useFormatsDraft } from "./hooks/useFormatsDraft";
import {
    HeaderSaveAction,
    DiscardChangesConfirmDialog
} from "@/components/ui/HeaderSaveAction/HeaderSaveAction";
import { buildSaveActionCompactConfig } from "@/components/ui/HeaderSaveAction/headerSaveActionCompact";
import { useUnsavedChangesGuard } from "@/components/ui/UnsavedChangesBar/useUnsavedChangesGuard";
import { EmptyState } from "@/components/ui/EmptyState/EmptyState";
import Skeleton from "@/components/ui/Skeleton/Skeleton";
import { ArrowLeft, Package } from "lucide-react";
import Text from "@/components/ui/Text/Text";
import PrezziOpzioniTab from "./PrezziOpzioniTab";
import { ProductEssenziale } from "./ProductEssenziale";
import { ProductDiPiu, type DiPiuView } from "./ProductDiPiu";
import CharacteristicsSection from "./components/CharacteristicsSection/CharacteristicsSection";
import PairingsSection from "./components/PairingsSection/PairingsSection";
import { ProductPhonePreview, type PreviewPart } from "./components/ProductPhonePreview/ProductPhonePreview";
import { formatPrice } from "@/utils/formatCurrency";
import { UsageTab } from "./UsageTab";
import { AttributesTab } from "./AttributesTab";
import { TranslationsTab } from "@/components/ui/TranslationsTab/TranslationsTab";
import { ProductCreateEditDrawer } from "./ProductCreateEditDrawer";
import { PageGate } from "@/components/PageGate/PageGate";
import { InlineBanner } from "@/components/ui/InlineBanner/InlineBanner";
import { usePermissions } from "@/context/usePermissions";
import { canDoOnTenant } from "@/lib/permissions";
import { listStyleSwatches, type V2Style } from "@/services/supabase/styles";
import { stylePalette } from "@/components/ui/StyleSwatch/StyleSwatch";
import styles from "./ProductPage.module.scss";

export default function ProductPage() {
    const { productId } = useParams<{ productId: string }>();
    const navigate = useNavigate();
    const tenantId = useTenantId();
    const { selectedTenant } = useTenant();
    const verticalConfig = useVerticalConfig();
    const { permissions } = usePermissions();
    // Chi ha solo `products.read` vede il prodotto com'è: campi e azioni spenti
    // (fieldset), nessun «Salva» in testata.
    const canWrite = permissions != null && canDoOnTenant(permissions, "products.write");
    // Gate di lettura prima di ogni fetch («skip fetch pre-check»); il blocco
    // lo rende `PageGate` in fondo.
    const canRead = permissions != null && canDoOnTenant(permissions, "products.read");

    const [product, setProduct] = useState<V2Product | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Officina 3 (lavoro 4 del prototipo): due tab al posto di cinque. Le
    // cose lunghe si aprono in grande al centro, al posto della tab (`vista`).
    const [searchParams, setSearchParams] = useSearchParams();
    const { tab: activeTab, view: activeView } = useMemo(() => {
        const read = readTabAndView(searchParams.get("tab"), searchParams.get("vista"));
        // Gli attributi esistono solo dove il verticale li ha (P2: in F&B no).
        if (read.view === "attributi" && !verticalConfig.productSections.customAttributes) {
            return { ...read, view: null };
        }
        return read;
    }, [searchParams, verticalConfig.productSections.customAttributes]);
    const goTo = useCallback(
        (tab: ProductPageTab, view: ProductView | null = null) => {
            setSearchParams(
                prev => {
                    prev.set("tab", tab);
                    if (view) prev.set("vista", view);
                    else prev.delete("vista");
                    return prev;
                },
                { replace: true }
            );
        },
        [setSearchParams]
    );
    const handleTabChange = useCallback((next: ProductPageTab) => goTo(next), [goTo]);

    const [optionsLoading, setOptionsLoading] = useState(true);
    const [primaryPriceGroup, setPrimaryPriceGroup] = useState<GroupWithValues | null>(null);
    const [addonGroups, setAddonGroups] = useState<GroupWithValues[]>([]);

    const [isVariantDrawerOpen, setIsVariantDrawerOpen] = useState(false);
    // Conferma dello scarto quando "Annulla" arriva dal kebab compatto: stessa
    // domanda del bottone in toolbar comoda (che ha il dialog dentro
    // `HeaderSaveAction`).
    const [confirmDiscardOpen, setConfirmDiscardOpen] = useState(false);

    const [usageLoading, setUsageLoading] = useState(true);
    const [usageData, setUsageData] = useState<ProductUsageData | null>(null);
    // Gli stili dell'azienda, per i colori del telefono (D117 A).
    const [tenantStyles, setTenantStyles] = useState<V2Style[]>([]);
    useEffect(() => {
        if (!tenantId) return;
        let alive = true;
        listStyleSwatches(tenantId)
            .then(list => alive && setTenantStyles(list))
            .catch(() => undefined);
        return () => {
            alive = false;
        };
    }, [tenantId]);

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
        handleProductUpdated,
        selectedTenant?.vertical_type
    );

    // Valori degli attributi (negozio): nella stessa bozza di pagina (§27).
    const attributesDraft = useAttributeValuesDraft({
        productId: productId!,
        tenantId: tenantId!,
        vertical: selectedTenant?.vertical_type,
        enabled: verticalConfig.productSections.customAttributes
    });

    // Prezzo unico nella stessa bozza (Officina 3, D103 A).
    const priceDraft = useBasePriceDraft(product, tenantId!, handleProductUpdated);



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

    // Prezzo per formato nella stessa bozza (D103 A): i formati partono col Salva.
    const formatsDraft = useFormatsDraft(productId!, tenantId!, primaryPriceGroup, loadOptions);

    // Un solo Salva/Annulla per la pagina: Scheda + prezzo + valori degli attributi.
    // In «per formato» il prezzo unico non si vede e non si salva.
    const isDirty =
        schedaDraft.isDirty ||
        attributesDraft.isDirty ||
        (formatsDraft.mode === "unico" && priceDraft.isDirty) ||
        formatsDraft.isDirty;
    const isSavingAll =
        schedaDraft.isSavingAll || attributesDraft.isSaving || priceDraft.isSaving || formatsDraft.isSaving;
    const { handleSaveAll: saveScheda, handleDiscardAll: discardScheda, isDirty: schedaDirty } = schedaDraft;
    const { save: saveAttributes, discard: discardAttributes, isDirty: attributesDirty } = attributesDraft;
    const { save: savePrice, discard: discardPrice, isDirty: priceDirty, error: priceError } = priceDraft;
    const { save: saveFormats, discard: discardFormats, isDirty: formatsDirty, mode: formatsMode } = formatsDraft;
    const handleSaveAll = useCallback(async () => {
        // In «per formato» il prezzo unico resta com'è: si salva solo quello in vista.
        const pricePart = formatsMode === "unico" && priceDirty;
        if (pricePart && priceError) {
            showToast({ message: `Prezzo: ${priceError}`, type: "error" });
            return;
        }
        if (pricePart && !(await savePrice())) {
            showToast({ message: "Non è stato possibile salvare: Prezzo", type: "error" });
            return;
        }
        if (formatsDirty && !(await saveFormats())) {
            showToast({ message: "Non è stato possibile salvare: Formati", type: "error" });
            return;
        }
        if (formatsMode === "formato") discardPrice();
        if (schedaDirty) await saveScheda();
        let attributesOk = true;
        if (attributesDirty) {
            attributesOk = await saveAttributes();
            if (!attributesOk) showToast({ message: "Non è stato possibile salvare: Attributi", type: "error" });
        }
        if (!schedaDirty && attributesOk) showToast({ message: "Modifiche salvate", type: "success" });
    }, [
        schedaDirty,
        saveScheda,
        attributesDirty,
        saveAttributes,
        priceDirty,
        priceError,
        savePrice,
        discardPrice,
        formatsMode,
        formatsDirty,
        saveFormats,
        showToast
    ]);
    const handleDiscardAll = useCallback(() => {
        discardScheda();
        discardAttributes();
        discardPrice();
        discardFormats();
    }, [discardScheda, discardAttributes, discardPrice, discardFormats]);

    // Guardia all'uscita (§27): navigazione interna e refresh, dal registro
    // condiviso con la scheda sede (`UnsavedChangesGuardHost` nel layout).
    useUnsavedChangesGuard(isDirty);

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
        if (!productId || !tenantId || !canRead) return;
        try {
            setLoading(true);
            setError(null);
            const data = await getProduct(productId, tenantId);
            setProduct(data);
            await Promise.all([loadOptions(), loadUsage()]);
        } catch {
            setError("not-found");
        } finally {
            setLoading(false);
        }
    }, [productId, tenantId, canRead, loadOptions, loadUsage]);

    useEffect(() => {
        loadProduct();
    }, [loadProduct]);


    const breadcrumbItems = useMemo(() => [
        { label: verticalConfig.productLabelPlural, to: `/business/${tenantId}/products` },
        { label: loading ? "…" : product?.name || `${verticalConfig.productLabel} non trovato` }
    ], [tenantId, loading, product?.name, verticalConfig.productLabel, verticalConfig.productLabelPlural]);

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
                {PRODUCT_TABS.map(tab => (
                    <Tabs.Tab key={tab.value} value={tab.value}>
                        {tab.label}
                    </Tabs.Tab>
                ))}
            </Tabs.List>
        </Tabs>
    ), [activeTab, handleTabChange]);

    // Azione Salva/Annulla di pagina — riflette solo il draft Scheda (unica
    // tab con stato), visibile su tutti i tab come Storie.
    const actions = useMemo(
        () =>
            canWrite ? (
                <HeaderSaveAction
                    isDirty={isDirty}
                    isSaving={isSavingAll}
                    onSave={handleSaveAll}
                    onDiscard={handleDiscardAll}
                    // Le viste larghe che salvano a ogni modifica (D103):
                    // lo dice la barra, non una frase in pagina.
                    savesInstantly={activeView !== null && INSTANT_VIEWS.includes(activeView)}
                />
            ) : undefined,
        [canWrite, isDirty, isSavingAll, handleSaveAll, handleDiscardAll, activeView]
    );

    // Il salva è di pagina, non di tab: vale su tutte le sezioni, esattamente
    // come nella toolbar comoda. Le sezioni restano quelle dinamiche del
    // pagina, il salva ci si affianca.
    const headerCompact = useMemo<PageHeaderCompactConfig>(() => ({
        sections: PRODUCT_TABS.map(tab => ({ value: tab.value, label: tab.label })),
        activeSection: activeTab,
        onSectionChange: value => handleTabChange(value as ProductPageTab),
        ...(canWrite
            ? buildSaveActionCompactConfig({
                  isDirty,
                  isSaving: isSavingAll,
                  onSave: handleSaveAll,
                  onRequestDiscard: () => setConfirmDiscardOpen(true)
              })
            : {})
    }), [
        canWrite,
        activeTab,
        handleTabChange,
        isDirty,
        isSavingAll,
        handleSaveAll
    ]);

    usePageHeader({
        leading,
        actions,
        compact: headerCompact,
    });

    if (permissions != null && !canRead) {
        return <PageGate readPermission="products.read">{() => null}</PageGate>;
    }

    if (loading) {
        // Stessa sagoma della Scheda: la card Informazioni e due sezioni.
        return (
            <div className={styles.container} aria-busy="true" aria-label="Caricamento">
                <Skeleton height="360px" />
                <Skeleton height="120px" />
                <Skeleton height="120px" />
            </div>
        );
    }

    if (error || !product) {
        return (
            <EmptyState
                variant="page"
                icon={<Package />}
                title={`${verticalConfig.productLabel} non trovato`}
                description={`Il ${verticalConfig.productLabel.toLowerCase()} che cerchi non esiste o è stato eliminato.`}
                action={
                    <Button onClick={() => navigate(`/business/${tenantId}/products`)}>
                        Torna a {verticalConfig.productLabelPlural}
                    </Button>
                }
            />
        );
    }

    const isBaseProduct = product.parent_product_id === null;
    const showAttributes = verticalConfig.productSections.customAttributes;
    // Il prezzo come lo legge il cliente, dalla bozza.
    const formatValues = formatsDraft.mode === "formato" ? formatsDraft.rows : [];
    const formatPrices = formatValues.map(v => v.absolute_price).filter((p): p is number => p !== null);
    const draftPrice = Number(priceDraft.input.trim().replace(",", "."));
    const previewPrice =
        formatPrices.length > 0
            ? `da ${formatPrice(Math.min(...formatPrices))}`
            : priceDraft.input.trim() !== "" && Number.isFinite(draftPrice)
              ? formatPrice(draftPrice)
              : "—";
    // Lo stile del primo menù che mostra il prodotto; senza, quello di sistema.
    const previewStyle =
        tenantStyles.find(st => st.id === usageData?.styleIds?.[0]) ?? tenantStyles.find(st => st.is_system) ?? null;
    const previewPalette = stylePalette(previewStyle);
    const handlePreviewGoto = (part: PreviewPart) => {
        if (part === "scelte") goTo("piu", "scelte");
        else if (part === "abbinamenti") goTo("piu", "abbinamenti");
        else goTo("essenziale");
    };

    const pricesProps = {
        product,
        productId: productId!,
        tenantId: tenantId!,
        primaryPriceGroup,
        addonGroups,
        optionsLoading,
        onRefreshOptions: loadOptions,
        onProductUpdated: (updated: V2Product) => setProduct(updated),
        onOpenVariantDrawer: () => setIsVariantDrawerOpen(true)
    };

    return (
        <div className={styles.container}>
            {!canWrite && permissions != null && (
                <InlineBanner variant="info">
                    Sola lettura: per modificare {verticalConfig.productLabelPlural.toLowerCase()} serve un ruolo di amministratore.
                </InlineBanner>
            )}
            <div className={styles.layout}>
            <ProductPhonePreview
                palette={previewPalette}
                name={schedaDraft.information.draftName}
                description={schedaDraft.information.draftDescription}
                priceLabel={previewPrice}
                imageUrl={schedaDraft.image.removeImage ? null : (schedaDraft.image.visibleImageUrl ?? null)}
                allergens={schedaDraft.allergens.available
                    .filter(a => schedaDraft.allergens.draftIds.includes(a.id))
                    .map(a => a.label_it)}
                choices={addonGroups
                    .filter(g => g.values.length > 0)
                    .map(g => ({
                        name: g.name,
                        rule: g.max_selectable === 1 ? "una sola" : g.max_selectable === null ? "quante vuoi" : `fino a ${g.max_selectable}`,
                        options: g.values.map(v => v.name)
                    }))}
                pairings={schedaDraft.pairings.draft.map(p => p.pairedProductName ?? "").filter(Boolean)}
                onGoto={handlePreviewGoto}
            />
            <fieldset className={styles.readOnlyScope} disabled={!canWrite}>
            {activeView ? (
                <section className={styles.view} aria-labelledby="product-view-title">
                    <div className={styles.viewHead}>
                        <Button
                            variant="ghost"
                            size="sm"
                            leftIcon={<ArrowLeft size={16} />}
                            onClick={() => goTo(activeTab)}
                        >
                            {PRODUCT_TABS.find(t => t.value === activeTab)?.label}
                        </Button>
                        <Text as="h2" id="product-view-title" variant="title-sm" weight={600} className={styles.viewTitle}>
                            {viewTitle(activeView, verticalConfig.copy.productSections.customAttributes)}
                        </Text>
                        {INSTANT_VIEWS.includes(activeView) && (
                            <Text as="span" variant="caption" colorVariant="muted">
                                Si salva a ogni modifica
                            </Text>
                        )}
                        <Button variant="secondary" size="sm" onClick={() => goTo(activeTab)}>
                            Fatto
                        </Button>
                    </div>
                    {activeView === "traduzioni" && isBaseProduct && (
                        <TranslationsTab
                            entityType="product"
                            entityId={productId!}
                            tenantId={tenantId!}
                            sourceText={product.description ?? ""}
                            fieldKey="description"
                            sectionLabel="Traduzioni della descrizione"
                            sectionDescription="Le fa l'AI quando salvi la descrizione. Quella che correggi tu resta tua."
                            primaryLabel="Descrizione"
                            secondaryField={notesSecondaryField}
                            onSourceUpdated={text =>
                                setProduct(p => (p ? { ...p, description: text || null } : p))
                            }
                            flush
                        />
                    )}
                    {activeView === "scelte" && (
                        <PrezziOpzioniTab {...pricesProps} only="scelte" />
                    )}
                    {activeView === "dove" && (
                        <UsageTab
                            productId={productId!}
                            tenantId={tenantId!}
                            usageData={usageData}
                            usageLoading={usageLoading}
                        />
                    )}
                    {activeView === "caratteristiche" && (
                        <CharacteristicsSection
                            vertical={selectedTenant?.vertical_type}
                            value={schedaDraft.characteristics.draftIds}
                            onChange={schedaDraft.characteristics.setDraftIds}
                        />
                    )}
                    {activeView === "abbinamenti" && (
                        <PairingsSection
                            tenantId={tenantId!}
                            currentProductId={productId!}
                            value={schedaDraft.pairings.draft}
                            onChange={schedaDraft.pairings.setDraft}
                            disabled={schedaDraft.pairings.isSaving}
                        />
                    )}
                    {activeView === "attributi" && showAttributes && (
                        <AttributesTab productId={productId!} tenantId={tenantId!} draft={attributesDraft} />
                    )}
                </section>
            ) : activeTab === "essenziale" ? (
                <ProductEssenziale
                    product={product}
                    productId={productId!}
                    tenantId={tenantId!}
                    draft={schedaDraft}
                    canWrite={canWrite}
                    price={<PrezziOpzioniTab {...pricesProps} only="prezzo" basePriceDraft={priceDraft} formatsDraft={formatsDraft} />}
                    onOpen={view => goTo("essenziale", view)}
                />
            ) : (
                <ProductDiPiu
                    product={product}
                    draft={schedaDraft}
                    addonGroups={addonGroups}
                    optionsLoading={optionsLoading}
                    usageData={usageData}
                    usageLoading={usageLoading}
                    variants={isBaseProduct ? <PrezziOpzioniTab {...pricesProps} only="varianti" /> : null}
                    showAttributes={showAttributes}
                    attributesLabel={verticalConfig.copy.productSections.customAttributes}
                    onOpen={view => goTo("piu", view)}
                />
            )}
            </fieldset>
            </div>

            <ProductCreateEditDrawer
                open={isVariantDrawerOpen}
                onClose={() => setIsVariantDrawerOpen(false)}
                mode="create_variant"
                parentProduct={product}
                tenantId={tenantId ?? undefined}
                onSuccess={() => {
                    setIsVariantDrawerOpen(false);
                    loadProduct();
                }}
            />

            <DiscardChangesConfirmDialog
                isOpen={confirmDiscardOpen}
                onClose={() => setConfirmDiscardOpen(false)}
                onDiscard={handleDiscardAll}
            />
        </div>
    );
}

type ProductPageTab = "essenziale" | "piu";
type ProductView = "traduzioni" | DiPiuView;

const PRODUCT_TABS: { value: ProductPageTab; label: string }[] = [
    { value: "essenziale", label: "L'essenziale" },
    { value: "piu", label: "Il di più" }
];

/** Viste che salvano a ogni modifica (D103): il resto va nella bozza col «Salva». */
const INSTANT_VIEWS: ProductView[] = ["traduzioni", "scelte", "dove"];

const VIEWS: ProductView[] = ["traduzioni", "scelte", "dove", "caratteristiche", "abbinamenti", "attributi"];

/**
 * `?tab` e `?vista` dall'indirizzo, compresi i nomi di prima (link salvati,
 * e2e, rimandi da altre pagine): ogni vecchia tab porta dove è finita.
 */
function readTabAndView(tab: string | null, view: string | null): { tab: ProductPageTab; view: ProductView | null } {
    const legacy: Record<string, { tab: ProductPageTab; view: ProductView | null }> = {
        scheda: { tab: "essenziale", view: null },
        general: { tab: "essenziale", view: null },
        details: { tab: "essenziale", view: null },
        pricing: { tab: "essenziale", view: null },
        "prezzi-opzioni": { tab: "essenziale", view: null },
        characteristics: { tab: "piu", view: "caratteristiche" },
        config: { tab: "piu", view: "scelte" },
        variants: { tab: "piu", view: null },
        translations: { tab: "essenziale", view: "traduzioni" },
        usage: { tab: "piu", view: "dove" },
        attributes: { tab: "piu", view: "attributi" }
    };
    const v = view && (VIEWS as string[]).includes(view) ? (view as ProductView) : null;
    if (tab === "essenziale" || tab === "piu") return { tab, view: v };
    if (tab && legacy[tab]) return { tab: legacy[tab].tab, view: v ?? legacy[tab].view };
    return { tab: "essenziale", view: v };
}

function viewTitle(view: ProductView, attributesLabel: string): string {
    switch (view) {
        case "traduzioni":
            return "Traduzioni";
        case "scelte":
            return "Cosa sceglie il cliente";
        case "dove":
            return "Dove si trova";
        case "caratteristiche":
            return "Caratteristiche";
        case "abbinamenti":
            return "Perfetto con";
        case "attributi":
            return attributesLabel;
    }
}
