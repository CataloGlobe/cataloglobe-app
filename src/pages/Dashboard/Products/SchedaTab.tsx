import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button/Button";
import { TextInput } from "@/components/ui/Input/TextInput";
import { FileInput } from "@/components/ui/Input/FileInput";
import { Textarea } from "@/components/ui/Textarea/Textarea";
import { Pill } from "@/components/ui/Pill/Pill";
import { TranslationStatusBadge } from "@/components/ui/TranslationStatusBadge/TranslationStatusBadge";
import { UnsavedChangesBar } from "@/components/ui/UnsavedChangesBar/UnsavedChangesBar";
import Text from "@/components/ui/Text/Text";
import { useToast } from "@/context/Toast/ToastContext";
import { useVerticalConfig } from "@/hooks/useVerticalConfig";
import { useAiDescription } from "./hooks/useAiDescription";
import type { SchedaDraft } from "./hooks/useSchedaDraft";
import { AiDescriptionField } from "./components/AiDescriptionField";
import { type V2Product } from "@/services/supabase/products";
import {
    type ProductGroup,
    getProductGroups,
    getProductGroupAssignments
} from "@/services/supabase/productGroups";
import { ProductGroupsEditDrawer } from "./ProductGroupsEditDrawer";
import { IngredientCombobox } from "./components/IngredientCombobox";
import CharacteristicsSection from "./components/CharacteristicsSection/CharacteristicsSection";
import ProductNotesSection from "./components/ProductNotesSection/ProductNotesSection";
import PairingsSection from "./components/PairingsSection/PairingsSection";
import { SectionCard } from "@/components/ui/SectionCard/SectionCard";
import styles from "./SchedaTab.module.scss";

interface SchedaTabProps {
    product: V2Product;
    productId: string;
    tenantId: string;
    /** Vertical type del tenant — necessario per `CharacteristicsSection`. */
    vertical?: string;
    /** Switch to another tab in the parent ProductPage. */
    onNavigateToTab: (tab: string) => void;
    /** Draft sollevato in `ProductPage` via `useSchedaDraft` — sopravvive al cambio tab. */
    draft: SchedaDraft;
}

/**
 * Tab "Scheda" — orchestrator delle 8 cards (6 sx + 2 dx) con layout
 * 2 colonne >=1024px. Componente controlled: il draft/dirty/save di ogni
 * sotto-sezione vive in `useSchedaDraft` (montato in `ProductPage`), qui
 * arriva via prop `draft`. Eccezione: Gruppi prodotto resta locale (read-only
 * + drawer autonomo, nessun draft da perdere al cambio tab).
 */
export function SchedaTab({
    product,
    productId,
    tenantId,
    vertical,
    onNavigateToTab,
    draft
}: SchedaTabProps) {
    const { showToast } = useToast();
    const verticalConfig = useVerticalConfig();
    const isBaseProduct = product.parent_product_id === null;

    const { image, information, allergens, ingredients, characteristics, pairings, notes } = draft;

    // AI description enrichment — stato UI ephemeral (non persistito), resta
    // locale al componente. Scrive nel draft sollevato via onDescriptionGenerated.
    const ai = useAiDescription({
        name: information.draftName,
        tenantId,
        onDescriptionGenerated: information.setDraftDescription
    });

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

    const assignedGroups = allGroups.filter(g => assignedGroupIds.has(g.id));

    return (
        <div className={styles.grid}>
            {/* ─────────────── COLONNA SINISTRA ─────────────── */}
            <div className={styles.col}>
                {/* Card Immagine */}
                <SectionCard title="Immagine">

                    {image.visibleImageUrl && (
                        <img
                            src={image.visibleImageUrl}
                            alt="Anteprima immagine prodotto"
                            className={styles.imagePreview}
                        />
                    )}

                    <FileInput
                        accept="image/*"
                        maxSizeMb={5}
                        preview="none"
                        value={image.pendingImageFile}
                        onChange={file => {
                            image.setPendingImageFile(file);
                            if (file) image.setRemoveImage(false);
                        }}
                        disabled={image.isSaving}
                    />

                    {image.visibleImageUrl && (
                        <Button
                            variant="ghost"
                            size="sm"
                            type="button"
                            onClick={() => {
                                image.setRemoveImage(true);
                                image.setPendingImageFile(null);
                            }}
                            disabled={image.isSaving}
                        >
                            Rimuovi immagine
                        </Button>
                    )}

                    {image.removeImage && (
                        <Text variant="body-sm" colorVariant="muted">
                            L&apos;immagine verrà rimossa al salvataggio.
                        </Text>
                    )}

                    {image.isDirty && (
                        <UnsavedChangesBar
                            isSaving={image.isSaving}
                            onCancel={image.handleCancel}
                            onSave={image.handleSave}
                        />
                    )}
                </SectionCard>

                {/* Card Informazioni */}
                <SectionCard title="Informazioni">
                    <div className={styles.fieldGrid}>
                        <TextInput
                            label="Nome"
                            value={information.draftName}
                            onChange={e => information.setDraftName(e.target.value)}
                            disabled={information.isSaving}
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
                                    value={information.draftDescription}
                                    onChange={e => {
                                        information.setDraftDescription(e.target.value);
                                        ai.markManualEdit();
                                    }}
                                    disabled={information.isSaving || ai.isGenerating}
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

                    {information.isDirty && (
                        <UnsavedChangesBar
                            isSaving={information.isSaving}
                            onCancel={information.handleCancel}
                            onSave={information.handleSave}
                        />
                    )}
                </SectionCard>

                {/* Card Ingredienti */}
                {draft.showIngredients && (
                    <SectionCard title={verticalConfig.copy.productSections.ingredients}>
                        {ingredients.loading ? (
                            <Text variant="body-sm" colorVariant="muted">
                                Caricamento ingredienti...
                            </Text>
                        ) : (
                            <IngredientCombobox
                                ingredients={ingredients.available}
                                selectedIds={ingredients.draftIds}
                                onToggle={ingredients.toggle}
                                onCreate={ingredients.handleCreate}
                                isLoadingIngredients={false}
                            />
                        )}

                        {ingredients.isDirty && (
                            <UnsavedChangesBar
                                isSaving={ingredients.isSaving}
                                onCancel={ingredients.handleCancel}
                                onSave={ingredients.handleSave}
                            />
                        )}
                    </SectionCard>
                )}

                {/* Card Note prodotto */}
                {draft.showNotes && (
                    <SectionCard title="Note prodotto">
                        <ProductNotesSection
                            value={notes.draft}
                            onChange={notes.setDraft}
                            disabled={notes.isSaving}
                        />

                        {notes.isDirty && (
                            <UnsavedChangesBar
                                isSaving={notes.isSaving}
                                onCancel={notes.handleCancel}
                                onSave={notes.handleSave}
                            />
                        )}
                    </SectionCard>
                )}

                {/* Card Abbinamenti */}
                {draft.showPairings && (
                    <SectionCard title="Abbinamenti">
                        {pairings.loading ? (
                            <Text variant="body-sm" colorVariant="muted">
                                Caricamento abbinamenti...
                            </Text>
                        ) : (
                            <PairingsSection
                                tenantId={tenantId}
                                currentProductId={productId}
                                value={pairings.draft}
                                onChange={pairings.setDraft}
                                disabled={pairings.isSaving}
                            />
                        )}

                        {pairings.isDirty && (
                            <UnsavedChangesBar
                                isSaving={pairings.isSaving}
                                onCancel={pairings.handleCancel}
                                onSave={pairings.handleSave}
                            />
                        )}
                    </SectionCard>
                )}
            </div>

            {/* ─────────────── COLONNA DESTRA ─────────────── */}
            <div className={styles.col}>
                {/* Card Allergeni */}
                {draft.showAllergens && (
                    <SectionCard title={verticalConfig.copy.productSections.allergens}>
                        {allergens.loading ? (
                            <Text variant="body-sm" colorVariant="muted">
                                Caricamento allergeni...
                            </Text>
                        ) : (
                            <div className={styles.allergenGrid}>
                                {allergens.available.map(a => (
                                    <Pill
                                        key={a.id}
                                        label={a.label_it}
                                        active={allergens.draftIds.includes(a.id)}
                                        onClick={() => allergens.toggle(a.id)}
                                        disabled={allergens.isSaving}
                                    />
                                ))}
                            </div>
                        )}

                        {allergens.isDirty && (
                            <UnsavedChangesBar
                                isSaving={allergens.isSaving}
                                onCancel={allergens.handleCancel}
                                onSave={allergens.handleSave}
                            />
                        )}
                    </SectionCard>
                )}

                {/* Card Caratteristiche */}
                {draft.showCharacteristics && (
                    <SectionCard title="Caratteristiche">
                        {characteristics.loading ? (
                            <Text variant="body-sm" colorVariant="muted">
                                Caricamento caratteristiche...
                            </Text>
                        ) : (
                            <CharacteristicsSection
                                vertical={vertical}
                                value={characteristics.draftIds}
                                onChange={characteristics.setDraftIds}
                                disabled={characteristics.isSaving}
                            />
                        )}

                        {characteristics.isDirty && (
                            <UnsavedChangesBar
                                isSaving={characteristics.isSaving}
                                onCancel={characteristics.handleCancel}
                                onSave={characteristics.handleSave}
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
