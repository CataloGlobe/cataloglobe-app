import { useEffect, useMemo } from "react";
import { TextInput } from "@/components/ui/Input/TextInput";
import { ImageUploadField } from "@/components/ui/ImageUploadField/ImageUploadField";
import { StoryImageBlock } from "@/services/supabase/stories";
import styles from "./ImageBlock.module.scss";

/**
 * Blocco immagine — presentazionale/controlled. Nessun upload/delete qui:
 * il file selezionato è PENDENTE (posseduto dal parent StoryDetailPage) e
 * viene caricato solo al Salva; la rimozione svuota `block.url` nel draft
 * (delete storage differita al Salva via cleanup orfani).
 */
interface ImageBlockProps {
    block: StoryImageBlock;
    /** File pendente per questo blocco (posseduto dal parent). */
    pendingFile: File | null;
    onPendingFileChange: (file: File | null) => void;
    onChange: (next: StoryImageBlock) => void;
    disabled?: boolean;
}

export function ImageBlock({ block, pendingFile, onPendingFileChange, onChange, disabled }: ImageBlockProps) {
    // objectURL del file pendente — posseduto qui, revocato su cambio/unmount.
    const pendingPreview = useMemo(
        () => (pendingFile ? URL.createObjectURL(pendingFile) : null),
        [pendingFile]
    );

    useEffect(() => {
        return () => {
            if (pendingPreview) URL.revokeObjectURL(pendingPreview);
        };
    }, [pendingPreview]);

    const imageUrl = pendingPreview ?? (block.url || null);

    const handleRemove = () => {
        onPendingFileChange(null);
        if (block.url) {
            // Rimozione pendente: svuota l'URL nel draft. Il file resta in
            // storage finché il Salva non persiste (poi cleanup orfani).
            onChange({ ...block, url: "" });
        }
    };

    return (
        <div className={styles.root}>
            <ImageUploadField
                label="Immagine"
                imageUrl={imageUrl}
                pendingFile={pendingFile}
                onFileChange={onPendingFileChange}
                onRemove={handleRemove}
                thumbShape="square"
                accept="image/*"
                maxSizeMb={5}
                disabled={disabled}
            />
            <TextInput
                label="Didascalia (opzionale)"
                value={block.caption ?? ""}
                onChange={e => onChange({ ...block, caption: e.target.value })}
                disabled={disabled}
            />
        </div>
    );
}
