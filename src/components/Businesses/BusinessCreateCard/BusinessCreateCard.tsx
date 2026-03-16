// BusinessCreateCard.tsx
import React from "react";
import Text from "@/components/ui/Text/Text";
import { TextInput } from "@/components/ui/Input/TextInput";
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
    namePlaceholder?: string;
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
    onPickSlugSuggestion,
    namePlaceholder
}) => {
    const finalUrl = `${previewBaseUrl}/${values.slug || "<slug>"}`;

    return (
        <section className={styles.createCard} aria-label="Aggiungi nuova sede">
            <form id={formId} onSubmit={onSubmit} className={styles.formContainer}>
                {/* Nome */}
                <TextInput
                    label="Nome sede"
                    placeholder={namePlaceholder ?? "Es. McDonald's - Via Certosa"}
                    value={values.name}
                    onChange={e => onFieldChange("name", e.target.value)}
                    error={errors?.name}
                    required
                />

                {/* Città */}
                <TextInput
                    label="Città"
                    placeholder="Es. Milano"
                    value={values.city}
                    onChange={e => onFieldChange("city", e.target.value)}
                    error={errors?.city}
                    required
                />

                {/* Indirizzo */}
                <TextInput
                    label="Indirizzo"
                    placeholder="Es. Via Roma 10"
                    value={values.address}
                    onChange={e => onFieldChange("address", e.target.value)}
                    error={errors?.address}
                    required
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
                        required
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
