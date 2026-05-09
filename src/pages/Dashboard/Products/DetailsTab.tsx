import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button/Button";
import { TextInput } from "@/components/ui/Input/TextInput";
import { FileInput } from "@/components/ui/Input/FileInput";
import { Textarea } from "@/components/ui/Textarea/Textarea";
import { Pill } from "@/components/ui/Pill/Pill";
import { TranslationStatusBadge } from "@/components/ui/TranslationStatusBadge/TranslationStatusBadge";
import Text from "@/components/ui/Text/Text";
import { useToast } from "@/context/Toast/ToastContext";
import { useVerticalConfig } from "@/hooks/useVerticalConfig";
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
import CharacteristicsSection from "./components/CharacteristicsSection/CharacteristicsSection";
import ProductNotesSection from "./components/ProductNotesSection/ProductNotesSection";
import styles from "./DetailsTab.module.scss";

interface DetailsTabProps {
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

interface ActionBarProps {
    isSaving: boolean;
    onCancel: () => void;
    onSave: () => void;
}

function ActionBar({ isSaving, onCancel, onSave }: ActionBarProps) {
    return (
        <div className={styles.actionBar} role="status" aria-live="polite">
            <div className={styles.actionBarLabel}>
                <span className={styles.dirtyDot} aria-hidden />
                <Text variant="body-sm" weight={600}>
                    Modifiche non salvate
                </Text>
            </div>
            <div className={styles.actionBarButtons}>
                <Button
                    type="button"
                    variant="secondary"
                    onClick={onCancel}
                    disabled={isSaving}
                >
                    Annulla
                </Button>
                <Button
                    type="button"
                    variant="primary"
                    onClick={onSave}
                    loading={isSaving}
                    disabled={isSaving}
                >
                    Salva
                </Button>
            </div>
        </div>
    );
}

/**
 * Tab "Dettagli" — orchestrator delle 5 sub-sezioni Identità, Gruppi,
 * Specifiche food, Caratteristiche, Note. Ogni sub-sezione ha proprio
 * dirty state e sticky save bar indipendente.
 */
export function DetailsTab({
    product,
    productId,
    tenantId,
    onProductUpdated,
    vertical,
    onNavigateToTab
}: DetailsTabProps) {
    const { showToast } = useToast();
    const verticalConfig = useVerticalConfig();
    const isBaseProduct = product.parent_product_id === null;

    const showSpecs =
        verticalConfig.productSections.allergens ||
        verticalConfig.productSections.ingredients;
    const showCharacteristics =
        verticalConfig.productSections.characteristics && isBaseProduct;
    const showNotes = verticalConfig.productSections.notes && isBaseProduct;

    // ── Identità ────────────────────────────────────────────────────────
    const [draftName, setDraftName] = useState(product.name);
    const [draftDescription, setDraftDescription] = useState(product.description ?? "");
    const [draftImageUrl, setDraftImageUrl] = useState<string | null>(product.image_url ?? null);
    const [pendingImageFile, setPendingImageFile] = useState<File | null>(null);
    const [removeImage, setRemoveImage] = useState(false);
    const [isSavingIdentity, setIsSavingIdentity] = useState(false);

    const isIdentityDirty = useMemo(() => {
        const baseName = product.name ?? "";
        const baseDesc = product.description ?? "";
        if (draftName.trim() !== baseName.trim()) return true;
        if (draftDescription.trim() !== baseDesc.trim()) return true;
        if (pendingImageFile !== null) return true;
        if (removeImage) return true;
        return false;
    }, [draftName, draftDescription, pendingImageFile, removeImage, product.name, product.description]);

    useEffect(() => {
        if (isIdentityDirty) return;
        setDraftName(product.name);
        setDraftDescription(product.description ?? "");
        setDraftImageUrl(product.image_url ?? null);
        setPendingImageFile(null);
        setRemoveImage(false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [product]);

    const handleCancelIdentity = useCallback(() => {
        setDraftName(product.name);
        setDraftDescription(product.description ?? "");
        setDraftImageUrl(product.image_url ?? null);
        setPendingImageFile(null);
        setRemoveImage(false);
    }, [product]);

    const handleSaveIdentity = useCallback(async () => {
        const trimmedName = draftName.trim();
        if (!trimmedName) {
            showToast({ message: "Il nome è obbligatorio", type: "error" });
            return;
        }

        try {
            setIsSavingIdentity(true);

            let imageUrl: string | null = draftImageUrl;
            if (removeImage) {
                imageUrl = null;
            } else if (pendingImageFile) {
                imageUrl = await uploadProductImage(
                    tenantId,
                    productId,
                    await compressImage(pendingImageFile, COMPRESS_PROFILES.product)
                );
            }

            const updated = await updateProduct(productId, tenantId, {
                name: trimmedName,
                description: draftDescription.trim() || null,
                image_url: imageUrl
            });

            onProductUpdated(updated);
            setPendingImageFile(null);
            setRemoveImage(false);
            showToast({ message: "Modifiche salvate", type: "success" });
        } catch (err) {
            showToast({
                message: err instanceof Error ? err.message : "Errore nel salvataggio",
                type: "error"
            });
        } finally {
            setIsSavingIdentity(false);
        }
    }, [
        draftName,
        draftDescription,
        draftImageUrl,
        pendingImageFile,
        removeImage,
        productId,
        tenantId,
        onProductUpdated,
        showToast
    ]);

    // ── Gruppi prodotto ─────────────────────────────────────────────────
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

    // ── Specifiche food (allergeni + ingredienti) ───────────────────────
    const [allergens, setAllergens] = useState<V2SystemAllergen[]>([]);
    const [allIngredients, setAllIngredients] = useState<V2Ingredient[]>([]);
    const [draftAllergenIds, setDraftAllergenIds] = useState<number[]>([]);
    const [savedAllergenIds, setSavedAllergenIds] = useState<number[]>([]);
    const [draftIngredientIds, setDraftIngredientIds] = useState<string[]>([]);
    const [savedIngredientIds, setSavedIngredientIds] = useState<string[]>([]);
    const [specsLoading, setSpecsLoading] = useState(true);
    const [isSavingSpecs, setIsSavingSpecs] = useState(false);

    const isSpecsDirty = useMemo(
        () =>
            !arraysEqualUnordered(draftAllergenIds, savedAllergenIds) ||
            !arraysEqualUnordered(draftIngredientIds, savedIngredientIds),
        [draftAllergenIds, savedAllergenIds, draftIngredientIds, savedIngredientIds]
    );

    const loadSpecs = useCallback(async () => {
        if (!showSpecs) return;
        try {
            setSpecsLoading(true);
            const [allAllergens, productAllergenIds, ingredients, productIngredients] =
                await Promise.all([
                    listAllergens(),
                    getProductAllergens(productId, tenantId),
                    listIngredients(tenantId),
                    getProductIngredients(productId)
                ]);
            setAllergens(allAllergens);
            setAllIngredients(ingredients);
            setDraftAllergenIds(productAllergenIds);
            setSavedAllergenIds(productAllergenIds);
            const ingIds = productIngredients.map(i => i.ingredient_id);
            setDraftIngredientIds(ingIds);
            setSavedIngredientIds(ingIds);
        } catch {
            showToast({ message: "Errore nel caricamento delle specifiche", type: "error" });
        } finally {
            setSpecsLoading(false);
        }
    }, [productId, tenantId, showSpecs, showToast]);

    useEffect(() => {
        loadSpecs();
    }, [loadSpecs]);

    const toggleAllergen = useCallback((id: number) => {
        setDraftAllergenIds(prev =>
            prev.includes(id) ? prev.filter(a => a !== id) : [...prev, id]
        );
    }, []);

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

    const handleCancelSpecs = useCallback(() => {
        setDraftAllergenIds(savedAllergenIds);
        setDraftIngredientIds(savedIngredientIds);
    }, [savedAllergenIds, savedIngredientIds]);

    const handleSaveSpecs = useCallback(async () => {
        try {
            setIsSavingSpecs(true);
            await Promise.all([
                setProductAllergens(tenantId, productId, draftAllergenIds),
                setProductIngredients(tenantId, productId, draftIngredientIds)
            ]);
            setSavedAllergenIds(draftAllergenIds);
            setSavedIngredientIds(draftIngredientIds);
            showToast({ message: "Specifiche salvate", type: "success" });
        } catch (err) {
            showToast({
                message: err instanceof Error ? err.message : "Errore nel salvataggio",
                type: "error"
            });
        } finally {
            setIsSavingSpecs(false);
        }
    }, [tenantId, productId, draftAllergenIds, draftIngredientIds, showToast]);

    // ── Caratteristiche ────────────────────────────────────────────────
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
            showToast({
                message: "Errore nel caricamento delle caratteristiche",
                type: "error"
            });
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

    // ── Note prodotto ──────────────────────────────────────────────────
    const [draftNotes, setDraftNotes] = useState<ProductNote[]>(product.notes ?? []);
    const [savedNotes, setSavedNotes] = useState<ProductNote[]>(product.notes ?? []);
    const [isSavingNotes, setIsSavingNotes] = useState(false);

    const isNotesDirty = useMemo(
        () => JSON.stringify(draftNotes) !== JSON.stringify(savedNotes),
        [draftNotes, savedNotes]
    );

    // Re-sync notes from product when parent updates and we're not dirty.
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
            // Service ritorna note normalizzate (trim + skip-empty); allinea i
            // due snapshot al risultato server per evitare dirty fantasma.
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

    return (
        <div className={styles.tab}>
            {/* ── Identità ──────────────────────────────────────────── */}
            <section className={styles.section} data-section="identity">
                <header className={styles.sectionHeader}>
                    <Text variant="title-sm" weight={600}>
                        Identità
                    </Text>
                </header>

                <div className={styles.fieldGrid}>
                    <TextInput
                        label="Nome"
                        value={draftName}
                        onChange={e => setDraftName(e.target.value)}
                        disabled={isSavingIdentity}
                        required
                    />

                    <div className={styles.descriptionField}>
                        <Textarea
                            label="Descrizione"
                            value={draftDescription}
                            onChange={e => setDraftDescription(e.target.value)}
                            disabled={isSavingIdentity}
                            rows={4}
                            placeholder="Descrizione del prodotto..."
                        />
                        {isBaseProduct && product.description && (
                            <div className={styles.translationRow}>
                                <TranslationStatusBadge
                                    tenantId={tenantId}
                                    entityType="product"
                                    entityId={productId}
                                    field="description"
                                    refreshKey={productId}
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

                    <FileInput
                        label="Immagine"
                        accept="image/*"
                        maxSizeMb={5}
                        preview="auto"
                        value={pendingImageFile}
                        onChange={file => {
                            setPendingImageFile(file);
                            if (file) setRemoveImage(false);
                        }}
                        disabled={isSavingIdentity}
                    />

                    {draftImageUrl && !removeImage && !pendingImageFile && (
                        <Button
                            variant="ghost"
                            size="sm"
                            type="button"
                            onClick={() => setRemoveImage(true)}
                            disabled={isSavingIdentity}
                        >
                            Rimuovi immagine
                        </Button>
                    )}

                    {removeImage && (
                        <Text variant="body-sm" colorVariant="muted">
                            L&apos;immagine verrà rimossa al salvataggio.
                        </Text>
                    )}
                </div>

                {isIdentityDirty && (
                    <ActionBar
                        isSaving={isSavingIdentity}
                        onCancel={handleCancelIdentity}
                        onSave={handleSaveIdentity}
                    />
                )}
            </section>

            {/* ── Gruppi prodotto ───────────────────────────────────── */}
            <section className={styles.section} data-section="groups">
                <header className={styles.sectionHeader}>
                    <Text variant="title-sm" weight={600}>
                        Gruppi prodotto
                    </Text>
                    {!groupsLoading && allGroups.length > 0 && (
                        <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={() => setIsGroupsDrawerOpen(true)}
                        >
                            Modifica gruppi
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
                    <div className={styles.emptyGroupsRow}>
                        <Text variant="body-sm" colorVariant="muted">
                            Nessun gruppo assegnato.
                        </Text>
                        <button
                            type="button"
                            className={styles.inlineLink}
                            onClick={() => setIsGroupsDrawerOpen(true)}
                        >
                            Aggiungi
                        </button>
                    </div>
                ) : (
                    <div className={styles.chipList}>
                        {assignedGroups.map(g => (
                            <span key={g.id} className={styles.chip}>
                                {g.name}
                            </span>
                        ))}
                    </div>
                )}
            </section>

            {/* ── Specifiche food ───────────────────────────────────── */}
            {showSpecs && (
                <section className={styles.section} data-section="specs">
                    <header className={styles.sectionHeader}>
                        <Text variant="title-sm" weight={600}>
                            Specifiche food
                        </Text>
                    </header>

                    {specsLoading ? (
                        <Text variant="body-sm" colorVariant="muted">
                            Caricamento specifiche...
                        </Text>
                    ) : (
                        <div className={styles.fieldGrid}>
                            {verticalConfig.productSections.allergens && (
                                <div className={styles.subBlock}>
                                    <Text variant="body-sm" weight={600}>
                                        {verticalConfig.copy.productSections.allergens}
                                    </Text>
                                    <div className={styles.allergenGrid}>
                                        {allergens.map(a => (
                                            <Pill
                                                key={a.id}
                                                label={a.label_it}
                                                active={draftAllergenIds.includes(a.id)}
                                                onClick={() => toggleAllergen(a.id)}
                                                disabled={isSavingSpecs}
                                            />
                                        ))}
                                    </div>
                                </div>
                            )}

                            {verticalConfig.productSections.ingredients && (
                                <div className={styles.subBlock}>
                                    <Text variant="body-sm" weight={600}>
                                        {verticalConfig.copy.productSections.ingredients}
                                    </Text>
                                    <IngredientCombobox
                                        ingredients={allIngredients}
                                        selectedIds={draftIngredientIds}
                                        onToggle={toggleIngredient}
                                        onCreate={handleCreateIngredient}
                                        isLoadingIngredients={false}
                                    />
                                </div>
                            )}
                        </div>
                    )}

                    {isSpecsDirty && (
                        <ActionBar
                            isSaving={isSavingSpecs}
                            onCancel={handleCancelSpecs}
                            onSave={handleSaveSpecs}
                        />
                    )}
                </section>
            )}

            {/* ── Caratteristiche ───────────────────────────────────── */}
            {showCharacteristics && (
                <section className={styles.section} data-section="characteristics">
                    <header className={styles.sectionHeader}>
                        <Text variant="title-sm" weight={600}>
                            Caratteristiche
                        </Text>
                    </header>

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
                        <ActionBar
                            isSaving={isSavingCharacteristics}
                            onCancel={handleCancelCharacteristics}
                            onSave={handleSaveCharacteristics}
                        />
                    )}
                </section>
            )}

            {/* ── Note prodotto ─────────────────────────────────────── */}
            {showNotes && (
                <section className={styles.section} data-section="notes">
                    <header className={styles.sectionHeader}>
                        <Text variant="title-sm" weight={600}>
                            Note prodotto
                        </Text>
                    </header>

                    <ProductNotesSection
                        value={draftNotes}
                        onChange={setDraftNotes}
                        disabled={isSavingNotes}
                    />

                    {isNotesDirty && (
                        <ActionBar
                            isSaving={isSavingNotes}
                            onCancel={handleCancelNotes}
                            onSave={handleSaveNotes}
                        />
                    )}
                </section>
            )}

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

export default DetailsTab;
