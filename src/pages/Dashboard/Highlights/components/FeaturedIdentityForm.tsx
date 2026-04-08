import React, { useState, useEffect } from "react";
import { TextInput } from "@/components/ui/Input/TextInput";
import { Textarea } from "@/components/ui/Textarea/Textarea";
import {
    updateFeaturedContent,
    type FeaturedContent
} from "@/services/supabase/featuredContents";
import { useToast } from "@/context/Toast/ToastContext";

type Props = {
    formId: string;
    entityData: FeaturedContent;
    tenantId: string;
    onSuccess: () => void;
    onSavingChange: (saving: boolean) => void;
};

export function FeaturedIdentityForm({
    formId,
    entityData,
    tenantId,
    onSuccess,
    onSavingChange
}: Props) {
    const { showToast } = useToast();
    const [title, setTitle] = useState(entityData.title);
    const [internalName, setInternalName] = useState(entityData.internal_name);
    const [subtitle, setSubtitle] = useState(entityData.subtitle ?? "");
    const [description, setDescription] = useState(entityData.description ?? "");

    useEffect(() => {
        setTitle(entityData.title);
        setInternalName(entityData.internal_name);
        setSubtitle(entityData.subtitle ?? "");
        setDescription(entityData.description ?? "");
    }, [entityData]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const trimmedTitle = title.trim();
        if (!trimmedTitle) {
            showToast({ message: "Il titolo è obbligatorio.", type: "error" });
            return;
        }
        onSavingChange(true);
        try {
            await updateFeaturedContent(entityData.id, tenantId, {
                title: trimmedTitle,
                internal_name: internalName.trim() || trimmedTitle,
                subtitle: subtitle.trim() || null,
                description: description.trim() || null
            });
            showToast({ message: "Identità aggiornata.", type: "success" });
            onSuccess();
        } catch (error: unknown) {
            console.error("Errore salvataggio identità:", error);
            showToast({
                message:
                    error instanceof Error
                        ? error.message
                        : "Errore durante il salvataggio.",
                type: "error"
            });
        } finally {
            onSavingChange(false);
        }
    };

    return (
        <form id={formId} onSubmit={handleSubmit}>
            <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
                <TextInput
                    label="Titolo pubblico *"
                    required
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    placeholder="Es: Promozione speciale"
                />
                <TextInput
                    label="Nome interno *"
                    value={internalName}
                    onChange={e => setInternalName(e.target.value)}
                    placeholder="Es: Promo Roma - Aprile"
                />
                <TextInput
                    label="Sottotitolo"
                    value={subtitle}
                    onChange={e => setSubtitle(e.target.value)}
                    placeholder="Sottotitolo opzionale"
                />
                <Textarea
                    label="Descrizione"
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    placeholder="Testo descrittivo del contenuto"
                    rows={3}
                />
            </div>
        </form>
    );
}
