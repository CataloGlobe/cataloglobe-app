import { useEffect, useRef, useState } from "react";
import { TextInput } from "@/components/ui/Input/TextInput";
import { FileInput } from "@/components/ui/Input/FileInput";
import { Select } from "@/components/ui/Select/Select";
import Text from "@/components/ui/Text/Text";
import { useToast } from "@/context/Toast/ToastContext";
import {
    createStory,
    updateStory,
    StoryStatus,
    StoryWithProduct
} from "@/services/supabase/stories";
import { uploadStoryImage } from "@/services/supabase/upload";
import { compressImage, COMPRESS_PROFILES } from "@/utils/compressImage";
import ProductPickerList from "@/pages/Dashboard/Highlights/ProductPickerList";
import styles from "../Stories.module.scss";
import type { StoryFormMode } from "../StoryCreateEditDrawer";

export interface StoryFormProps {
    mode: StoryFormMode;
    storyData?: StoryWithProduct | null;
    tenantId: string | null;
    onSuccess: () => void | Promise<void>;
    onSavingChange?: (isSaving: boolean) => void;
    formId?: string;
}

const STATUS_OPTIONS: { value: StoryStatus; label: string }[] = [
    { value: "draft", label: "Bozza" },
    { value: "published", label: "Pubblicata" }
];

export function StoryForm({
    mode,
    storyData,
    tenantId,
    onSuccess,
    onSavingChange,
    formId = "story-form"
}: StoryFormProps) {
    const { showToast } = useToast();
    const isEditing = mode === "edit";
    const titleInputRef = useRef<HTMLInputElement>(null);

    const [isSaving, setIsSaving] = useState(false);
    const [eyebrow, setEyebrow] = useState("");
    const [title, setTitle] = useState("");
    const [status, setStatus] = useState<StoryStatus>("draft");
    const [productId, setProductId] = useState<string | null>(null);
    const [pendingCoverFile, setPendingCoverFile] = useState<File | null>(null);

    useEffect(() => {
        onSavingChange?.(isSaving);
    }, [isSaving, onSavingChange]);

    useEffect(() => {
        if (!isEditing) {
            const timer = setTimeout(() => titleInputRef.current?.focus(), 80);
            return () => clearTimeout(timer);
        }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        setIsSaving(false);
        setPendingCoverFile(null);

        if (isEditing && storyData) {
            setEyebrow(storyData.eyebrow ?? "");
            setTitle(storyData.title);
            setStatus(storyData.status);
            setProductId(storyData.product_id);
        } else {
            setEyebrow("");
            setTitle("");
            setStatus("draft");
            setProductId(null);
        }
    }, [isEditing, storyData]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (isSaving) return;

        const trimmedTitle = title.trim();
        if (!trimmedTitle) {
            showToast({ message: "Il titolo della storia è obbligatorio.", type: "error" });
            return;
        }
        if (!tenantId) {
            showToast({ message: "Tenant mancante.", type: "error" });
            return;
        }

        setIsSaving(true);
        try {
            const metadata = {
                eyebrow: eyebrow.trim() || null,
                title: trimmedTitle,
                product_id: productId,
                status
            };

            if (isEditing && storyData) {
                let coverMedia = storyData.cover_media;
                if (pendingCoverFile) {
                    coverMedia = await uploadStoryImage(
                        tenantId,
                        storyData.id,
                        await compressImage(pendingCoverFile, COMPRESS_PROFILES.cover)
                    );
                }
                await updateStory(storyData.id, tenantId, { ...metadata, cover_media: coverMedia });
                showToast({ message: "Storia aggiornata.", type: "success" });
            } else {
                const created = await createStory(tenantId, { ...metadata, cover_media: null });
                if (pendingCoverFile) {
                    const coverMedia = await uploadStoryImage(
                        tenantId,
                        created.id,
                        await compressImage(pendingCoverFile, COMPRESS_PROFILES.cover)
                    );
                    await updateStory(created.id, tenantId, { cover_media: coverMedia });
                }
                showToast({ message: "Storia creata.", type: "success" });
            }

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
                />
                <TextInput
                    ref={titleInputRef}
                    label="Titolo"
                    required
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    placeholder="Es: La storia della nostra pasta fresca"
                />
                <FileInput
                    label="Copertina"
                    accept="image/*"
                    maxSizeMb={5}
                    preview="auto"
                    value={pendingCoverFile}
                    onChange={setPendingCoverFile}
                />
                <Select
                    label="Stato"
                    value={status}
                    onChange={e => setStatus(e.target.value as StoryStatus)}
                    options={STATUS_OPTIONS}
                />
            </div>

            <div className={styles.pickerField}>
                <Text variant="title-sm" weight={600}>
                    Prodotto collegato (opzionale)
                </Text>
                <ProductPickerList
                    selectedProductIds={productId ? [productId] : []}
                    onSelectionChange={ids => setProductId(ids.length > 0 ? ids[ids.length - 1] : null)}
                />
            </div>
        </form>
    );
}
