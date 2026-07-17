import { TextInput } from "@/components/ui/Input/TextInput";
import Text from "@/components/ui/Text/Text";
import {
    ImageUploadEditor,
    IMAGE_UPLOAD_PRESETS,
    type ImageUploadEditorResult
} from "@/components/ui/ImageUploadEditor";
import styles from "../Stories.module.scss";

/**
 * Form metadati storia — completamente controllato dal parent (StoryDetailPage).
 * Nessuno state interno, nessun salvataggio: il parent possiede `draft`+`saved`,
 * deriva `isDirty` e persiste meta + blocchi in un unico Salva (header). Segue
 * il pattern draft-inline già in produzione (SchedaTab, ActivitySettingsTab).
 * Stato pubblicazione (header pagina) e prodotto collegato (SectionCard propria)
 * vivono fuori da questo form — vedi StoryStatusHeaderControl / StoryProductPicker.
 *
 * La COPERTINA (16:9) usa `ImageUploadEditor` con crop "baked": al Conferma il
 * framing è applicato ai pixel e il file già ritagliato viene passato come file
 * pendente (`onCoverFileChange`). L'upload resta DIFFERITO al Salva (StoryDetailPage
 * non fa eager upload: "esci senza salvare" non tocca lo storage). Distinto dal
 * blocco immagine interno alla storia (`storyBlock`), che usa framing metadata.
 */
export interface StoryFormProps {
    eyebrow: string;
    onEyebrowChange: (value: string) => void;
    title: string;
    onTitleChange: (value: string) => void;
    /**
     * URL copertina da mostrare (objectURL pendente o URL salvato), già
     * risolto dal parent tenendo conto della rimozione pendente. null = vuota.
     */
    coverUrl: string | null;
    /** File copertina pendente (posseduto dal parent) — per nome + size. */
    pendingCoverFile: File | null;
    onCoverFileChange: (file: File) => void;
    /** Marca la rimozione della copertina come modifica pendente nel draft. */
    onCoverRemove: () => void;
    canWrite: boolean;
}

export function StoryForm({
    eyebrow,
    onEyebrowChange,
    title,
    onTitleChange,
    coverUrl,
    onCoverFileChange,
    onCoverRemove,
    canWrite
}: StoryFormProps) {
    const handleCoverConfirm = ({ file }: ImageUploadEditorResult) => {
        if (file) onCoverFileChange(file);
    };

    return (
        <div className={styles.fieldStack}>
            <TextInput
                label="Occhiello"
                value={eyebrow}
                onChange={e => onEyebrowChange(e.target.value)}
                placeholder="Es: Dietro le quinte"
                disabled={!canWrite}
            />
            <TextInput
                label="Titolo"
                required
                value={title}
                onChange={e => onTitleChange(e.target.value)}
                placeholder="Es: La storia della nostra pasta fresca"
                disabled={!canWrite}
            />

            <div className={styles.fieldStack}>
                <Text variant="body-sm" weight={500}>
                    Copertina
                </Text>
                <Text variant="caption" colorVariant="muted">
                    PNG, JPG o WEBP — max 10 MB. Inquadra e ritaglia in formato 16:9.
                </Text>

                {canWrite ? (
                    <>
                        <ImageUploadEditor
                            aspectRatio={IMAGE_UPLOAD_PRESETS.storyCover.aspectRatio}
                            backgroundFillModes={IMAGE_UPLOAD_PRESETS.storyCover.backgroundFillModes}
                            maxSizeMB={IMAGE_UPLOAD_PRESETS.storyCover.maxSizeMB}
                            compressLongEdge={IMAGE_UPLOAD_PRESETS.storyCover.compressLongEdge}
                            bake={{ size: 1280, format: "image/webp", quality: 0.85, fileName: "cover.webp" }}
                            initialSource={coverUrl}
                            onConfirm={handleCoverConfirm}
                        />
                        {coverUrl && (
                            <button
                                type="button"
                                className={styles.coverRemoveBtn}
                                onClick={onCoverRemove}
                            >
                                Rimuovi copertina
                            </button>
                        )}
                    </>
                ) : (
                    coverUrl && (
                        <img
                            src={coverUrl}
                            alt="Copertina storia"
                            className={styles.coverReadonlyPreview}
                        />
                    )
                )}
            </div>
        </div>
    );
}
