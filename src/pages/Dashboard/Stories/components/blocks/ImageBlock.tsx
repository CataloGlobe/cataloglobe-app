import { useState } from "react";
import { FileInput } from "@/components/ui/Input/FileInput";
import { TextInput } from "@/components/ui/Input/TextInput";
import { useToast } from "@/context/Toast/ToastContext";
import { StoryImageBlock } from "@/services/supabase/stories";
import { uploadStoryImage, deleteStoryImageBestEffort } from "@/services/supabase/upload";
import { compressImage, COMPRESS_PROFILES } from "@/utils/compressImage";
import styles from "./ImageBlock.module.scss";

interface ImageBlockProps {
    block: StoryImageBlock;
    tenantId: string;
    storyId: string;
    onChange: (next: StoryImageBlock) => void;
    disabled?: boolean;
}

export function ImageBlock({ block, tenantId, storyId, onChange, disabled }: ImageBlockProps) {
    const { showToast } = useToast();
    const [isUploading, setIsUploading] = useState(false);

    const handleFile = async (file: File | null) => {
        if (!file) return;
        setIsUploading(true);
        try {
            const previousUrl = block.url;
            const url = await uploadStoryImage(
                tenantId,
                `${storyId}/${block.id}`,
                await compressImage(file, COMPRESS_PROFILES.cover)
            );
            if (previousUrl) {
                try {
                    await deleteStoryImageBestEffort(tenantId, `${storyId}/${block.id}`, previousUrl);
                } catch (err) {
                    console.warn("[storage] block image replace cleanup failed:", err);
                }
            }
            onChange({ ...block, url });
        } catch (error) {
            console.error("Errore upload immagine blocco:", error);
            showToast({ message: "Impossibile caricare l'immagine.", type: "error" });
        } finally {
            setIsUploading(false);
        }
    };

    return (
        <div className={styles.root}>
            {block.url && (
                <img src={block.url} alt={block.caption ?? ""} className={styles.preview} />
            )}
            <FileInput
                label={block.url ? "Sostituisci immagine" : "Immagine"}
                accept="image/*"
                maxSizeMb={5}
                preview="none"
                onChange={handleFile}
                disabled={disabled || isUploading}
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
