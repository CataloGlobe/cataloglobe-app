import { useEffect, useState } from "react";
import Text from "@/components/ui/Text/Text";
import { TextInput } from "@/components/ui/Input/TextInput";
import { Textarea } from "@/components/ui/Textarea/Textarea";
import { FileInput } from "@/components/ui/Input/FileInput";
import { Button } from "@/components/ui/Button/Button";
import { useToast } from "@/context/Toast/ToastContext";
import {
    getTenantStorySettings,
    updateTenantStorySettings,
    TenantStorySettings
} from "@/services/supabase/tenants";
import { uploadStoryImage } from "@/services/supabase/upload";
import { compressImage, COMPRESS_PROFILES } from "@/utils/compressImage";
import styles from "../Stories.module.scss";

interface StoryBrandPanelProps {
    tenantId: string;
    canWrite: boolean;
}

export function StoryBrandPanel({ tenantId, canWrite }: StoryBrandPanelProps) {
    const { showToast } = useToast();
    const [settings, setSettings] = useState<TenantStorySettings | null>(null);
    const [coverFile, setCoverFile] = useState<File | null>(null);
    const [coverPreview, setCoverPreview] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        let cancelled = false;
        getTenantStorySettings(tenantId)
            .then(data => {
                if (!cancelled) setSettings(data);
            })
            .catch(err => console.error("[StoryBrandPanel] fetch failed:", err));
        return () => {
            cancelled = true;
        };
    }, [tenantId]);

    const handleCoverFileChange = (file: File | null) => {
        setCoverFile(file);
        setCoverPreview(file ? URL.createObjectURL(file) : null);
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!settings) return;

        setIsSaving(true);
        try {
            let storyCover = settings.story_cover;
            if (coverFile) {
                storyCover = await uploadStoryImage(
                    tenantId,
                    "brand-cover",
                    await compressImage(coverFile, COMPRESS_PROFILES.cover)
                );
            }
            const next: TenantStorySettings = { ...settings, story_cover: storyCover };
            await updateTenantStorySettings(tenantId, next);
            setSettings(next);
            setCoverFile(null);
            setCoverPreview(null);
            showToast({ message: "Storia del brand aggiornata.", type: "success" });
        } catch (err) {
            const message = err instanceof Error ? err.message : "Errore durante il salvataggio. Riprova.";
            showToast({ message, type: "error" });
        } finally {
            setIsSaving(false);
        }
    };

    if (!settings) return null;

    return (
        <div className={styles.brandPanel}>
            <Text variant="title-sm" weight={600}>
                Storia del brand
            </Text>

            <form id="story-brand-form" onSubmit={handleSave} className={styles.form}>
                {(coverPreview ?? settings.story_cover) && (
                    <img
                        src={coverPreview ?? settings.story_cover ?? ""}
                        alt="Copertina storia del brand"
                        className={styles.brandCoverPreview}
                    />
                )}

                <FileInput
                    label="Copertina"
                    accept="image/png,image/jpeg,image/webp"
                    helperText="PNG, JPG o WEBP, max 5MB."
                    maxSizeMb={5}
                    onChange={handleCoverFileChange}
                    disabled={!canWrite}
                />

                <TextInput
                    label="Titolo"
                    value={settings.story_title ?? ""}
                    onChange={e => setSettings(prev => (prev ? { ...prev, story_title: e.target.value } : prev))}
                    disabled={!canWrite}
                />

                <Textarea
                    label="Intro"
                    value={settings.story_intro ?? ""}
                    onChange={e => setSettings(prev => (prev ? { ...prev, story_intro: e.target.value } : prev))}
                    rows={4}
                    disabled={!canWrite}
                />

                <TextInput
                    label="Sito web"
                    type="url"
                    value={settings.website ?? ""}
                    onChange={e => setSettings(prev => (prev ? { ...prev, website: e.target.value } : prev))}
                    placeholder="https://..."
                    disabled={!canWrite}
                />
            </form>

            {canWrite && (
                <div className={styles.brandPanelFooter}>
                    <Button type="submit" form="story-brand-form" variant="primary" disabled={isSaving}>
                        {isSaving ? "Salvataggio..." : "Salva modifiche"}
                    </Button>
                </div>
            )}
        </div>
    );
}
