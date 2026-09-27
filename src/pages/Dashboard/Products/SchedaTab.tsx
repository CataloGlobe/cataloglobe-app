import { useState } from "react";
import { Button } from "@/components/ui/Button/Button";
import { TextInput } from "@/components/ui/Input/TextInput";
import { ImageUploadEditor } from "@/components/ui/ImageUploadEditor";
import { Textarea } from "@/components/ui/Textarea/Textarea";
import { Chip } from "@/components/ui/Chip/Chip";
import { Badge } from "@/components/ui/Badge/Badge";
import { Card } from "@/components/ui/Card/Card";
import { EmptyState } from "@/components/ui/EmptyState/EmptyState";
import { TranslationStatusBadge } from "@/components/ui/TranslationStatusBadge/TranslationStatusBadge";
import CharacteristicIcon from "@/components/ui/CharacteristicIcon/CharacteristicIcon";
import AllergenIcon from "@/components/ui/AllergenIcon/AllergenIcon";
import Text from "@/components/ui/Text/Text";
import { useVerticalConfig } from "@/hooks/useVerticalConfig";
import { useAiDescription } from "./hooks/useAiDescription";
import { useBusinessOutletContext } from "@/layouts/MainLayout/outletContext";
import type { SchedaDraft } from "./hooks/useSchedaDraft";
import { AiDescriptionField } from "./components/AiDescriptionField";
import { type V2Product } from "@/services/supabase/products";
import {
    CATEGORY_ORDER,
    CATEGORY_LABELS
} from "./components/CharacteristicsSection/CharacteristicsSection";
import ProductNotesSection from "./components/ProductNotesSection/ProductNotesSection";
import PairingsSection from "./components/PairingsSection/PairingsSection";
import { ProductAllergensDrawer } from "./ProductAllergensDrawer";
import { ProductCharacteristicsDrawer } from "./ProductCharacteristicsDrawer";
import { ProductIngredientsDrawer } from "./ProductIngredientsDrawer";
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
 * Tab «Scheda» (lotto Prodotti P6, §50.9/2): una colonna nell'ordine del
 * mockup — Informazioni (con l'immagine) · Allergeni · Ingredienti ·
 * Caratteristiche · Note · Abbinamenti. Ogni sezione è una `Card` col
 * conteggio nel `badge` e «Modifica» nelle azioni. Componente controlled:
 * tutto il draft vive in `useSchedaDraft` (montato in `ProductPage`); i
 * drawer applicano alla bozza, salva l'header.
 *
 * I gruppi del prodotto non stanno più qui (§50.9/3): salvavano subito in
 * una pagina in bozza. Sono in Utilizzo.
 */
export function SchedaTab({ product, productId, tenantId, vertical, onNavigateToTab, draft }: SchedaTabProps) {
    const verticalConfig = useVerticalConfig();
    const isBaseProduct = product.parent_product_id === null;
    const { image, information, allergens, ingredients, characteristics, pairings, notes } = draft;

    // AI description enrichment — stato UI ephemeral (non persistito), resta
    // locale al componente. Scrive nel draft sollevato via onDescriptionGenerated.
    const businessOutlet = useBusinessOutletContext();
    const ai = useAiDescription({
        name: information.draftName,
        tenantId,
        onDescriptionGenerated: information.setDraftDescription,
        onConsumed: businessOutlet?.refreshAiUsage
    });

    const [isAllergensDrawerOpen, setIsAllergensDrawerOpen] = useState(false);
    const [isIngredientsDrawerOpen, setIsIngredientsDrawerOpen] = useState(false);
    const [isCharacteristicsDrawerOpen, setIsCharacteristicsDrawerOpen] = useState(false);

    const allergenLabel = verticalConfig.copy.productSections.allergens;
    const ingredientLabel = verticalConfig.copy.productSections.ingredients;
    const selectedAllergens = allergens.available.filter(a => allergens.draftIds.includes(a.id));
    const selectedIngredients = ingredients.draftIds
        .map(id => ingredients.available.find(i => i.id === id))
        .filter((i): i is NonNullable<typeof i> => i !== undefined);

    /** «Modifica» se c'è già qualcosa, «Aggiungi» se è vuoto. */
    const editAction = (count: number, onClick: () => void, disabled = false) => (
        <Button variant="secondary" size="sm" onClick={onClick} disabled={disabled}>
            {count > 0 ? "Modifica" : "Aggiungi"}
        </Button>
    );
    const countBadge = (count: number) => (count > 0 ? <Badge variant="secondary">{count}</Badge> : undefined);

    return (
        <div className={styles.stack}>
            <Card title="Informazioni">
                <div className={styles.fields}>
                    <TextInput
                        label="Nome"
                        value={information.draftName}
                        onChange={e => information.setDraftName(e.target.value)}
                        disabled={information.isSaving}
                        required
                    />

                    <div className={styles.field}>
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
                                placeholder={`Descrizione del ${verticalConfig.productLabel.toLowerCase()}...`}
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
                                <Button variant="ghost" size="sm" onClick={() => onNavigateToTab("translations")}>
                                    Gestisci traduzioni
                                </Button>
                            </div>
                        )}
                    </div>

                    {/* 4:3 = media geometrica dei tre contenitori pubblici reali
                        (card 1:1 sotto 1024px, card 4:3 sopra, ItemDetail 4:3):
                        dimezza lo scarto peggiore fra quel che si inquadra qui e
                        quel che vede il cliente. Cambiarlo qui NON basta: il
                        riquadro di ItemDetail deve restare lo stesso valore. */}
                    <div className={styles.field}>
                        <ImageUploadEditor
                            aspectRatio={4 / 3}
                            backgroundFillModes={["blur", "dominant", "color", "none"]}
                            maxSizeMB={10}
                            compressLongEdge={1280}
                            fieldLabel="Immagine"
                            drawerTitle="Modifica immagine"
                            requiresConfirm={false}
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
                            onRemove={() => {
                                image.setRemoveImage(true);
                                image.setPendingImageFile(null);
                            }}
                            removing={image.isSaving}
                        />
                        <Text variant="body-sm" colorVariant="muted">
                            {image.removeImage
                                ? "L'immagine verrà rimossa al salvataggio."
                                : "L'inquadratura (punto focale) viene riapplicata alle card e al dettaglio."}
                        </Text>
                    </div>
                </div>
            </Card>

            {draft.showAllergens && (
                <Card
                    title={allergenLabel}
                    badge={countBadge(selectedAllergens.length)}
                    actions={editAction(selectedAllergens.length, () => setIsAllergensDrawerOpen(true), allergens.loading)}
                >
                    {allergens.loading ? (
                        <Text variant="body-sm" colorVariant="muted">
                            Caricamento allergeni...
                        </Text>
                    ) : selectedAllergens.length === 0 ? (
                        <Text variant="body-sm" colorVariant="muted">
                            Nessun allergene dichiarato.
                        </Text>
                    ) : (
                        <div className={styles.chips}>
                            {selectedAllergens.map(a => (
                                <Chip
                                    key={a.id}
                                    label={a.label_it}
                                    icon={<AllergenIcon code={a.code} size={16} variant="bare" />}
                                />
                            ))}
                        </div>
                    )}
                </Card>
            )}

            {draft.showIngredients && (
                <Card
                    title={ingredientLabel}
                    badge={countBadge(selectedIngredients.length)}
                    actions={editAction(selectedIngredients.length, () => setIsIngredientsDrawerOpen(true), ingredients.loading)}
                >
                    {ingredients.loading ? (
                        <Text variant="body-sm" colorVariant="muted">
                            Caricamento ingredienti...
                        </Text>
                    ) : selectedIngredients.length === 0 ? (
                        <Text variant="body-sm" colorVariant="muted">
                            Nessun ingrediente.
                        </Text>
                    ) : (
                        <div className={styles.chips}>
                            {selectedIngredients.map(i => (
                                <Chip key={i.id} label={i.name} />
                            ))}
                        </div>
                    )}
                </Card>
            )}

            {/* Il verticale spegne allergeni e ingredienti: lo si dice (§25.4). */}
            {!draft.showAllergens && !draft.showIngredients && (
                <Card>
                    <EmptyState
                        variant="inline"
                        icon={null}
                        title={`${allergenLabel} e ${ingredientLabel.toLowerCase()} non si usano qui`}
                        description={`Per questo tipo di attività i ${verticalConfig.productLabelPlural.toLowerCase()} non li dichiarano.`}
                    />
                </Card>
            )}

            {draft.showCharacteristics && (
                <Card
                    title="Caratteristiche"
                    badge={countBadge(characteristics.draftIds.length)}
                    actions={editAction(
                        characteristics.draftIds.length,
                        () => setIsCharacteristicsDrawerOpen(true),
                        characteristics.loading
                    )}
                >
                    {characteristics.loading ? (
                        <Text variant="body-sm" colorVariant="muted">
                            Caricamento caratteristiche...
                        </Text>
                    ) : characteristics.draftIds.length === 0 ? (
                        <Text variant="body-sm" colorVariant="muted">
                            Nessuna caratteristica.
                        </Text>
                    ) : (
                        <div className={styles.groups}>
                            {CATEGORY_ORDER.map(category => {
                                const items = characteristics.available
                                    .filter(c => c.category === category && characteristics.draftIds.includes(c.id))
                                    .sort((a, b) => a.sort_order - b.sort_order);
                                if (items.length === 0) return null;
                                return (
                                    <div key={category} className={styles.field}>
                                        <Text variant="caption" weight={600} colorVariant="muted">
                                            {CATEGORY_LABELS[category]}
                                        </Text>
                                        <div className={styles.chips}>
                                            {items.map(item => (
                                                <Chip
                                                    key={item.id}
                                                    label={item.label_it}
                                                    icon={<CharacteristicIcon icon={item.icon} size={16} variant="bare" />}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </Card>
            )}

            {draft.showNotes && (
                <Card
                    title="Note prodotto"
                    subtitle="Fatti che non stanno nella descrizione: provenienza, cottura, dettagli."
                    badge={notes.draft.length > 0 ? <Badge variant="secondary">{notes.draft.length}/10</Badge> : undefined}
                >
                    <ProductNotesSection value={notes.draft} onChange={notes.setDraft} disabled={notes.isSaving} />
                </Card>
            )}

            {draft.showPairings && (
                <Card
                    title="Abbinamenti"
                    subtitle="Compaiono al cliente come «Perfetto con» nel dettaglio."
                    badge={countBadge(pairings.draft.length)}
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
                </Card>
            )}

            {!isBaseProduct && (
                <Text variant="body-sm" colorVariant="muted">
                    Caratteristiche, note e abbinamenti esistono solo sul {verticalConfig.productLabel.toLowerCase()} base:
                    una variante eredita quelli del padre.
                </Text>
            )}

            <ProductAllergensDrawer
                open={isAllergensDrawerOpen}
                onClose={() => setIsAllergensDrawerOpen(false)}
                title={allergenLabel}
                available={allergens.available}
                loading={allergens.loading}
                value={allergens.draftIds}
                onConfirm={allergens.setDraftIds}
            />

            <ProductIngredientsDrawer
                open={isIngredientsDrawerOpen}
                onClose={() => setIsIngredientsDrawerOpen(false)}
                title={ingredientLabel}
                available={ingredients.available}
                loading={ingredients.loading}
                value={ingredients.draftIds}
                onApply={ingredients.reorder}
                onCreate={ingredients.handleCreate}
            />

            <ProductCharacteristicsDrawer
                open={isCharacteristicsDrawerOpen}
                onClose={() => setIsCharacteristicsDrawerOpen(false)}
                vertical={vertical}
                value={characteristics.draftIds}
                onConfirm={characteristics.setDraftIds}
            />
        </div>
    );
}

export default SchedaTab;
