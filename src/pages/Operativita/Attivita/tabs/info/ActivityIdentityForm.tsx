import React, { useState, useEffect } from "react";
import { TextInput } from "@/components/ui/Input/TextInput";
import { Textarea } from "@/components/ui/Textarea/Textarea";
import { updateActivity } from "@/services/supabase/activities";
import type { V2Activity } from "@/types/activity";
import { useToast } from "@/context/Toast/ToastContext";

type ActivityIdentityFormProps = {
    formId: string;
    entityData: V2Activity;
    tenantId: string;
    onSuccess: () => void;
    onSavingChange: (saving: boolean) => void;
};

export function ActivityIdentityForm({
    formId,
    entityData,
    tenantId,
    onSuccess,
    onSavingChange
}: ActivityIdentityFormProps) {
    const { showToast } = useToast();
    const [name, setName] = useState(entityData.name);
    const [address, setAddress] = useState(entityData.address ?? "");
    const [city, setCity] = useState(entityData.city ?? "");
    const [description, setDescription] = useState(entityData.description ?? "");

    useEffect(() => {
        setName(entityData.name);
        setAddress(entityData.address ?? "");
        setCity(entityData.city ?? "");
        setDescription(entityData.description ?? "");
    }, [entityData]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        const trimmedName = name.trim();
        if (!trimmedName) {
            showToast({ message: "Il nome è obbligatorio.", type: "error" });
            return;
        }

        onSavingChange(true);
        try {
            await updateActivity(entityData.id, tenantId, {
                name: trimmedName,
                address: address.trim() || null,
                city: city.trim() || null,
                description: description.trim() || null
            });
            showToast({ message: "Identità aggiornata con successo.", type: "success" });
            onSuccess();
        } catch (error: unknown) {
            console.error("Errore salvataggio identità:", error);
            showToast({
                message:
                    error instanceof Error
                        ? error.message
                        : "Impossibile salvare le modifiche.",
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
                    label="Nome sede"
                    required
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="Es. McDonald's - Via Certosa"
                />

                <TextInput
                    label="Indirizzo"
                    value={address}
                    onChange={e => setAddress(e.target.value)}
                    placeholder="Es. Via Roma 10"
                />

                <TextInput
                    label="Città"
                    value={city}
                    onChange={e => setCity(e.target.value)}
                    placeholder="Es. Milano"
                />

                <Textarea
                    label="Presentazione attività"
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    placeholder="Descrivi la tua sede per i clienti..."
                />
            </div>
        </form>
    );
}
