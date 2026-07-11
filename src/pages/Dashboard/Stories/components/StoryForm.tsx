import { TextInput } from "@/components/ui/Input/TextInput";
import { InputBase } from "@/components/ui/Input/InputBase";
import { ImageUploadField } from "@/components/ui/ImageUploadField/ImageUploadField";
import { SegmentedControl } from "@/components/ui/SegmentedControl/SegmentedControl";
import Text from "@/components/ui/Text/Text";
import { StoryStatus } from "@/services/supabase/stories";
import { StoryProductPicker } from "./StoryProductPicker";
import styles from "../Stories.module.scss";

/**
 * Form metadati storia — completamente controllato dal parent (StoryDetailPage).
 * Nessuno state interno, nessun salvataggio: il parent possiede `draft`+`saved`,
 * deriva `isDirty` e persiste meta + blocchi in un unico Salva (header). Segue
 * il pattern draft-inline già in produzione (SchedaTab, ActivitySettingsTab).
 */
export interface StoryFormProps {
    eyebrow: string;
    onEyebrowChange: (value: string) => void;
    title: string;
    onTitleChange: (value: string) => void;
    status: StoryStatus;
    onStatusChange: (value: StoryStatus) => void;
    productId: string | null;
    onProductIdChange: (value: string | null) => void;
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
    tenantId: string;
    canWrite: boolean;
}

const STATUS_OPTIONS: { value: StoryStatus; label: string }[] = [
    { value: "draft", label: "Bozza" },
    { value: "published", label: "Pubblicata" }
];

export function StoryForm({
    eyebrow,
    onEyebrowChange,
    title,
    onTitleChange,
    status,
    onStatusChange,
    productId,
    onProductIdChange,
    coverUrl,
    pendingCoverFile,
    onCoverFileChange,
    onCoverRemove,
    tenantId,
    canWrite
}: StoryFormProps) {
    return (
        <div className={styles.form}>
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
                <InputBase label="Stato">
                    {() => (
                        <div className={!canWrite ? styles.readonlyControl : undefined}>
                            <SegmentedControl<StoryStatus>
                                value={status}
                                onChange={onStatusChange}
                                options={STATUS_OPTIONS}
                            />
                        </div>
                    )}
                </InputBase>
            </div>

            <div className={styles.pickerField}>
                <Text variant="title-sm" weight={600}>
                    Prodotto collegato (opzionale)
                </Text>
                <StoryProductPicker
                    tenantId={tenantId}
                    value={productId}
                    onChange={onProductIdChange}
                    disabled={!canWrite}
                />
            </div>
        </div>
    );
}
