import { TextInput } from "@/components/ui/Input/TextInput";
import { ImageUploadField } from "@/components/ui/ImageUploadField/ImageUploadField";
import styles from "../Stories.module.scss";

/**
 * Form metadati storia — completamente controllato dal parent (StoryDetailPage).
 * Nessuno state interno, nessun salvataggio: il parent possiede `draft`+`saved`,
 * deriva `isDirty` e persiste meta + blocchi in un unico Salva (header). Segue
 * il pattern draft-inline già in produzione (SchedaTab, ActivitySettingsTab).
 * Stato pubblicazione (header pagina) e prodotto collegato (SectionCard propria)
 * vivono fuori da questo form — vedi StoryStatusHeaderControl / StoryProductPicker.
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
    pendingCoverFile,
    onCoverFileChange,
    onCoverRemove,
    canWrite
}: StoryFormProps) {
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
            <ImageUploadField
                label="Copertina"
                imageUrl={coverUrl}
                pendingFile={pendingCoverFile}
                onFileChange={onCoverFileChange}
                onRemove={onCoverRemove}
                thumbShape="wide"
                accept="image/*"
                maxSizeMb={5}
                disabled={!canWrite}
            />
        </div>
    );
}
