import { useEffect, useLayoutEffect, useRef, useState, useCallback, useMemo, type ReactNode } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useBreadcrumbItems } from "@/context/useBreadcrumbItems";
import { usePageHeader } from "@/context/usePageHeader";
import type { PageHeaderCompactConfig } from "@/context/PageHeaderContext";
import { Button } from "@/components/ui/Button/Button";
import { StatusBadge } from "@/components/ui/StatusBadge/StatusBadge";
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
import { ChevronRight, Package } from "lucide-react";
import PrezziOpzioniTab from "./PrezziOpzioniTab";
import CharacteristicsSection from "./components/CharacteristicsSection/CharacteristicsSection";
import PairingsSection from "./components/PairingsSection/PairingsSection";
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
import { stylePalette } from "@/components/ui/StyleSwatch/stylePalette";
import { PRODOTTO_PARTS, isProdottoPart, partTitle, type ProdottoPart } from "./scheda/prodottoCopy";
import { DESCRIPTION_FIELD_ID, inheritedPart, ruleText, type ProdottoFacts } from "./scheda/prodottoModel";
import { ProdottoDashboard } from "./scheda/ProdottoDashboard";
import { ProdottoFocus } from "./scheda/ProdottoFocus";
import {
    AllergeniEditor,
    IngredientiEditor,
    InheritedEditor,
    NoteEditor,
    PiattoEditor
} from "./scheda/ProdottoEditors";
import { useProdottoLingue } from "./scheda/useProdottoLingue";
import { scrollParent } from "./scheda/useProdottoFollow";
import styles from "./ProductPage.module.scss";
import prodottoStyles from "./scheda/Prodotto.module.scss";

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
    const [parent, setParent] = useState<V2Product | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Officina 3 (D121, artifact «Scheda del prodotto»): un cruscotto, e ogni
    // parte si apre a fuoco con `?parte=`. I vecchi `?vista=` e `?tab=`
    // portano alla parte dove sono finiti, senza riscrivere l'indirizzo.
    const [searchParams, setSearchParams] = useSearchParams();
    const requestedPart = readPart(searchParams.get("parte"), searchParams.get("vista"), searchParams.get("tab"));
    const goTo = useCallback(
        (next: ProdottoPart | null) => {
            setSearchParams(prev => {
                const params = new URLSearchParams(prev);
                params.delete("tab");
                params.delete("vista");
                if (next) params.set("parte", next);
                else params.delete("parte");
                return params;
            });
        },
        [setSearchParams]
    );

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

    /** Un errore della pagina del prodotto: un avviso che dice cosa non è riuscito. */

    const fail = useCallback((message: string) => showToast({ message, type: "error" }), [showToast]);

    // Stabile: `setProduct` è già stabile (useState), ma un'arrow inline qui
    // sarebbe una nuova referenza ad ogni render — instabilità che risale a
    // handleSaveImage/Information/Notes → handleSaveAll → `actions` → loop
    // sull'effect di `usePageHeader` (già capitato, vedi diagnosi task).
    const handleProductUpdated = useCallback((updated: V2Product) => {
        setProduct(updated);
    }, []);

    // La bozza della pagina: sopravvive al passaggio fra cruscotto e parti.
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
            fail("Errore caricamento opzioni");
        } finally {
            setOptionsLoading(false);
        }
    }, [productId, fail]);

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
    const saveAllParts = useCallback(async () => {
        // In «per formato» il prezzo unico resta com'è: si salva solo quello in vista.
        const pricePart = formatsMode === "unico" && priceDirty;
        if (pricePart && priceError) {
            fail(`Prezzo: ${priceError}`);
            return;
        }
        if (pricePart && !(await savePrice())) {
            fail("Non è stato possibile salvare: Prezzo");
            return;
        }
        if (formatsDirty && !(await saveFormats())) {
            fail("Non è stato possibile salvare: Formati");
            return;
        }
        if (formatsMode === "formato") discardPrice();
        if (schedaDirty) await saveScheda();
        let attributesOk = true;
        if (attributesDirty) {
            attributesOk = await saveAttributes();
            if (!attributesOk) fail("Non è stato possibile salvare: Attributi");
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
        showToast,
        fail
    ]);
    // Due clic sul Salva prima che parta `isSaving`: il secondo non rifà nulla.
    const savingAllRef = useRef(false);
    const handleSaveAll = useCallback(async () => {
        if (savingAllRef.current) return;
        savingAllRef.current = true;
        try {
            await saveAllParts();
        } finally {
            savingAllRef.current = false;
        }
    }, [saveAllParts]);
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

    // Il prodotto da cui viene una variante: il suo nome e il suo prezzo.
    const parentId = product?.parent_product_id ?? null;
    useEffect(() => {
        if (!parentId || !tenantId) {
            setParent(null);
            return;
        }
        let alive = true;
        getProduct(parentId, tenantId)
            .then(p => alive && setParent(p))
            .catch(() => alive && setParent(null));
        return () => {
            alive = false;
        };
    }, [parentId, tenantId]);

    const isBaseProduct = product ? product.parent_product_id === null : true;
    const lingue = useProdottoLingue(
        tenantId ?? "",
        productId ?? "",
        `${productId}:${product?.description ?? ""}`,
        Boolean(product && tenantId && productId && isBaseProduct)
    );

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

    // Le parti che si vedono: dipendono dal verticale e dal tipo di prodotto.
    // Caratteristiche, note e abbinamenti restano anche sulla variante, che
    // li prende dal padre e lo dice (la bozza non li carica).
    const sections = verticalConfig.productSections;
    const { showAllergens, showIngredients, dirty: schedaDirtyParts } = schedaDraft;
    const visible = useCallback(
        (p: ProdottoPart): boolean => {
            switch (p) {
                case "caratteristiche":
                    return sections.characteristics;
                case "allergeni":
                    return showAllergens;
                case "ingredienti":
                    return showIngredients;
                case "abbinamenti":
                    return sections.pairings;
                case "note":
                    return sections.notes;
                case "varianti":
                    return isBaseProduct;
                case "attributi":
                    return sections.customAttributes;
                default:
                    return true;
            }
        },
        [sections, showAllergens, showIngredients, isBaseProduct]
    );
    const part: ProdottoPart | null = product && requestedPart && visible(requestedPart) ? requestedPart : null;

    // Cosa è cambiato, parte per parte (il pallino «Da salvare» e il conteggio del Salva).
    const changed = useCallback(
        (p: ProdottoPart): boolean => {
            switch (p) {
                case "piatto":
                    return schedaDirtyParts.image || schedaDirtyParts.information;
                case "prezzo":
                    return (formatsMode === "unico" && priceDirty) || formatsDirty;
                case "caratteristiche":
                    return schedaDirtyParts.characteristics;
                case "allergeni":
                    return schedaDirtyParts.allergens;
                case "abbinamenti":
                    return schedaDirtyParts.pairings;
                case "ingredienti":
                    return schedaDirtyParts.ingredients;
                case "note":
                    return schedaDirtyParts.notes;
                case "attributi":
                    return attributesDirty;
                default:
                    return false;
            }
        },
        [schedaDirtyParts, formatsMode, priceDirty, formatsDirty, attributesDirty]
    );
    const changeCount = PRODOTTO_PARTS.filter(changed).length;

    // Il cruscotto ricorda dove era: tornando da una parte si riparte da lì.
    const pageRef = useRef<HTMLDivElement>(null);
    const dashScroll = useRef(0);
    const openPart = useCallback(
        (next: ProdottoPart | null) => {
            const C = scrollParent(pageRef.current);
            if (!part && C) dashScroll.current = C.scrollTop;
            goTo(next);
        },
        [part, goTo]
    );
    const closePart = useCallback(() => goTo(null), [goTo]);
    useLayoutEffect(() => {
        const C = scrollParent(pageRef.current);
        if (!C) return;
        C.scrollTop = part ? 0 : dashScroll.current;
    }, [part]);

    // «Scrivila» di «Oggi»: il piatto a fuoco col cursore nella descrizione.
    const [focusDescription, setFocusDescription] = useState(false);
    useEffect(() => {
        if (!focusDescription || part !== "piatto") return;
        const id = requestAnimationFrame(() => {
            document.getElementById(DESCRIPTION_FIELD_ID)?.focus();
            setFocusDescription(false);
        });
        return () => cancelAnimationFrame(id);
    }, [focusDescription, part]);

    // In testata, come la Scheda della sede: il nome col suo stato, o il
    // percorso «prodotto › parte» con una parte a fuoco; il Salva a destra.
    const seenToday = usageLoading || !usageData ? null : usageData.activities.length > 0;
    const statusLabel = seenToday === null ? null : seenToday ? "Nel menù" : "Oggi non si vede";
    const parentName = product?.parent_product_id
        ? (parent?.name ?? `il ${verticalConfig.productLabel.toLowerCase()} da cui viene`)
        : null;
    // «Il piatto» dove si mangia (dove ci sono gli allergeni), come nell'artifact.
    const dishLabel = verticalConfig.productSections.allergens ? "Il piatto" : verticalConfig.productLabel;
    const partLabels = useMemo(
        () => ({
            product: verticalConfig.productLabel,
            attributes: verticalConfig.copy.productSections.customAttributes,
            dish: dishLabel
        }),
        [verticalConfig.productLabel, verticalConfig.copy.productSections.customAttributes, dishLabel]
    );
    const productName = product?.name ?? null;
    const leading = useMemo(() => {
        if (productName === null) return null;
        if (part) {
            return (
                <div className={prodottoStyles.crumbs}>
                    <button type="button" onClick={closePart}>
                        {productName}
                    </button>
                    <ChevronRight size={14} strokeWidth={1.75} aria-hidden />
                    <strong>{partTitle(part, partLabels)}</strong>
                </div>
            );
        }
        return (
            <div className={prodottoStyles.headTitle}>
                <h2>{productName}</h2>
                {statusLabel && <StatusBadge variant={seenToday ? "success" : "warning"} label={statusLabel} />}
                {parentName && <StatusBadge variant="neutral" label={`Variante di ${parentName}`} />}
            </div>
        );
    }, [productName, part, closePart, partLabels, statusLabel, seenToday, parentName]);

    const actions = useMemo(
        () =>
            canWrite ? (
                <HeaderSaveAction
                    isDirty={isDirty}
                    isSaving={isSavingAll}
                    onSave={handleSaveAll}
                    onDiscard={handleDiscardAll}
                    changeCount={changeCount}
                />
            ) : null,
        [canWrite, isDirty, isSavingAll, handleSaveAll, handleDiscardAll, changeCount]
    );

    // In compatto: con una parte a fuoco la freccia torna al cruscotto.
    const headerCompact = useMemo<PageHeaderCompactConfig>(() => ({
        ...(part ? { backAction: { label: productName ?? verticalConfig.productLabel, onClick: closePart } } : {}),
        statusIndicator: statusLabel ? { label: statusLabel } : undefined,
        ...(canWrite
            ? buildSaveActionCompactConfig({
                  isDirty,
                  isSaving: isSavingAll,
                  onSave: handleSaveAll,
                  onRequestDiscard: () => setConfirmDiscardOpen(true)
              })
            : {}),
        // Lo stato resta a vista anche col draft pulito: il «Salvato» della
        // barra compatta non lo sostituisce.
        ...(canWrite && !isDirty && !isSavingAll && statusLabel ? { statusIndicator: { label: statusLabel } } : {})
    }), [
        part,
        productName,
        verticalConfig.productLabel,
        closePart,
        statusLabel,
        canWrite,
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
        // Stessa sagoma del cruscotto: il piatto col prezzo, «Oggi», un gruppo.
        return (
            <div className={styles.container} aria-busy="true" aria-label="Caricamento">
                <Skeleton height="230px" />
                <Skeleton height="120px" />
                <Skeleton height="160px" />
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

    const isVariant = !isBaseProduct;
    const productLower = verticalConfig.productLabel.toLowerCase();

    // ── Quello che serve a tessere, «Oggi» e telefono, dalle bozze ──
    const formatRows = formatsDraft.mode === "formato" ? formatsDraft.rows : [];
    const formatPrices = formatRows.map(v => v.absolute_price).filter((p): p is number => p !== null);
    const draftPrice = Number(priceDraft.input.trim().replace(",", "."));
    const inheritsPrice = isVariant && formatsDraft.mode === "unico" && priceDraft.input.trim() === "";
    const priceLabel =
        formatPrices.length > 0
            ? `da ${formatPrice(Math.min(...formatPrices))}`
            : priceDraft.input.trim() !== "" && Number.isFinite(draftPrice)
              ? formatPrice(draftPrice)
              : inheritsPrice && parent?.base_price != null
                ? formatPrice(parent.base_price)
                : "—";
    // Lo stile del primo menù che mostra il prodotto; senza, quello di sistema.
    const ruleStyle = tenantStyles.find(st => st.id === usageData?.styleIds?.[0]) ?? null;
    const previewStyle = ruleStyle ?? tenantStyles.find(st => st.is_system) ?? null;
    const catalogs = usageData?.catalogs.map(c => c.name) ?? [];
    const facts: ProdottoFacts = {
        name: schedaDraft.information.draftName,
        description: schedaDraft.information.draftDescription,
        imageUrl: schedaDraft.image.removeImage ? null : (schedaDraft.image.visibleImageUrl ?? null),
        parentName,
        priceLabel,
        priceMode: formatsDraft.mode,
        formats: formatRows.map(v => ({
            name: v.name,
            price: v.absolute_price !== null ? formatPrice(v.absolute_price) : ""
        })),
        inheritsPrice,
        characteristics: schedaDraft.characteristics.available
            .filter(c => schedaDraft.characteristics.draftIds.includes(c.id))
            .map(c => c.label_it),
        allergens: schedaDraft.allergens.available
            .filter(a => schedaDraft.allergens.draftIds.includes(a.id))
            .map(a => a.label_it),
        ingredients: schedaDraft.ingredients.draftIds
            .map(id => schedaDraft.ingredients.available.find(i => i.id === id)?.name ?? "")
            .filter(Boolean),
        pairings: schedaDraft.pairings.draft.map(p => p.pairedProductName ?? "").filter(Boolean),
        notes: schedaDraft.notes.draft.filter(n => n.label.trim() !== "" || n.value.trim() !== ""),
        choices: addonGroups
            .filter(g => g.values.length > 0)
            .map(g => ({
                name: g.name,
                rule: ruleText(g),
                options: g.values.map(v => ({
                    name: v.name,
                    price: v.price_modifier ? `+${formatPrice(v.price_modifier)}` : ""
                }))
            })),
        emptyChoices: addonGroups.filter(g => g.values.length === 0).map(g => g.name),
        optionsLoading,
        languages: lingue,
        catalogs,
        places: usageData?.activities.map(a => a.name) ?? [],
        usageLoading,
        variants: (product.variants ?? []).map(v => v.name),
        attributes: attributesDraft.definitions.filter(d => attributesDraft.linkedIds.has(d.id)).map(d => d.label),
        show: Object.fromEntries(PRODOTTO_PARTS.map(p => [p, visible(p)])) as ProdottoFacts["show"],
        labels: {
            product: verticalConfig.productLabel,
            productPlural: verticalConfig.productLabelPlural,
            catalog: verticalConfig.catalogLabel.toLowerCase(),
            attributes: verticalConfig.copy.productSections.customAttributes,
            dish: dishLabel
        },
        businessName: selectedTenant?.name ?? "",
        palette: stylePalette(previewStyle),
        styleName: previewStyle?.name ?? null,
        // Il menù da cui viene lo stile, quando si sa con certezza.
        styleMenu: ruleStyle && catalogs.length === 1 ? catalogs[0] : null
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

    const allergenLabel = verticalConfig.copy.productSections.allergens;
    const ingredientLabel = verticalConfig.copy.productSections.ingredients;
    const noAllergens =
        !showAllergens && !showIngredients
            ? {
                  title: `${allergenLabel} e ${ingredientLabel.toLowerCase()} non si usano qui`,
                  description: `Per questo tipo di attività i ${verticalConfig.productLabelPlural.toLowerCase()} non li dichiarano.`
              }
            : null;

    // Ogni parte a fuoco ha l'editor di sempre; quelle che la variante prende
    // dal padre dicono da dove arrivano. Per chi legge soltanto, il fieldset
    // spegne campi e azioni (non «Fatto» né la colonna delle parti).
    const editorOf = (p: ProdottoPart): ReactNode => {
        if (inheritedPart(facts, p) && parentName) {
            return (
                <InheritedEditor
                    parentName={parentName}
                    onOpenParent={() => parentId && navigate(`/business/${tenantId}/products/${parentId}`)}
                />
            );
        }
        let body: ReactNode = null;
        switch (p) {
            case "piatto":
                body = (
                    <PiattoEditor
                        draft={schedaDraft}
                        tenantId={tenantId!}
                        productId={productId!}
                        savedDescription={product.description}
                        isVariant={isVariant}
                        productLower={productLower}
                        canWrite={canWrite}
                        onOpenTranslations={() => openPart("traduzioni")}
                    />
                );
                break;
            case "prezzo":
                body = <PrezziOpzioniTab {...pricesProps} only="prezzo" basePriceDraft={priceDraft} formatsDraft={formatsDraft} />;
                break;
            case "caratteristiche":
                body = (
                    <CharacteristicsSection
                        vertical={selectedTenant?.vertical_type}
                        value={schedaDraft.characteristics.draftIds}
                        onChange={schedaDraft.characteristics.setDraftIds}
                    />
                );
                break;
            case "allergeni":
                body = <AllergeniEditor draft={schedaDraft} />;
                break;
            case "scelte":
                body = <PrezziOpzioniTab {...pricesProps} only="scelte" />;
                break;
            case "abbinamenti":
                body = (
                    <PairingsSection
                        tenantId={tenantId!}
                        currentProductId={productId!}
                        value={schedaDraft.pairings.draft}
                        onChange={schedaDraft.pairings.setDraft}
                        disabled={schedaDraft.pairings.isSaving}
                    />
                );
                break;
            case "ingredienti":
                body = <IngredientiEditor draft={schedaDraft} />;
                break;
            case "note":
                body = <NoteEditor draft={schedaDraft} />;
                break;
            case "traduzioni":
                body = (
                    <TranslationsTab
                        entityType="product"
                        entityId={productId!}
                        tenantId={tenantId!}
                        sourceText={product.description ?? ""}
                        fieldKey="description"
                        // Titolo e perché li dà già la card della parte.
                        sectionLabel=""
                        sectionDescription=""
                        primaryLabel="Descrizione"
                        secondaryField={notesSecondaryField}
                        onSourceUpdated={text => setProduct(prev => (prev ? { ...prev, description: text || null } : prev))}
                        flush
                        bare
                    />
                );
                break;
            case "dove":
                body = (
                    <UsageTab productId={productId!} tenantId={tenantId!} usageData={usageData} usageLoading={usageLoading} />
                );
                break;
            case "varianti":
                body = <PrezziOpzioniTab {...pricesProps} only="varianti" />;
                break;
            case "attributi":
                body = <AttributesTab productId={productId!} tenantId={tenantId!} draft={attributesDraft} bare />;
                break;
        }
        return (
            <fieldset className={prodottoStyles.scope} disabled={!canWrite}>
                {body}
            </fieldset>
        );
    };

    const saves = (p: ProdottoPart) => SAVED_PARTS.includes(p) && !inheritedPart(facts, p);

    return (
        <div className={styles.container} ref={pageRef}>
            {!canWrite && permissions != null && (
                <InlineBanner variant="info">
                    Sola lettura: per modificare {verticalConfig.productLabelPlural.toLowerCase()} serve un ruolo di amministratore.
                </InlineBanner>
            )}
            {part ? (
                <ProdottoFocus
                    key={part}
                    part={part}
                    facts={facts}
                    visible={visible}
                    changed={changed}
                    changeCount={changeCount}
                    saves={saves(part)}
                    canWrite={canWrite}
                    editor={editorOf(part)}
                    onPick={openPart}
                    onDone={closePart}
                />
            ) : (
                <ProdottoDashboard
                    facts={facts}
                    tiles={{ open: openPart, changed }}
                    visible={visible}
                    noAllergens={noAllergens}
                    onWriteDescription={() => {
                        setFocusDescription(true);
                        openPart("piatto");
                    }}
                />
            )}

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

/** Le parti che vanno nella bozza della pagina (si salvano con Salva). */
const SAVED_PARTS: readonly ProdottoPart[] = [
    "piatto",
    "prezzo",
    "caratteristiche",
    "allergeni",
    "abbinamenti",
    "ingredienti",
    "note",
    "attributi"
];

/**
 * La parte dall'indirizzo: `?parte=`, e i vecchi `?vista=` (Officina 3, prima
 * versione) e `?tab=` (link salvati, e2e, rimandi da altre pagine), ognuno
 * verso la parte dove è finito.
 */
function readPart(parte: string | null, vista: string | null, tab: string | null): ProdottoPart | null {
    if (isProdottoPart(parte)) return parte;
    if (isProdottoPart(vista)) return vista;
    const legacy: Record<string, ProdottoPart> = {
        pricing: "prezzo",
        "prezzi-opzioni": "prezzo",
        characteristics: "caratteristiche",
        config: "scelte",
        translations: "traduzioni",
        usage: "dove",
        attributes: "attributi",
        variants: "varianti"
    };
    return (tab && legacy[tab]) || null;
}
