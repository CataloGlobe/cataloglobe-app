import { TextInput } from "@/components/ui/Input/TextInput";
import { FileInput } from "@/components/ui/Input/FileInput";
import { InputBase } from "@/components/ui/Input/InputBase";
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
    /** Copertina già salvata (URL) — mostrata finché non c'è un file pendente. */
    savedCover: string | null;
    /** objectURL del file copertina pendente (posseduto dal parent). */
    coverPreview: string | null;
    onCoverFileChange: (file: File | null) => void;
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
    savedCover,
    coverPreview,
    onCoverFileChange,
    tenantId,
    canWrite
}: StoryFormProps) {
    const previewSrc = coverPreview ?? savedCover;
    const hasCover = Boolean(coverPreview ?? savedCover);

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
                {previewSrc && (
                    <img src={previewSrc} alt="Copertina storia" className={styles.brandCoverPreview} />
                )}
                <FileInput
                    label={hasCover ? "Sostituisci copertina" : "Copertina"}
                    accept="image/*"
                    maxSizeMb={5}
                    preview="none"
                    onChange={onCoverFileChange}
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
