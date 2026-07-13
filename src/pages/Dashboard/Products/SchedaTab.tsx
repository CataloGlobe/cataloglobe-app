import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/Button/Button";
import { TextInput } from "@/components/ui/Input/TextInput";
import { FileInput } from "@/components/ui/Input/FileInput";
import { Textarea } from "@/components/ui/Textarea/Textarea";
import { Pill } from "@/components/ui/Pill/Pill";
import { TranslationStatusBadge } from "@/components/ui/TranslationStatusBadge/TranslationStatusBadge";
import { UnsavedChangesBar } from "@/components/ui/UnsavedChangesBar/UnsavedChangesBar";
import Text from "@/components/ui/Text/Text";
import { useToast } from "@/context/Toast/ToastContext";
import { useBusinessOutletContext } from "@/layouts/MainLayout/outletContext";
import { useVerticalConfig } from "@/hooks/useVerticalConfig";
import { useAiDescription } from "./hooks/useAiDescription";
import { AiDescriptionField } from "./components/AiDescriptionField";
import {
    type V2Product,
    type ProductNote,
    updateProduct
} from "@/services/supabase/products";
import { uploadProductImage } from "@/services/supabase/upload";
import { compressImage, COMPRESS_PROFILES } from "@/utils/compressImage";
import {
    type ProductGroup,
    getProductGroups,
    getProductGroupAssignments
} from "@/services/supabase/productGroups";
import {
    type V2SystemAllergen,
    listAllergens,
    getProductAllergens,
    setProductAllergens
} from "@/services/supabase/allergens";
import {
    type V2Ingredient,
    listIngredients,
    getProductIngredients,
    setProductIngredients,
    createIngredient
} from "@/services/supabase/ingredients";
import {
    getProductCharacteristics,
    setProductCharacteristics
} from "@/services/supabase/productCharacteristics";
import { ProductGroupsEditDrawer } from "./ProductGroupsEditDrawer";
import { IngredientCombobox } from "./components/IngredientCombobox";
import {
    listPairings,
    savePairings
} from "@/services/supabase/productPairings";
import CharacteristicsSection from "./components/CharacteristicsSection/CharacteristicsSection";
import ProductNotesSection from "./components/ProductNotesSection/ProductNotesSection";
import PairingsSection, {
    type PairingDraftItem
} from "./components/PairingsSection/PairingsSection";
import { SectionCard } from "@/components/ui/SectionCard/SectionCard";
import styles from "./SchedaTab.module.scss";

interface SchedaTabProps {
    product: V2Product;
    productId: string;
    tenantId: string;
    onProductUpdated: (updated: V2Product) => void;
    /** Vertical type del tenant — necessario per `CharacteristicsSection`. */
    vertical?: string;
    /** Switch to another tab in the parent ProductPage. */
    onNavigateToTab: (tab: string) => void;
}

function arraysEqualUnordered<T>(a: T[], b: T[]): boolean {
    if (a.length !== b.length) return false;
    const set = new Set(a);
    return b.every(v => set.has(v));
}

/**
 * Tab "Scheda" — orchestrator delle 8 cards (6 sx + 2 dx) con layout
 * 2 colonne >=1024px. Sub-sezioni indipendenti, ognuna con proprio
 * dirty state e sticky save bar (eccetto Categoria nei cataloghi e
 * Gruppi prodotto, read-only).
 */
export function SchedaTab({
    product,
    productId,
    tenantId,
    onProductUpdated,
    vertical,
    onNavigateToTab
}: SchedaTabProps) {
    const { showToast } = useToast();
    const { t } = useTranslation("admin");
    const wakeTranslations = useBusinessOutletContext()?.wakeTranslations;
    const verticalConfig = useVerticalConfig();
    const isBaseProduct = product.parent_product_id === null;

    const showAllergens = verticalConfig.productSections.allergens;
    const showIngredients = verticalConfig.productSections.ingredients;
    const showCharacteristics =
        verticalConfig.productSections.characteristics && isBaseProduct;
    const showNotes = verticalConfig.productSections.notes && isBaseProduct;
    const showPairings = verticalConfig.productSections.pairings && isBaseProduct;

    // ── Card Immagine ──────────────────────────────────────────────────
    const [draftImageUrl, setDraftImageUrl] = useState<string | null>(product.image_url ?? null);
    const [savedImageUrl, setSavedImageUrl] = useState<string | null>(product.image_url ?? null);
    const [pendingImageFile, setPendingImageFile] = useState<File | null>(null);
    const [removeImage, setRemoveImage] = useState(false);
    const [isSavingImage, setIsSavingImage] = useState(false);

    const pendingImagePreviewUrl = useMemo(() => {
        if (!pendingImageFile) return null;
        return URL.createObjectURL(pendingImageFile);
    }, [pendingImageFile]);

    useEffect(() => {
        if (!pendingImagePreviewUrl) return;
        return () => {
            URL.revokeObjectURL(pendingImagePreviewUrl);
        };
    }, [pendingImagePreviewUrl]);

    const visibleImageUrl: string | null = removeImage
        ? null
        : pendingImagePreviewUrl ?? savedImageUrl;

    const isImageDirty = useMemo(
        () => pendingImageFile !== null || removeImage || draftImageUrl !== savedImageUrl,
        [pendingImageFile, removeImage, draftImageUrl, savedImageUrl]
    );

    useEffect(() => {
        if (isImageDirty) return;
        const url = product.image_url ?? null;
        setDraftImageUrl(url);
        setSavedImageUrl(url);
        setPendingImageFile(null);
        setRemoveImage(false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [product.image_url]);

    const handleCancelImage = useCallback(() => {
        setDraftImageUrl(savedImageUrl);
        setPendingImageFile(null);
        setRemoveImage(false);
    }, [savedImageUrl]);

    const handleSaveImage = useCallback(async () => {
        try {
            setIsSavingImage(true);
            let nextUrl: string | null = draftImageUrl;
            if (removeImage) {
                nextUrl = null;
            } else if (pendingImageFile) {
                nextUrl = await uploadProductImage(
                    tenantId,
                    productId,
                    await compressImage(pendingImageFile, COMPRESS_PROFILES.product)
                );
            }
            const updated = await updateProduct(productId, tenantId, {
                image_url: nextUrl
            });
            onProductUpdated(updated);
            setDraftImageUrl(nextUrl);
            setSavedImageUrl(nextUrl);
            setPendingImageFile(null);
            setRemoveImage(false);
            showToast({ message: "Immagine salvata", type: "success" });
        } catch (err) {
            showToast({
                message: err instanceof Error ? err.message : "Errore nel salvataggio",
                type: "error"
            });
        } finally {
            setIsSavingImage(false);
        }
    }, [
        draftImageUrl,
        pendingImageFile,
        removeImage,
        productId,
        tenantId,
        onProductUpdated,
        showToast
    ]);

    // ── Card Informazioni (nome + descrizione) ─────────────────────────
    const [draftName, setDraftName] = useState(product.name);
    const [draftDescription, setDraftDescription] = useState(product.description ?? "");
    const [isSavingInformation, setIsSavingInformation] = useState(false);

    // AI description enrichment — shared affordance. Generated text fills the
    // draft, which marks the form dirty; persistence stays on the existing
    // UnsavedChangesBar → handleSaveInformation → updateProduct path.
    const ai = useAiDescription({
        name: draftName,
        tenantId,
        onDescriptionGenerated: setDraftDescription
    });

    const isInformationDirty = useMemo(() => {
        const baseName = product.name ?? "";
        const baseDesc = product.description ?? "";
        return (
            draftName.trim() !== baseName.trim() ||
            draftDescription.trim() !== baseDesc.trim()
        );
    }, [draftName, draftDescription, product.name, product.description]);

    useEffect(() => {
        if (isInformationDirty) return;
        setDraftName(product.name);
        setDraftDescription(product.description ?? "");
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [product.name, product.description]);

    const handleCancelInformation = useCallback(() => {
        setDraftName(product.name);
        setDraftDescription(product.description ?? "");
    }, [product]);

    const handleSaveInformation = useCallback(async () => {
        const trimmedName = draftName.trim();
        if (!trimmedName) {
            showToast({ message: "Il nome è obbligatorio", type: "error" });
            return;
        }
        try {
            setIsSavingInformation(true);
            const updated = await updateProduct(productId, tenantId, {
                name: trimmedName,
                description: draftDescription.trim() || null
            });
            onProductUpdated(updated);
            showToast({ message: "Informazioni salvate", type: "success" });
            if (updated.queuedLanguages >= 1) {
                showToast({
                    message: t("translations_tab.toast_updating", { count: updated.queuedLanguages }),
                    type: "info"
                });
                // Sveglia il poller globale: il badge sidebar riflette subito i
                // nuovi pending senza attendere il prossimo tick (≤5s).
                wakeTranslations?.();
            }
        } catch (err) {
            showToast({
                message: err instanceof Error ? err.message : "Errore nel salvataggio",
                type: "error"
            });
        } finally {
            setIsSavingInformation(false);
        }
    }, [draftName, draftDescription, productId, tenantId, onProductUpdated, showToast, t, wakeTranslations]);

    // ── Card Allergeni ─────────────────────────────────────────────────
    const [allergens, setAllergens] = useState<V2SystemAllergen[]>([]);
    const [draftAllergenIds, setDraftAllergenIds] = useState<number[]>([]);
    const [savedAllergenIds, setSavedAllergenIds] = useState<number[]>([]);
    const [allergensLoading, setAllergensLoading] = useState(true);
    const [isSavingAllergens, setIsSavingAllergens] = useState(false);

    const isAllergensDirty = useMemo(
        () => !arraysEqualUnordered(draftAllergenIds, savedAllergenIds),
        [draftAllergenIds, savedAllergenIds]
    );

    const loadAllergens = useCallback(async () => {
        if (!showAllergens) return;
        try {
            setAllergensLoading(true);
            const [list, productIds] = await Promise.all([
                listAllergens(),
                getProductAllergens(productId, tenantId)
            ]);
            setAllergens(list);
            setDraftAllergenIds(productIds);
            setSavedAllergenIds(productIds);
        } catch {
            showToast({ message: "Errore nel caricamento degli allergeni", type: "error" });
        } finally {
            setAllergensLoading(false);
        }
    }, [productId, tenantId, showAllergens, showToast]);

    useEffect(() => {
        loadAllergens();
    }, [loadAllergens]);

    const toggleAllergen = useCallback((id: number) => {
        setDraftAllergenIds(prev =>
            prev.includes(id) ? prev.filter(a => a !== id) : [...prev, id]
        );
    }, []);

    const handleCancelAllergens = useCallback(() => {
        setDraftAllergenIds(savedAllergenIds);
    }, [savedAllergenIds]);

    const handleSaveAllergens = useCallback(async () => {
        try {
            setIsSavingAllergens(true);
            await setProductAllergens(tenantId, productId, draftAllergenIds);
            setSavedAllergenIds(draftAllergenIds);
            showToast({ message: "Allergeni salvati", type: "success" });
        } catch (err) {
            showToast({
                message: err instanceof Error ? err.message : "Errore nel salvataggio",
                type: "error"
            });
        } finally {
            setIsSavingAllergens(false);
        }
    }, [tenantId, productId, draftAllergenIds, showToast]);

    // ── Card Ingredienti ───────────────────────────────────────────────
    const [allIngredients, setAllIngredients] = useState<V2Ingredient[]>([]);
    const [draftIngredientIds, setDraftIngredientIds] = useState<string[]>([]);
    const [savedIngredientIds, setSavedIngredientIds] = useState<string[]>([]);
    const [ingredientsLoading, setIngredientsLoading] = useState(true);
    const [isSavingIngredients, setIsSavingIngredients] = useState(false);

    const isIngredientsDirty = useMemo(
        () => !arraysEqualUnordered(draftIngredientIds, savedIngredientIds),
        [draftIngredientIds, savedIngredientIds]
    );

    const loadIngredients = useCallback(async () => {
        if (!showIngredients) return;
        try {
            setIngredientsLoading(true);
            const [list, productIngs] = await Promise.all([
                listIngredients(tenantId),
                getProductIngredients(productId)
            ]);
            setAllIngredients(list);
            const ids = productIngs.map(i => i.ingredient_id);
            setDraftIngredientIds(ids);
            setSavedIngredientIds(ids);
        } catch {
            showToast({ message: "Errore nel caricamento degli ingredienti", type: "error" });
        } finally {
            setIngredientsLoading(false);
        }
    }, [productId, tenantId, showIngredients, showToast]);

    useEffect(() => {
        loadIngredients();
    }, [loadIngredients]);

    const toggleIngredient = useCallback((id: string) => {
        setDraftIngredientIds(prev =>
            prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
        );
    }, []);

    const handleCreateIngredient = useCallback(
        async (name: string): Promise<string> => {
            const newIngredient = await createIngredient(tenantId, name);
            setAllIngredients(prev => [...prev, newIngredient]);
            return newIngredient.id;
        },
        [tenantId]
    );

    const handleCancelIngredients = useCallback(() => {
        setDraftIngredientIds(savedIngredientIds);
    }, [savedIngredientIds]);

    const handleSaveIngredients = useCallback(async () => {
        try {
            setIsSavingIngredients(true);
            await setProductIngredients(tenantId, productId, draftIngredientIds);
            setSavedIngredientIds(draftIngredientIds);
            showToast({ message: "Ingredienti salvati", type: "success" });
        } catch (err) {
            showToast({
                message: err instanceof Error ? err.message : "Errore nel salvataggio",
                type: "error"
            });
        } finally {
            setIsSavingIngredients(false);
        }
    }, [tenantId, productId, draftIngredientIds, showToast]);

    // ── Card Caratteristiche ───────────────────────────────────────────
    const [draftCharacteristicIds, setDraftCharacteristicIds] = useState<string[]>([]);
    const [savedCharacteristicIds, setSavedCharacteristicIds] = useState<string[]>([]);
    const [characteristicsLoading, setCharacteristicsLoading] = useState(true);
    const [isSavingCharacteristics, setIsSavingCharacteristics] = useState(false);

    const isCharacteristicsDirty = useMemo(
        () => !arraysEqualUnordered(draftCharacteristicIds, savedCharacteristicIds),
        [draftCharacteristicIds, savedCharacteristicIds]
    );

    const loadCharacteristics = useCallback(async () => {
        if (!showCharacteristics) return;
        try {
            setCharacteristicsLoading(true);
            const ids = await getProductCharacteristics(productId, tenantId);
            setDraftCharacteristicIds(ids);
            setSavedCharacteristicIds(ids);
        } catch {
            showToast({ message: "Errore nel caricamento delle caratteristiche", type: "error" });
        } finally {
            setCharacteristicsLoading(false);
        }
    }, [productId, tenantId, showCharacteristics, showToast]);

    useEffect(() => {
        loadCharacteristics();
    }, [loadCharacteristics]);

    const handleCancelCharacteristics = useCallback(() => {
        setDraftCharacteristicIds(savedCharacteristicIds);
    }, [savedCharacteristicIds]);

    const handleSaveCharacteristics = useCallback(async () => {
        try {
            setIsSavingCharacteristics(true);
            await setProductCharacteristics(tenantId, productId, draftCharacteristicIds);
            setSavedCharacteristicIds(draftCharacteristicIds);
            showToast({ message: "Caratteristiche salvate", type: "success" });
        } catch (err) {
            showToast({
                message: err instanceof Error ? err.message : "Errore nel salvataggio",
                type: "error"
            });
        } finally {
            setIsSavingCharacteristics(false);
        }
    }, [tenantId, productId, draftCharacteristicIds, showToast]);

    // ── Card Abbinamenti ───────────────────────────────────────────────
    const [draftPairings, setDraftPairings] = useState<PairingDraftItem[]>([]);
    const [savedPairings, setSavedPairings] = useState<PairingDraftItem[]>([]);
    const [pairingsLoading, setPairingsLoading] = useState(true);
    const [isSavingPairings, setIsSavingPairings] = useState(false);

    const isPairingsDirty = useMemo(() => {
        const shape = (items: PairingDraftItem[]) =>
            JSON.stringify(items.map(p => ({ id: p.pairedProductId, note: p.note.trim() })));
        return shape(draftPairings) !== shape(savedPairings);
    }, [draftPairings, savedPairings]);

    const loadPairings = useCallback(async () => {
        if (!showPairings) return;
        try {
            setPairingsLoading(true);
            const rows = await listPairings(productId, tenantId);
            const mapped: PairingDraftItem[] = rows.map(r => ({
                pairedProductId: r.pairedProductId,
                pairedProductName: r.pairedProductName,
                pairedProductImageUrl: r.pairedProductImageUrl,
                note: r.note ?? ""
            }));
            setDraftPairings(mapped);
            setSavedPairings(mapped);
        } catch {
            showToast({ message: "Errore nel caricamento degli abbinamenti", type: "error" });
        } finally {
            setPairingsLoading(false);
        }
    }, [productId, tenantId, showPairings, showToast]);

    useEffect(() => {
        loadPairings();
    }, [loadPairings]);

    const handleCancelPairings = useCallback(() => {
        setDraftPairings(savedPairings);
    }, [savedPairings]);

    const handleSavePairings = useCallback(async () => {
        try {
            setIsSavingPairings(true);
            await savePairings(
                tenantId,
                productId,
                draftPairings.map((p, idx) => ({
                    pairedProductId: p.pairedProductId,
                    note: p.note.trim() || null,
                    sortOrder: idx
                }))
            );
            // Normalizza le note come fa il persist (trim), così il diff dirty
            // torna pulito senza un reload che farebbe flicker.
            const normalized = draftPairings.map(p => ({ ...p, note: p.note.trim() }));
            setDraftPairings(normalized);
            setSavedPairings(normalized);
            showToast({ message: "Abbinamenti salvati", type: "success" });
        } catch (err) {
            showToast({
                message: err instanceof Error ? err.message : "Errore nel salvataggio",
                type: "error"
            });
        } finally {
            setIsSavingPairings(false);
        }
    }, [tenantId, productId, draftPairings, showToast]);

    // ── Card Note prodotto ─────────────────────────────────────────────
    const [draftNotes, setDraftNotes] = useState<ProductNote[]>(product.notes ?? []);
    const [savedNotes, setSavedNotes] = useState<ProductNote[]>(product.notes ?? []);
    const [isSavingNotes, setIsSavingNotes] = useState(false);

    const isNotesDirty = useMemo(
        () => JSON.stringify(draftNotes) !== JSON.stringify(savedNotes),
        [draftNotes, savedNotes]
    );

    useEffect(() => {
        if (isNotesDirty) return;
        const current = product.notes ?? [];
        setDraftNotes(current);
        setSavedNotes(current);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [product.notes]);

    const handleCancelNotes = useCallback(() => {
        setDraftNotes(savedNotes);
    }, [savedNotes]);

    const handleSaveNotes = useCallback(async () => {
        try {
            setIsSavingNotes(true);
            const updated = await updateProduct(productId, tenantId, {
                notes: draftNotes
            });
            setDraftNotes(updated.notes);
            setSavedNotes(updated.notes);
            onProductUpdated(updated);
            showToast({ message: "Note salvate", type: "success" });
        } catch (err) {
            showToast({
                message: err instanceof Error ? err.message : "Errore nel salvataggio",
                type: "error"
            });
        } finally {
            setIsSavingNotes(false);
        }
    }, [productId, tenantId, draftNotes, onProductUpdated, showToast]);

    // ── Card Gruppi prodotto (read-only + drawer) ──────────────────────
    const [allGroups, setAllGroups] = useState<ProductGroup[]>([]);
    const [assignedGroupIds, setAssignedGroupIds] = useState<Set<string>>(new Set());
    const [groupsLoading, setGroupsLoading] = useState(true);
    const [isGroupsDrawerOpen, setIsGroupsDrawerOpen] = useState(false);

    const loadGroups = useCallback(async () => {
        try {
            setGroupsLoading(true);
            const [groups, assignments] = await Promise.all([
                getProductGroups(tenantId),
                getProductGroupAssignments(productId)
            ]);
            setAllGroups(groups);
            setAssignedGroupIds(new Set(assignments.map(a => a.group_id)));
        } catch {
            showToast({ message: "Errore nel caricamento dei gruppi", type: "error" });
        } finally {
            setGroupsLoading(false);
        }
    }, [tenantId, productId, showToast]);

    useEffect(() => {
        loadGroups();
    }, [loadGroups]);

    const assignedGroups = useMemo(
        () => allGroups.filter(g => assignedGroupIds.has(g.id)),
        [allGroups, assignedGroupIds]
    );

    return (
        <div className={styles.grid}>
            {/* ─────────────── COLONNA SINISTRA ─────────────── */}
            <div className={styles.col}>
                {/* Card Immagine */}
                <SectionCard title="Immagine">

                    {visibleImageUrl && (
                        <img
                            src={visibleImageUrl}
                            alt="Anteprima immagine prodotto"
                            className={styles.imagePreview}
                        />
                    )}

                    <FileInput
                        accept="image/*"
                        maxSizeMb={5}
                        preview="none"
                        value={pendingImageFile}
                        onChange={file => {
                            setPendingImageFile(file);
                            if (file) setRemoveImage(false);
                        }}
                        disabled={isSavingImage}
                    />

                    {visibleImageUrl && (
                        <Button
                            variant="ghost"
                            size="sm"
                            type="button"
                            onClick={() => {
                                setRemoveImage(true);
                                setPendingImageFile(null);
                            }}
                            disabled={isSavingImage}
                        >
                            Rimuovi immagine
                        </Button>
                    )}

                    {removeImage && (
                        <Text variant="body-sm" colorVariant="muted">
                            L&apos;immagine verrà rimossa al salvataggio.
                        </Text>
                    )}

                    {isImageDirty && (
                        <UnsavedChangesBar
                            isSaving={isSavingImage}
                            onCancel={handleCancelImage}
                            onSave={handleSaveImage}
                        />
                    )}
                </SectionCard>

                {/* Card Informazioni */}
                <SectionCard title="Informazioni">
                    <div className={styles.fieldGrid}>
                        <TextInput
                            label="Nome"
                            value={draftName}
                            onChange={e => setDraftName(e.target.value)}
                            disabled={isSavingInformation}
                            required
                        />

                        <div className={styles.descriptionField}>
                            <AiDescriptionField
                                aiState={ai.aiState}
                                isGenerating={ai.isGenerating}
                                canGenerate={ai.canGenerate}
                                onGenerate={ai.generate}
                            >
                                <Textarea
                                    value={draftDescription}
                                    onChange={e => {
                                        setDraftDescription(e.target.value);
                                        ai.markManualEdit();
                                    }}
                                    disabled={isSavingInformation || ai.isGenerating}
                                    rows={4}
                                    placeholder="Descrizione del prodotto..."
                                />
                            </AiDescriptionField>
                            {isBaseProduct && product.description && (
                                <div className={styles.translationRow}>
                                    <TranslationStatusBadge
                                        tenantId={tenantId}
                                        entityType="product"
                                        entityId={productId}
                                        field="description"
                                        // Include la descrizione così il badge
                                        // rifetcha (stale/pending) dopo un edit IT.
                                        refreshKey={`${productId}:${product.description ?? ""}`}
                                    />
                                    <button
                                        type="button"
                                        className={styles.translationLink}
                                        onClick={() => onNavigateToTab("translations")}
                                    >
                                        Gestisci traduzioni →
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Sub-section Gruppi prodotto */}
                    <div className={styles.subSection}>
                        <header className={styles.subSectionHeader}>
                            <span className={styles.subSectionLabel}>Gruppi prodotto</span>
                            {!groupsLoading && allGroups.length > 0 && (
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setIsGroupsDrawerOpen(true)}
                                >
                                    Modifica
                                </Button>
                            )}
                        </header>

                        {groupsLoading ? (
                            <Text variant="body-sm" colorVariant="muted">
                                Caricamento gruppi...
                            </Text>
                        ) : allGroups.length === 0 ? (
                            <Text variant="body-sm" colorVariant="muted">
                                Nessun gruppo disponibile per questo tenant.
                            </Text>
                        ) : assignedGroups.length === 0 ? (
                            <Text variant="body-sm" colorVariant="muted">
                                Nessun gruppo assegnato.
                            </Text>
                        ) : (
                            <div className={styles.groupChips}>
                                {assignedGroups.map(g => (
                                    <Pill key={g.id} label={g.name} active />
                                ))}
                            </div>
                        )}
                    </div>

                    {isInformationDirty && (
                        <UnsavedChangesBar
                            isSaving={isSavingInformation}
                            onCancel={handleCancelInformation}
                            onSave={handleSaveInformation}
                        />
                    )}
                </SectionCard>

                {/* Card Ingredienti */}
                {showIngredients && (
                    <SectionCard title={verticalConfig.copy.productSections.ingredients}>
                        {ingredientsLoading ? (
                            <Text variant="body-sm" colorVariant="muted">
                                Caricamento ingredienti...
                            </Text>
                        ) : (
                            <IngredientCombobox
                                ingredients={allIngredients}
                                selectedIds={draftIngredientIds}
                                onToggle={toggleIngredient}
                                onCreate={handleCreateIngredient}
                                isLoadingIngredients={false}
                            />
                        )}

                        {isIngredientsDirty && (
                            <UnsavedChangesBar
                                isSaving={isSavingIngredients}
                                onCancel={handleCancelIngredients}
                                onSave={handleSaveIngredients}
                            />
                        )}
                    </SectionCard>
                )}

                {/* Card Note prodotto */}
                {showNotes && (
                    <SectionCard title="Note prodotto">
                        <ProductNotesSection
                            value={draftNotes}
                            onChange={setDraftNotes}
                            disabled={isSavingNotes}
                        />

                        {isNotesDirty && (
                            <UnsavedChangesBar
                                isSaving={isSavingNotes}
                                onCancel={handleCancelNotes}
                                onSave={handleSaveNotes}
                            />
                        )}
                    </SectionCard>
                )}

                {/* Card Abbinamenti */}
                {showPairings && (
                    <SectionCard title="Abbinamenti">
                        {pairingsLoading ? (
                            <Text variant="body-sm" colorVariant="muted">
                                Caricamento abbinamenti...
                            </Text>
                        ) : (
                            <PairingsSection
                                tenantId={tenantId}
                                currentProductId={productId}
                                value={draftPairings}
                                onChange={setDraftPairings}
                                disabled={isSavingPairings}
                            />
                        )}

                        {isPairingsDirty && (
                            <UnsavedChangesBar
                                isSaving={isSavingPairings}
                                onCancel={handleCancelPairings}
                                onSave={handleSavePairings}
                            />
                        )}
                    </SectionCard>
                )}
            </div>

            {/* ─────────────── COLONNA DESTRA ─────────────── */}
            <div className={styles.col}>
                {/* Card Allergeni */}
                {showAllergens && (
                    <SectionCard title={verticalConfig.copy.productSections.allergens}>
                        {allergensLoading ? (
                            <Text variant="body-sm" colorVariant="muted">
                                Caricamento allergeni...
                            </Text>
                        ) : (
                            <div className={styles.allergenGrid}>
                                {allergens.map(a => (
                                    <Pill
                                        key={a.id}
                                        label={a.label_it}
                                        active={draftAllergenIds.includes(a.id)}
                                        onClick={() => toggleAllergen(a.id)}
                                        disabled={isSavingAllergens}
                                    />
                                ))}
                            </div>
                        )}

                        {isAllergensDirty && (
                            <UnsavedChangesBar
                                isSaving={isSavingAllergens}
                                onCancel={handleCancelAllergens}
                                onSave={handleSaveAllergens}
                            />
                        )}
                    </SectionCard>
                )}

                {/* Card Caratteristiche */}
                {showCharacteristics && (
                    <SectionCard title="Caratteristiche">
                        {characteristicsLoading ? (
                            <Text variant="body-sm" colorVariant="muted">
                                Caricamento caratteristiche...
                            </Text>
                        ) : (
                            <CharacteristicsSection
                                vertical={vertical}
                                value={draftCharacteristicIds}
                                onChange={setDraftCharacteristicIds}
                                disabled={isSavingCharacteristics}
                            />
                        )}

                        {isCharacteristicsDirty && (
                            <UnsavedChangesBar
                                isSaving={isSavingCharacteristics}
                                onCancel={handleCancelCharacteristics}
                                onSave={handleSaveCharacteristics}
                            />
                        )}
                    </SectionCard>
                )}
            </div>

            <ProductGroupsEditDrawer
                open={isGroupsDrawerOpen}
                onClose={() => setIsGroupsDrawerOpen(false)}
                productId={productId}
                tenantId={tenantId}
                onSuccess={async () => {
                    await loadGroups();
                    setIsGroupsDrawerOpen(false);
                }}
            />
        </div>
    );
}

export default SchedaTab;
