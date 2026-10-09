import { useRef } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button/Button";
import { IconButton } from "@/components/ui/Button/IconButton";
import { TextInput } from "@/components/ui/Input/TextInput";
import { Textarea } from "@/components/ui/Textarea/Textarea";
import { Chip } from "@/components/ui/Chip/Chip";
import { Card } from "@/components/ui/Card/Card";
import { EmptyState } from "@/components/ui/EmptyState/EmptyState";
import { ImageUploadEditor, type ImageUploadEditorControl } from "@/components/ui/ImageUploadEditor";
import AllergenIcon from "@/components/ui/AllergenIcon/AllergenIcon";
import Text from "@/components/ui/Text/Text";
import { useVerticalConfig } from "@/hooks/useVerticalConfig";
import { useBusinessOutletContext } from "@/layouts/MainLayout/outletContext";
import type { V2Product } from "@/services/supabase/products";
import type { SchedaDraft } from "./hooks/useSchedaDraft";
import { useAiDescription } from "./hooks/useAiDescription";
import { AiDescriptionField } from "./components/AiDescriptionField";
import { DescriptionTranslationRow } from "./components/DescriptionTranslationRow";
import { IngredientCombobox } from "./components/IngredientCombobox";
import styles from "./ProductPage.module.scss";

interface ProductEssenzialeProps {
    product: V2Product;
    productId: string;
    tenantId: string;
    draft: SchedaDraft;
    canWrite: boolean;
    /** Il riquadro del prezzo: la card «Prezzo» di Prezzi & Opzioni, così com'è. */
    price: React.ReactNode;
    /** Apre al centro una vista larga (es. le traduzioni). */
    onOpen: (view: "traduzioni") => void;
}

/**
 * «L'essenziale» della pagina del prodotto (Officina 3, lavoro 4 del
 * prototipo): il piatto, il prezzo, gli allergeni, gli ingredienti. Campi
 * corti dentro il riquadro, niente drawer: allergeni e ingredienti si
 * scelgono qui, nella bozza della pagina.
 */
export function ProductEssenziale({ product, productId, tenantId, draft, canWrite, price, onOpen }: ProductEssenzialeProps) {
    const verticalConfig = useVerticalConfig();
    const isBaseProduct = product.parent_product_id === null;
    const { image, information, allergens, ingredients } = draft;

    const businessOutlet = useBusinessOutletContext();
    const ai = useAiDescription({
        name: information.draftName,
        tenantId,
        onDescriptionGenerated: information.setDraftDescription,
        onConsumed: businessOutlet?.refreshAiUsage
    });

    const imageEditor = useRef<ImageUploadEditorControl>(null);
    const hasImage = !image.removeImage && Boolean(image.visibleImageUrl);

    const allergenLabel = verticalConfig.copy.productSections.allergens;
    const ingredientLabel = verticalConfig.copy.productSections.ingredients;
    const productLower = verticalConfig.productLabel.toLowerCase();

    return (
        <div className={styles.boxes}>
            <Card title={verticalConfig.productLabel} className={styles.span2}>
                <div className={styles.dish}>
                    <div className={styles.media}>
                        {/* 4:3 come le card e il dettaglio pubblici (vedi SchedaTab di prima). */}
                        <ImageUploadEditor
                            aspectRatio={4 / 3}
                            backgroundFillModes={["blur", "dominant", "color", "none"]}
                            maxSizeMB={10}
                            compressLongEdge={1280}
                            hideHeader
                            controlRef={imageEditor}
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
                            removing={image.isSaving}
                        />
                        {hasImage && (
                            <div className={styles.row}>
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => imageEditor.current?.open()}
                                    disabled={image.isSaving}
                                >
                                    Inquadra
                                </Button>
                                <IconButton
                                    icon={<Trash2 size={16} />}
                                    aria-label="Rimuovi immagine"
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => {
                                        image.setRemoveImage(true);
                                        image.setPendingImageFile(null);
                                    }}
                                    disabled={image.isSaving}
                                />
                            </div>
                        )}
                        {image.removeImage && (
                            <Text variant="caption" colorVariant="muted">
                                Si toglie quando salvi.
                            </Text>
                        )}
                    </div>

                    <div className={styles.fields}>
                        <TextInput
                            label="Nome"
                            value={information.draftName}
                            onChange={e => information.setDraftName(e.target.value)}
                            disabled={information.isSaving}
                            required
                        />
                        <AiDescriptionField
                            aiState={ai.aiState}
                            isGenerating={ai.isGenerating}
                            canGenerate={ai.canGenerate}
                            onGenerate={ai.generate}
                            quota={businessOutlet?.aiUsage}
                            readOnly={!canWrite}
                        >
                            <Textarea
                                value={information.draftDescription}
                                onChange={e => {
                                    information.setDraftDescription(e.target.value);
                                    ai.markManualEdit();
                                }}
                                disabled={information.isSaving || ai.isGenerating}
                                rows={3}
                                placeholder="Cosa c'è, come è fatto, perché ordinarlo."
                            />
                        </AiDescriptionField>
                        {isBaseProduct && product.description ? (
                            <DescriptionTranslationRow
                                tenantId={tenantId}
                                productId={productId}
                                refreshKey={`${productId}:${product.description ?? ""}`}
                                onOpenTranslations={() => onOpen("traduzioni")}
                            />
                        ) : (
                            !isBaseProduct && (
                                <Text variant="caption" colorVariant="muted">
                                    Traduzioni: quelle del {productLower} da cui viene.
                                </Text>
                            )
                        )}
                    </div>
                </div>
            </Card>

            <div className={styles.cell}>{price}</div>

            {draft.showAllergens && (
                <Card title={allergenLabel} className={styles.span2}>
                    {allergens.loading ? (
                        <Text variant="body-sm" colorVariant="muted">
                            Caricamento allergeni...
                        </Text>
                    ) : (
                        <div className={styles.stackSm}>
                            <div className={styles.chips}>
                                {allergens.available.map(a => (
                                    <Chip
                                        key={a.id}
                                        label={a.label_it}
                                        icon={<AllergenIcon code={a.code} size={16} variant="bare" />}
                                        selected={allergens.draftIds.includes(a.id)}
                                        onClick={() => allergens.toggle(a.id)}
                                    />
                                ))}
                            </div>
                            <Text variant="caption" colorVariant="muted">
                                {allergens.draftIds.length > 0
                                    ? `${allergens.draftIds.length} dichiarati: tocca per aggiungere o togliere.`
                                    : "Nessuno dichiarato: tocca per aggiungere."}
                            </Text>
                        </div>
                    )}
                </Card>
            )}

            {draft.showIngredients && (
                <Card title={ingredientLabel}>
                    <IngredientCombobox
                        ingredients={ingredients.available}
                        selectedIds={ingredients.draftIds}
                        onToggle={ingredients.toggle}
                        onReorder={ingredients.reorder}
                        onCreate={ingredients.handleCreate}
                        isLoadingIngredients={ingredients.loading}
                    />
                </Card>
            )}

            {/* Il verticale spegne allergeni e ingredienti: lo si dice (§25.4). */}
            {!draft.showAllergens && !draft.showIngredients && (
                <Card className={styles.span2}>
                    <EmptyState
                        variant="inline"
                        icon={null}
                        title={`${allergenLabel} e ${ingredientLabel.toLowerCase()} non si usano qui`}
                        description={`Per questo tipo di attività i ${verticalConfig.productLabelPlural.toLowerCase()} non li dichiarano.`}
                    />
                </Card>
            )}
        </div>
    );
}
