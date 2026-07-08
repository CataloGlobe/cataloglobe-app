import { useEffect, useState } from "react";
import { TextInput } from "@/components/ui/Input/TextInput";
import { FileInput } from "@/components/ui/Input/FileInput";
import { Select } from "@/components/ui/Select/Select";
import Text from "@/components/ui/Text/Text";
import { useToast } from "@/context/Toast/ToastContext";
import { updateStory, StoryBlock, StoryStatus, StoryWithProduct } from "@/services/supabase/stories";
import { uploadStoryImage } from "@/services/supabase/upload";
import { compressImage, COMPRESS_PROFILES } from "@/utils/compressImage";
import { StoryProductPicker } from "./StoryProductPicker";
import styles from "../Stories.module.scss";

export interface StoryFormProps {
    storyData: StoryWithProduct;
    tenantId: string;
    canWrite: boolean;
    /** Blocks state is owned by the parent (StoryDetailPage) so the single
     *  Salva button here persists meta + body_blocks together in one call. */
    blocks: StoryBlock[];
    onSuccess: () => void | Promise<void>;
    onSavingChange?: (isSaving: boolean) => void;
    formId: string;
}

const STATUS_OPTIONS: { value: StoryStatus; label: string }[] = [
    { value: "draft", label: "Bozza" },
    { value: "published", label: "Pubblicata" }
];

export function StoryForm({
    storyData,
    tenantId,
    canWrite,
    blocks,
    onSuccess,
    onSavingChange,
    formId
}: StoryFormProps) {
    const { showToast } = useToast();

    const [isSaving, setIsSaving] = useState(false);
    const [eyebrow, setEyebrow] = useState("");
    const [title, setTitle] = useState("");
    const [status, setStatus] = useState<StoryStatus>("draft");
    const [productId, setProductId] = useState<string | null>(null);
    const [pendingCoverFile, setPendingCoverFile] = useState<File | null>(null);
    const [coverPreview, setCoverPreview] = useState<string | null>(null);

    useEffect(() => {
        onSavingChange?.(isSaving);
    }, [isSaving, onSavingChange]);

    useEffect(() => {
        setIsSaving(false);
        setPendingCoverFile(null);
        setCoverPreview(null);
        setEyebrow(storyData.eyebrow ?? "");
        setTitle(storyData.title);
        setStatus(storyData.status);
        setProductId(storyData.product_id);
    }, [storyData]);

    const handleCoverFileChange = (file: File | null) => {
        setPendingCoverFile(file);
        setCoverPreview(file ? URL.createObjectURL(file) : null);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (isSaving) return;

        const trimmedTitle = title.trim();
        if (!trimmedTitle) {
            showToast({ message: "Il titolo della storia è obbligatorio.", type: "error" });
            return;
        }

        setIsSaving(true);
        try {
            let coverMedia = storyData.cover_media;
            if (pendingCoverFile) {
                coverMedia = await uploadStoryImage(
                    tenantId,
                    storyData.id,
                    await compressImage(pendingCoverFile, COMPRESS_PROFILES.cover)
                );
            }
            await updateStory(storyData.id, tenantId, {
                eyebrow: eyebrow.trim() || null,
                title: trimmedTitle,
                product_id: productId,
                status,
                cover_media: coverMedia,
                body_blocks: blocks
            });
            setPendingCoverFile(null);
            showToast({ message: "Storia aggiornata.", type: "success" });
            await Promise.resolve(onSuccess());
        } catch (error) {
            console.error("Errore salvataggio storia:", error);
            const message = error instanceof Error && error.message ? error.message : "Impossibile salvare la storia.";
            showToast({ message, type: "error" });
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <form id={formId} className={styles.form} onSubmit={handleSubmit}>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <TextInput
                    label="Occhiello"
                    value={eyebrow}
                    onChange={e => setEyebrow(e.target.value)}
                    placeholder="Es: Dietro le quinte"
                    disabled={!canWrite}
                />
                <TextInput
                    label="Titolo"
                    required
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    placeholder="Es: La storia della nostra pasta fresca"
                    disabled={!canWrite}
                />
                {(coverPreview ?? storyData.cover_media) && (
                    <img
                        src={coverPreview ?? storyData.cover_media ?? ""}
                        alt="Copertina storia"
                        className={styles.brandCoverPreview}
                    />
                )}
                <FileInput
                    label={storyData.cover_media || pendingCoverFile ? "Sostituisci copertina" : "Copertina"}
                    accept="image/*"
                    maxSizeMb={5}
                    preview="none"
                    onChange={handleCoverFileChange}
                    disabled={!canWrite}
                />
                <Select
                    label="Stato"
                    value={status}
                    onChange={e => setStatus(e.target.value as StoryStatus)}
                    options={STATUS_OPTIONS}
                    disabled={!canWrite}
                />
            </div>

            <div className={styles.pickerField}>
                <Text variant="title-sm" weight={600}>
                    Prodotto collegato (opzionale)
                </Text>
                <StoryProductPicker
                    tenantId={tenantId}
                    value={productId}
                    onChange={setProductId}
                    disabled={!canWrite}
                />
            </div>
        </form>
    );
}
