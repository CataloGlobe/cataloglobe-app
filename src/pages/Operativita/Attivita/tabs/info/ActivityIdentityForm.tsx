import React, { useState, useEffect } from "react";
import { TextInput } from "@/components/ui/Input/TextInput";
import { Textarea } from "@/components/ui/Textarea/Textarea";
import { AddressAutocomplete } from "@/components/ui/AddressAutocomplete/AddressAutocomplete";
import { updateActivity } from "@/services/supabase/activities";
import type { V2Activity } from "@/types/activity";
import { useToast } from "@/context/Toast/ToastContext";
import styles from "./ActivityIdentityForm.module.scss";

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
    const [streetNumber, setStreetNumber] = useState(entityData.street_number ?? "");
    const [postalCode, setPostalCode] = useState(entityData.postal_code ?? "");
    const [city, setCity] = useState(entityData.city ?? "");
    const [province, setProvince] = useState(entityData.province ?? "");
    const [description, setDescription] = useState(entityData.description ?? "");

    useEffect(() => {
        setName(entityData.name);
        setAddress(entityData.address ?? "");
        setStreetNumber(entityData.street_number ?? "");
        setPostalCode(entityData.postal_code ?? "");
        setCity(entityData.city ?? "");
        setProvince(entityData.province ?? "");
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
                street_number: streetNumber.trim() || null,
                postal_code: postalCode.trim() || null,
                city: city.trim() || null,
                province: province.trim() || null,
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

                <AddressAutocomplete
                    placeholder="Cerca via, piazza, corso..."
                    onSelect={result => {
                        setAddress(result.address);
                        setStreetNumber(result.street_number);
                        setPostalCode(result.postal_code);
                        setCity(result.city);
                        setProvince(result.province);
                    }}
                />

                <TextInput
                    label="Via"
                    value={address}
                    onChange={e => setAddress(e.target.value)}
                    placeholder="Es. Via Roma"
                />

                <div className={styles.addressRow}>
                    <TextInput
                        label="Civico"
                        value={streetNumber}
                        onChange={e => setStreetNumber(e.target.value)}
                        placeholder="es. 12"
                    />
                    <TextInput
                        label="CAP"
                        value={postalCode}
                        onChange={e => setPostalCode(e.target.value)}
                        placeholder="es. 20100"
                        maxLength={5}
                    />
                    <TextInput
                        label="Provincia"
                        value={province}
                        onChange={e => setProvince(e.target.value.toUpperCase())}
                        placeholder="es. MI"
                        maxLength={2}
                    />
                </div>

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
