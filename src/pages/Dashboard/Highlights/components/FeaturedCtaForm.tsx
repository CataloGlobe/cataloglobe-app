// src/pages/Dashboard/Highlights/components/FeaturedCtaForm.tsx
import React, { useState, useEffect, useMemo } from "react";
import { TextInput } from "@/components/ui/Input/TextInput";
import {
    updateFeaturedContent,
    type FeaturedContent
} from "@/services/supabase/featuredContents";
import { useToast } from "@/context/Toast/ToastContext";
import styles from "./FeaturedCtaForm.module.scss";

type Props = {
    formId: string;
    entityData: FeaturedContent;
    tenantId: string;
    onSuccess: () => void;
    onSavingChange: (saving: boolean) => void;
};

export function FeaturedCtaForm({
    formId,
    entityData,
    tenantId,
    onSuccess,
    onSavingChange
}: Props) {
    const { showToast } = useToast();
    const [ctaText, setCtaText] = useState(entityData.cta_text ?? "");
    const [ctaUrl, setCtaUrl] = useState(entityData.cta_url ?? "");

    useEffect(() => {
        setCtaText(entityData.cta_text ?? "");
        setCtaUrl(entityData.cta_url ?? "");
    }, [entityData]);

    const urlError = useMemo(() => {
        const trimmed = ctaUrl.trim();
        if (trimmed && !trimmed.startsWith("https://")) {
            return "Il link deve iniziare con https://";
        }
        return undefined;
    }, [ctaUrl]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (urlError) {
            showToast({ message: urlError, type: "error" });
            return;
        }
        onSavingChange(true);
        try {
            await updateFeaturedContent(entityData.id, tenantId, {
                cta_text: ctaText.trim() || null,
                cta_url: ctaUrl.trim() || null
            });
            showToast({ message: "Call to Action aggiornata.", type: "success" });
            onSuccess();
        } catch (err) {
            console.error(err);
            showToast({ message: "Errore durante il salvataggio.", type: "error" });
        } finally {
            onSavingChange(false);
        }
    };

    return (
        <form id={formId} onSubmit={handleSubmit}>
            <div className={styles.formFields}>
                <TextInput
                    label="Testo pulsante"
                    value={ctaText}
                    onChange={e => setCtaText(e.target.value)}
                    placeholder="Es: Scopri di più"
                />
                <TextInput
                    label="Link pulsante"
                    value={ctaUrl}
                    onChange={e => setCtaUrl(e.target.value)}
                    placeholder="https://..."
                    error={urlError}
                />
            </div>
        </form>
    );
}
