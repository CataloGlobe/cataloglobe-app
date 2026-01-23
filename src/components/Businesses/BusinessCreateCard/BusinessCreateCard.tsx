// BusinessCreateCard.tsx
import React from "react";
import Text from "@/components/ui/Text/Text";
import { TextInput } from "@/components/ui/Input/TextInput";
import { Select } from "@/components/ui/Select/Select";
import type { BusinessFormValues } from "@/types/Businesses";
import styles from "./BusinessCreateCard.module.scss";
import { FileInput } from "@/components/ui/Input/FileInput";
import { Button } from "@/components/ui";

interface BusinessCreateCardProps {
    values: BusinessFormValues;
    errors?: Partial<Record<keyof BusinessFormValues, string>>;
    onFieldChange: <K extends keyof BusinessFormValues>(
        field: K,
        value: BusinessFormValues[K]
    ) => void;
    onCoverChange: (file: File | null) => void;
    onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
    previewBaseUrl: string;
    formId?: string;
    slugState: SlugInlineState;
    onPickSlugSuggestion: (slug: string) => void;
}

type SlugInlineState =
    | { type: "idle" }
    | { type: "warning" }
    | { type: "conflict"; suggestions: string[] };

export const BusinessCreateCard: React.FC<BusinessCreateCardProps> = ({
    values,
    errors,
    onFieldChange,
    onCoverChange,
    onSubmit,
    previewBaseUrl,
    formId,
    slugState,
    onPickSlugSuggestion
}) => {
    const finalUrl = `${previewBaseUrl}/business/${values.slug || "<slug>"}`;

    return (
        <section className={styles.createCard} aria-label="Aggiungi nuova attività">
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

                <div className={styles.slugContainer}>
                    <TextInput
                        label="Slug"
                        placeholder="es. snoopy-bar"
                        value={values.slug}
                        onChange={e => onFieldChange("slug", e.target.value)}
                        error={errors?.slug}
                        helperText={`URL finale: ${finalUrl}`}
                    />

                    {slugState.type === "warning" && (
                        <Text variant="caption" colorVariant="warning">
                            Attenzione: cambiando lo slug, i QR code già stampati e i link condivisi
                            potrebbero non funzionare più.
                        </Text>
                    )}

                    {slugState.type === "conflict" && (
                        <div className={styles.slugConflict} role="alert" aria-live="polite">
                            <Text variant="caption" colorVariant="warning">
                                Questo slug è già in uso. Scegli un’alternativa:
                            </Text>

                            <div className={styles.slugSuggestions}>
                                {slugState.suggestions.map(s => (
                                    <Button
                                        key={s}
                                        size="sm"
                                        variant="outline"
                                        onClick={() => onPickSlugSuggestion(s)}
                                    >
                                        {s}
                                    </Button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Cover */}
                <FileInput
                    label="Foto copertina"
                    accept="image/*"
                    helperText="PNG o JPG, max 5MB"
                    onChange={onCoverChange}
                />
            </form>
        </section>
    );
};
