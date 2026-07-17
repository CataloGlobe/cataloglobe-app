import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button/Button";
import { TextInput } from "@/components/ui/Input/TextInput";
import { ImageUploadEditor } from "@/components/ui/ImageUploadEditor";
import { Textarea } from "@/components/ui/Textarea/Textarea";
import { Pill } from "@/components/ui/Pill/Pill";
import { Badge } from "@/components/ui/Badge/Badge";
import { EmptyState } from "@/components/ui/EmptyState/EmptyState";
import { TranslationStatusBadge } from "@/components/ui/TranslationStatusBadge/TranslationStatusBadge";
import CharacteristicIcon from "@/components/ui/CharacteristicIcon/CharacteristicIcon";
import AllergenIcon from "@/components/ui/AllergenIcon/AllergenIcon";
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
import {
    CATEGORY_ORDER,
    CATEGORY_LABELS
} from "./components/CharacteristicsSection/CharacteristicsSection";
import ProductNotesSection from "./components/ProductNotesSection/ProductNotesSection";
import PairingsSection from "./components/PairingsSection/PairingsSection";
import { ProductAllergensDrawer } from "./ProductAllergensDrawer";
import { ProductCharacteristicsDrawer } from "./ProductCharacteristicsDrawer";
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
    const [isAllergensDrawerOpen, setIsAllergensDrawerOpen] = useState(false);
    const [isCharacteristicsDrawerOpen, setIsCharacteristicsDrawerOpen] = useState(false);

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
            <div className={styles.colLeft}>
            {/* Card Immagine — sx, sempre prima */}
            <div className={`${styles.cardSlot} ${styles.slotImage}`}>
                <SectionCard title="Immagine">

                    <Text variant="body-sm" colorVariant="muted">
                        PNG, JPG o WEBP — max 10 MB. Inquadra in 16:9; l&apos;inquadratura
                        (punto focale) viene riapplicata alle card e al dettaglio.
                    </Text>

                    <ImageUploadEditor
                        aspectRatio={16 / 9}
                        backgroundFillModes={["blur", "dominant", "color", "none"]}
                        maxSizeMB={10}
                        compressLongEdge={1280}
                        initialSource={image.removeImage ? null : image.visibleImageUrl}
                        initialFraming={image.savedFraming ?? undefined}
                        initialAspectRatio={image.savedAspectRatio ?? null}
                        onConfirm={({ file, framing, aspectRatio }) => {
                            image.setPendingFraming(framing);
                            if (file) {
                                image.setPendingImageFile(file);
                                image.setPendingAspectRatio(aspectRatio);
                                image.setRemoveImage(false);
                            }
                        }}
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

                </SectionCard>
            </div>

            {/* Card Informazioni (+ Gruppi prodotto) — sx */}
            <div className={`${styles.cardSlot} ${styles.slotInfo}`}>
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

                </SectionCard>
            </div>

            {/* Card Note prodotto — sx nel layout desktop, ma ULTIMA anche in mobile
                (sezione più interna): order forza la coda indipendentemente dal DOM. */}
            {draft.showNotes && (
                <div className={`${styles.cardSlot} ${styles.slotNotes}`}>
                    <SectionCard
                        title="Note prodotto"
                        subtitle="Note libere come provenienza, abbinamenti o dettagli particolari del prodotto"
                        badge={notes.draft.length > 0 ? <Badge variant="secondary">{notes.draft.length}/10</Badge> : undefined}
                    >
                        <ProductNotesSection
                            value={notes.draft}
                            onChange={notes.setDraft}
                            disabled={notes.isSaving}
                        />

                    </SectionCard>
                </div>
            )}
            </div>

            <div className={styles.colRight}>
            {/* Card Allergeni — dx */}
            {draft.showAllergens && (
                <div className={`${styles.cardSlot} ${styles.slotAllergens}`}>
                    <SectionCard
                        title={verticalConfig.copy.productSections.allergens}
                        actions={
                            !allergens.loading && allergens.draftIds.length > 0 ? (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setIsAllergensDrawerOpen(true)}
                                >
                                    Modifica
                                </Button>
                            ) : undefined
                        }
                    >
                        {allergens.loading ? (
                            <Text variant="body-sm" colorVariant="muted">
                                Caricamento allergeni...
                            </Text>
                        ) : allergens.draftIds.length === 0 ? (
                            <EmptyState
                                variant="inline"
                                icon={null}
                                title="Nessun allergene dichiarato"
                                action={
                                    <Button
                                        variant="secondary"
                                        size="sm"
                                        onClick={() => setIsAllergensDrawerOpen(true)}
                                    >
                                        Aggiungi
                                    </Button>
                                }
                            />
                        ) : (
                            <div className={styles.allergenGrid}>
                                {allergens.available
                                    .filter(a => allergens.draftIds.includes(a.id))
                                    .map(a => (
                                        <Pill
                                            key={a.id}
                                            label={a.label_it}
                                            icon={<AllergenIcon code={a.code} size={16} variant="bare" />}
                                            active
                                        />
                                    ))}
                            </div>
                        )}
                    </SectionCard>
                </div>
            )}

            {/* Card Caratteristiche — dx */}
            {draft.showCharacteristics && (
                <div className={`${styles.cardSlot} ${styles.slotCharacteristics}`}>
                    <SectionCard
                        title="Caratteristiche"
                        actions={
                            !characteristics.loading && characteristics.draftIds.length > 0 ? (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setIsCharacteristicsDrawerOpen(true)}
                                >
                                    Modifica
                                </Button>
                            ) : undefined
                        }
                    >
                        {characteristics.loading ? (
                            <Text variant="body-sm" colorVariant="muted">
                                Caricamento caratteristiche...
                            </Text>
                        ) : characteristics.draftIds.length === 0 ? (
                            <EmptyState
                                variant="inline"
                                icon={null}
                                title="Nessuna caratteristica"
                                action={
                                    <Button
                                        variant="secondary"
                                        size="sm"
                                        onClick={() => setIsCharacteristicsDrawerOpen(true)}
                                    >
                                        Aggiungi
                                    </Button>
                                }
                            />
                        ) : (
                            <div className={styles.characteristicsCompact}>
                                {CATEGORY_ORDER.map(category => {
                                    const items = characteristics.available.filter(
                                        c =>
                                            c.category === category &&
                                            characteristics.draftIds.includes(c.id)
                                    );
                                    if (items.length === 0) return null;
                                    const sorted = [...items].sort(
                                        (a, b) => a.sort_order - b.sort_order
                                    );
                                    return (
                                        <div key={category} className={styles.compactGroup}>
                                            <Text
                                                variant="caption"
                                                weight={700}
                                                colorVariant="muted"
                                                className={styles.compactGroupLabel}
                                            >
                                                {CATEGORY_LABELS[category]}
                                            </Text>
                                            <div className={styles.groupChips}>
                                                {sorted.map(item => (
                                                    <Pill
                                                        key={item.id}
                                                        label={item.label_it}
                                                        icon={
                                                            <CharacteristicIcon
                                                                icon={item.icon}
                                                                size={16}
                                                                variant="bare"
                                                            />
                                                        }
                                                        active
                                                    />
                                                ))}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </SectionCard>
                </div>
            )}

            {/* Card Ingredienti — dx (composizione, stessa famiglia di Allergeni) */}
            {draft.showIngredients && (
                <div className={`${styles.cardSlot} ${styles.slotIngredients}`}>
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

                    </SectionCard>
                </div>
            )}

            {/* Card Abbinamenti — dx, ultimo (relazione tra prodotti) */}
            {draft.showPairings && (
                <div className={`${styles.cardSlot} ${styles.slotPairings}`}>
                    <SectionCard
                        title="Abbinamenti"
                        subtitle="Suggerisci prodotti che stanno bene insieme"
                        badge={pairings.draft.length > 0 ? <Badge variant="secondary">{pairings.draft.length}</Badge> : undefined}
                    >
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

                    </SectionCard>
                </div>
            )}

            </div>

            <ProductAllergensDrawer
                open={isAllergensDrawerOpen}
                onClose={() => setIsAllergensDrawerOpen(false)}
                title={verticalConfig.copy.productSections.allergens}
                available={allergens.available}
                loading={allergens.loading}
                value={allergens.draftIds}
                onConfirm={allergens.setDraftIds}
            />

            <ProductCharacteristicsDrawer
                open={isCharacteristicsDrawerOpen}
                onClose={() => setIsCharacteristicsDrawerOpen(false)}
                vertical={vertical}
                value={characteristics.draftIds}
                onConfirm={characteristics.setDraftIds}
            />

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
