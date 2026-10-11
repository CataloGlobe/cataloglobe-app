import { useRef } from "react";
import { ArrowUpRight, Link2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button/Button";
import { IconButton } from "@/components/ui/Button/IconButton";
import { TextInput } from "@/components/ui/Input/TextInput";
import { Textarea } from "@/components/ui/Textarea/Textarea";
import { Chip } from "@/components/ui/Chip/Chip";
import { ImageUploadEditor, type ImageUploadEditorControl } from "@/components/ui/ImageUploadEditor";
import AllergenIcon from "@/components/ui/AllergenIcon/AllergenIcon";
import Text from "@/components/ui/Text/Text";
import { useBusinessOutletContext } from "@/layouts/MainLayout/outletContext";
import type { SchedaDraft } from "../hooks/useSchedaDraft";
import { useAiDescription } from "../hooks/useAiDescription";
import { AiDescriptionField } from "../components/AiDescriptionField";
import { DescriptionTranslationRow } from "../components/DescriptionTranslationRow";
import { IngredientCombobox } from "../components/IngredientCombobox";
import ProductNotesSection from "../components/ProductNotesSection/ProductNotesSection";
import { DESCRIPTION_FIELD_ID, joinNames } from "./prodottoModel";
import styles from "./Prodotto.module.scss";

interface PiattoEditorProps {
    draft: SchedaDraft;
    tenantId: string;
    productId: string;
    /** La descrizione salvata (per la riga delle traduzioni). */
    savedDescription: string | null;
    isVariant: boolean;
    productLower: string;
    canWrite: boolean;
    onOpenTranslations: () => void;
}

/** Il piatto a fuoco: la foto a sinistra (4:3 come nel menù), nome e descrizione a destra. */
export function PiattoEditor({
    draft,
    tenantId,
    productId,
    savedDescription,
    isVariant,
    productLower,
    canWrite,
    onOpenTranslations
}: PiattoEditorProps) {
    const { image, information } = draft;
    const businessOutlet = useBusinessOutletContext();
    const ai = useAiDescription({
        name: information.draftName,
        tenantId,
        onDescriptionGenerated: information.setDraftDescription,
        onConsumed: businessOutlet?.refreshAiUsage
    });
    const imageEditor = useRef<ImageUploadEditorControl>(null);
    const hasImage = !image.removeImage && Boolean(image.visibleImageUrl);

    return (
        <div className={styles.dish}>
            <div className={styles.stack}>
                {/* 4:3 come le card e il dettaglio pubblici. */}
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
                        Si toglie quando salvate.
                    </Text>
                )}
            </div>

            <div className={styles.stack}>
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
                        id={DESCRIPTION_FIELD_ID}
                        aria-label="Descrizione"
                        value={information.draftDescription}
                        onChange={e => {
                            information.setDraftDescription(e.target.value);
                            ai.markManualEdit();
                        }}
                        disabled={information.isSaving || ai.isGenerating}
                        rows={4}
                        placeholder="Cosa c'è, come è fatto, perché ordinarlo."
                    />
                </AiDescriptionField>
                {!isVariant && savedDescription ? (
                    <DescriptionTranslationRow
                        tenantId={tenantId}
                        productId={productId}
                        refreshKey={`${productId}:${savedDescription}`}
                        onOpenTranslations={onOpenTranslations}
                    />
                ) : isVariant ? (
                    <Text variant="caption" colorVariant="muted">
                        Traduzioni: quelle del {productLower} da cui viene.
                    </Text>
                ) : (
                    <Text variant="caption" colorVariant="muted">
                        Due righe bastano. Le traduzioni si fanno quando salvate.
                    </Text>
                )}
            </div>
        </div>
    );
}

/** Gli allergeni a fuoco: la frase «Contiene: …» e i bollini da toccare (D121 2A). */
export function AllergeniEditor({ draft }: { draft: SchedaDraft }) {
    const { allergens } = draft;
    if (allergens.loading) {
        return (
            <Text variant="body-sm" colorVariant="muted">
                Caricamento allergeni...
            </Text>
        );
    }
    const selected = allergens.available.filter(a => allergens.draftIds.includes(a.id));
    return (
        <>
            <p className={styles.contains}>
                {selected.length > 0 ? (
                    <>
                        <b>Contiene:</b> {joinNames(selected.map(a => a.label_it.toLowerCase()))}.
                    </>
                ) : (
                    <span className={styles.hint}>Nessuno segnato. Toccate quelli che contiene.</span>
                )}
            </p>
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
        </>
    );
}

/** Gli ingredienti a fuoco: la combobox di sempre, in bozza. */
export function IngredientiEditor({ draft }: { draft: SchedaDraft }) {
    const { ingredients } = draft;
    return (
        <IngredientCombobox
            ingredients={ingredients.available}
            selectedIds={ingredients.draftIds}
            onToggle={ingredients.toggle}
            onReorder={ingredients.reorder}
            onCreate={ingredients.handleCreate}
            isLoadingIngredients={ingredients.loading}
        />
    );
}

/** Le note a fuoco, in bozza. */
export function NoteEditor({ draft }: { draft: SchedaDraft }) {
    const { notes } = draft;
    return <ProductNotesSection value={notes.draft} onChange={notes.setDraft} disabled={notes.isSaving} />;
}

/** Una parte che la variante prende dal prodotto da cui viene. */
export function InheritedEditor({ parentName, onOpenParent }: { parentName: string; onOpenParent: () => void }) {
    return (
        <>
            <div className={styles.callout}>
                <Link2 size={16} strokeWidth={1.75} aria-hidden />
                <span>
                    Questa parte la prende da <b>{parentName}</b>. Per cambiarla, aprite {parentName}: cambia per tutte e due.
                </span>
            </div>
            <div>
                <Button
                    variant="secondary"
                    size="sm"
                    leftIcon={<ArrowUpRight size={14} strokeWidth={1.75} aria-hidden />}
                    onClick={onOpenParent}
                >
                    Apri {parentName}
                </Button>
            </div>
        </>
    );
}
