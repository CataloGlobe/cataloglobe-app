// BusinessCreateCard.tsx
import React from "react";
import Text from "@/components/ui/Text/Text";
import { TextInput } from "@/components/ui/Input/TextInput";
import type { BusinessFormValues } from "@/types/Businesses";
import styles from "./BusinessCreateCard.module.scss";
import { FileInput } from "@/components/ui/Input/FileInput";
import { InfoTooltip } from "@/components/ui/Tooltip/InfoTooltip";

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
    mode?: "create" | "edit";
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
    namePlaceholder,
    mode = "create"
}) => {
    const isCreate = mode === "create";
    const finalUrl = `${previewBaseUrl}/${values.slug || "<slug>"}`;

    return (
        <section className={styles.createCard} aria-label="Aggiungi nuova sede">
            <form id={formId} onSubmit={onSubmit} className={styles.formContainer}>
                {/* Nome */}
                <TextInput
                    label="Nome sede"
                    tooltip={
                        <InfoTooltip content="Questo nome sarà visibile ai clienti nel catalogo pubblico" />
                    }
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
                    tooltip={
                        <InfoTooltip content="Utilizzato per la visualizzazione e per eventuali integrazioni con mappe" />
                    }
                    placeholder="Es. Via Roma 10"
                    value={values.address}
                    onChange={e => onFieldChange("address", e.target.value)}
                    error={errors?.address}
                    required
                />

                {/* Slug — solo in creazione */}
                {isCreate && (
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
                                    Questo indirizzo è già in uso. Scegli un&apos;alternativa:
                                </Text>

                                {slugState.suggestions.length > 0 && (
                                    <div className={styles.slugSuggestions}>
                                        {/* Prima opzione: evidenziata come consigliata */}
                                        <button
                                            type="button"
                                            className={styles.slugSuggestionPrimary}
                                            onClick={() => onPickSlugSuggestion(slugState.suggestions[0])}
                                        >
                                            <span className={styles.slugSuggestionLabel}>Consigliato</span>
                                            <span className={styles.slugSuggestionText}>
                                                {slugState.suggestions[0]}
                                            </span>
                                        </button>

                                        {/* Opzioni secondarie */}
                                        {slugState.suggestions.slice(1).length > 0 && (
                                            <div className={styles.slugSuggestionSecondaryRow}>
                                                {slugState.suggestions.slice(1).map(s => (
                                                    <button
                                                        key={s}
                                                        type="button"
                                                        className={styles.slugSuggestionSecondary}
                                                        onClick={() => onPickSlugSuggestion(s)}
                                                    >
                                                        {s}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}

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
