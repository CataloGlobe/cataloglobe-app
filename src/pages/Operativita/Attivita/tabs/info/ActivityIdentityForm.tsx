import React, { useState, useEffect } from "react";
import { TextInput } from "@/components/ui/Input/TextInput";
import { Textarea } from "@/components/ui/Textarea/Textarea";
import { AddressAutocomplete } from "@/components/ui/AddressAutocomplete/AddressAutocomplete";
import { updateActivity } from "@/services/supabase/activities";
import type { V2Activity } from "@/types/activity";
import { useToast } from "@/context/Toast/ToastContext";
import styles from "./ActivityIdentityForm.module.scss";

type FieldErrors = {
    street_number?: string;
    postal_code?: string;
    province?: string;
    city?: string;
};

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
    const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

    useEffect(() => {
        setName(entityData.name);
        setAddress(entityData.address ?? "");
        setStreetNumber(entityData.street_number ?? "");
        setPostalCode(entityData.postal_code ?? "");
        setCity(entityData.city ?? "");
        setProvince(entityData.province ?? "");
        setDescription(entityData.description ?? "");
        setFieldErrors({});
    }, [entityData]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        const trimmedName = name.trim();
        if (!trimmedName) {
            showToast({ message: "Il nome è obbligatorio.", type: "error" });
            return;
        }

        const errors: FieldErrors = {};
        if (!streetNumber.trim()) errors.street_number = "Inserisci il numero civico";
        if (postalCode.trim().length !== 5) errors.postal_code = "Inserisci un CAP valido (5 cifre)";
        if (province.trim().length !== 2) errors.province = "Inserisci la sigla provincia (es. MI)";
        if (!city.trim()) errors.city = "Inserisci la città";

        if (Object.keys(errors).length > 0) {
            setFieldErrors(errors);
            showToast({ message: "Compila tutti i campi obbligatori.", type: "info", duration: 2500 });
            return;
        }

        setFieldErrors({});
        onSavingChange(true);
        try {
            await updateActivity(entityData.id, tenantId, {
                name: trimmedName,
                address: address.trim() || null,
                street_number: streetNumber.trim(),
                postal_code: postalCode.trim(),
                city: city.trim() || null,
                province: province.trim(),
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
                    onSelect={result => {
                        setAddress(result.address);
                        setStreetNumber(result.street_number);
                        setPostalCode(result.postal_code);
                        setCity(result.city);
                        setProvince(result.province);
                        setFieldErrors({});
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
                        required
                        value={streetNumber}
                        onChange={e => {
                            setStreetNumber(e.target.value);
                            if (fieldErrors.street_number) setFieldErrors(prev => ({ ...prev, street_number: undefined }));
                        }}
                        placeholder="es. 12"
                        error={fieldErrors.street_number}
                    />
                    <TextInput
                        label="CAP"
                        required
                        value={postalCode}
                        onChange={e => {
                            setPostalCode(e.target.value);
                            if (fieldErrors.postal_code) setFieldErrors(prev => ({ ...prev, postal_code: undefined }));
                        }}
                        placeholder="es. 20100"
                        maxLength={5}
                        error={fieldErrors.postal_code}
                    />
                    <TextInput
                        label="Provincia"
                        required
                        value={province}
                        onChange={e => {
                            setProvince(e.target.value.toUpperCase());
                            if (fieldErrors.province) setFieldErrors(prev => ({ ...prev, province: undefined }));
                        }}
                        placeholder="es. MI"
                        maxLength={2}
                        error={fieldErrors.province}
                    />
                </div>

                <TextInput
                    label="Città"
                    required
                    value={city}
                    onChange={e => {
                        setCity(e.target.value);
                        if (fieldErrors.city) setFieldErrors(prev => ({ ...prev, city: undefined }));
                    }}
                    placeholder="Es. Milano"
                    error={fieldErrors.city}
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
