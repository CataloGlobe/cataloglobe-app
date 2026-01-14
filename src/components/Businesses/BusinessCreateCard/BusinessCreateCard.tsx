// BusinessCreateCard.tsx
import React from "react";
import Text from "@components/ui/Text/Text";
import { TextInput } from "@/components/ui/Input/TextInput";
import { Select } from "@/components/ui/Select/Select";
import type { BusinessFormValues } from "@/types/Businesses";
import styles from "./BusinessCreateCard.module.scss";
import { FileInput } from "@/components/ui/Input/FileInput";

interface BusinessCreateCardProps {
    values: BusinessFormValues;
    errors?: Partial<Record<keyof BusinessFormValues, string>>;
    onFieldChange: <K extends keyof BusinessFormValues>(
        field: K,
        value: BusinessFormValues[K]
    ) => void;
    onCoverChange: (file: File | null) => void;
    onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
    onCancel: () => void;
    loading: boolean;
    previewBaseUrl: string;
    title?: string;
    description?: string;
    primaryLabel?: string;
    formId?: string;
}

export const BusinessCreateCard: React.FC<BusinessCreateCardProps> = ({
    values,
    errors,
    onFieldChange,
    onCoverChange,
    onSubmit,
    onCancel,
    loading,
    previewBaseUrl,
    title = "Aggiungi attività",
    description = "Compila i campi per creare una nuova attività.",
    primaryLabel = "Crea attività",
    formId
}) => {
    const finalUrl = `${previewBaseUrl}/business/${values.slug || "<slug>"}`;

    return (
        <section className={styles.createCard} aria-label="Aggiungi nuova attività">
            <div className={styles.header}>
                <Text as="h2" variant="title-sm" weight={600}>
                    {title}
                </Text>

                <Text variant="body" colorVariant="muted">
                    {description}
                </Text>
            </div>

            <form id={formId} onSubmit={onSubmit} className={styles.formContainer}>
                {/* Nome */}
                <TextInput
                    label="Nome dell'attività"
                    placeholder="Es. Snoopy Bar"
                    value={values.name}
                    onChange={e => onFieldChange("name", e.target.value)}
                    error={errors?.name}
                />

                {/* Città */}
                <TextInput
                    label="Città"
                    placeholder="Es. Milano"
                    value={values.city}
                    onChange={e => onFieldChange("city", e.target.value)}
                    error={errors?.city}
                />

                {/* Indirizzo */}
                <TextInput
                    label="Indirizzo"
                    placeholder="Es. Via Roma 10"
                    value={values.address}
                    onChange={e => onFieldChange("address", e.target.value)}
                    error={errors?.address}
                />

                {/* Tipo di attività */}
                <Select
                    label="Tipo di attività"
                    value={values.type}
                    error={errors?.type}
                    onChange={e =>
                        onFieldChange("type", e.target.value as BusinessFormValues["type"])
                    }
                    options={[
                        { value: "restaurant", label: "Ristorante" },
                        { value: "bar", label: "Bar" },
                        { value: "hotel", label: "Hotel" },
                        { value: "hairdresser", label: "Parrucchiere" },
                        { value: "beauty", label: "Centro estetico" },
                        { value: "shop", label: "Negozio" },
                        { value: "other", label: "Altro" }
                    ]}
                />

                {/* Slug */}
                <TextInput
                    label="Slug"
                    placeholder="es. snoopy-bar"
                    value={values.slug}
                    onChange={e => onFieldChange("slug", e.target.value)}
                    error={errors?.slug}
                    helperText={`URL finale: ${finalUrl}`}
                />

                {/* Cover */}
                <FileInput
                    label="Foto copertina"
                    accept="image/*"
                    helperText="PNG o JPG, max 5MB"
                    onChange={onCoverChange}
                />

                {/* Submit */}
                <div className={styles.actions}>
                    <button type="button" className={styles.cancel} onClick={onCancel}>
                        Annulla
                    </button>

                    <button type="submit" disabled={loading} className={styles.primary}>
                        {loading ? "Attendi…" : primaryLabel}
                    </button>
                </div>
            </form>
        </section>
    );
};
