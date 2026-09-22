// BusinessCreateCard.tsx
import React from "react";
import { TextInput } from "@/components/ui/Input/TextInput";
import { InfoTooltip } from "@/components/ui/Tooltip/InfoTooltip";
import { AddressAutocomplete } from "@/components/ui/AddressAutocomplete/AddressAutocomplete";
import { FormGrid, FORM_GRID_CLASSES } from "@/components/ui/FormGrid";
import { ImageUploadField } from "@/components/ui/ImageUploadField/ImageUploadField";
import { InlineBanner } from "@/components/ui/InlineBanner/InlineBanner";
import { Chip } from "@/components/ui/Chip/Chip";
import type { BusinessFormValues, SlugInlineState } from "@/types/Businesses";
import { buildPublicUrl } from "@/utils/publicUrl";
import styles from "./BusinessCreateCard.module.scss";

interface BusinessCreateCardProps {
    values: BusinessFormValues;
    errors?: Partial<Record<keyof BusinessFormValues, string>>;
    onFieldChange: <K extends keyof BusinessFormValues>(
        field: K,
        value: BusinessFormValues[K]
    ) => void;
    onCoverChange: (file: File | null) => void;
    onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
    formId?: string;
    slugState: SlugInlineState;
    onPickSlugSuggestion: (slug: string) => void;
    namePlaceholder?: string;
    mode?: "create" | "edit";
}

/**
 * Il form della sede: una `FormGrid` a due colonne (una sotto 768), usata
 * dal drawer «Nuova sede» e dal passo 1 del setup guidato. La griglia è
 * dichiarata qui, non imposta dall'esterno per posizione dei figli.
 */
export const BusinessCreateCard: React.FC<BusinessCreateCardProps> = ({
    values,
    errors,
    onFieldChange,
    onCoverChange,
    onSubmit,
    formId,
    slugState,
    onPickSlugSuggestion,
    namePlaceholder,
    mode = "create"
}) => {
    const isCreate = mode === "create";
    // Il dominio pubblico può differire da quello del backoffice: l'anteprima
    // viene da `buildPublicUrl`, mai da `window.location.origin`.
    const finalUrl = buildPublicUrl(values.slug || "<slug>");

    return (
        <form id={formId} onSubmit={onSubmit} aria-label="Aggiungi nuova sede">
            <FormGrid cols={2} autoFocus>
                <TextInput
                    containerClassName={FORM_GRID_CLASSES.span}
                    label="Nome della sede"
                    tooltip={<InfoTooltip content="Lo vedono i clienti nella pagina pubblica." />}
                    placeholder={namePlaceholder ?? "Es. McDonald's - Via Certosa"}
                    value={values.name}
                    onChange={e => onFieldChange("name", e.target.value)}
                    error={errors?.name}
                    required
                />

                <div className={FORM_GRID_CLASSES.span}>
                    <AddressAutocomplete
                        label="Cerca l'indirizzo"
                        placeholder="Cerca via, piazza, corso…"
                        onSelect={result => {
                            onFieldChange("address", result.address);
                            onFieldChange("street_number", result.street_number);
                            onFieldChange("postal_code", result.postal_code);
                            onFieldChange("city", result.city);
                            onFieldChange("province", result.province);
                        }}
                    />
                </div>

                <TextInput
                    containerClassName={FORM_GRID_CLASSES.span}
                    label="Via"
                    placeholder="Es. Via Roma"
                    value={values.address}
                    onChange={e => onFieldChange("address", e.target.value)}
                    error={errors?.address}
                    required
                />

                <TextInput
                    label="Civico"
                    required
                    placeholder="Es. 10"
                    value={values.street_number}
                    onChange={e => onFieldChange("street_number", e.target.value)}
                    error={errors?.street_number}
                />
                <TextInput
                    label="CAP"
                    required
                    placeholder="Es. 20100"
                    value={values.postal_code}
                    onChange={e => onFieldChange("postal_code", e.target.value)}
                    error={errors?.postal_code}
                    maxLength={5}
                />
                <TextInput
                    label="Provincia"
                    required
                    placeholder="Es. MI"
                    value={values.province}
                    onChange={e => onFieldChange("province", e.target.value.toUpperCase())}
                    error={errors?.province}
                    maxLength={2}
                />
                <TextInput
                    label="Città"
                    placeholder="Es. Milano"
                    value={values.city}
                    onChange={e => onFieldChange("city", e.target.value)}
                    error={errors?.city}
                    required
                />

                {/* Indirizzo web — solo in creazione: dopo si cambia dalla scheda. */}
                {isCreate && (
                    <div className={`${FORM_GRID_CLASSES.span} ${styles.slug}`}>
                        <TextInput
                            label="Indirizzo web"
                            placeholder="es. snoopy-bar"
                            value={values.slug}
                            onChange={e => onFieldChange("slug", e.target.value)}
                            error={errors?.slug}
                            helperText={`Sarà ${finalUrl}`}
                            required
                        />

                        {slugState.type === "warning" && (
                            <InlineBanner variant="warning">
                                Cambiando l&apos;indirizzo web, i QR già stampati e i link condivisi potrebbero non
                                funzionare più.
                            </InlineBanner>
                        )}

                        {slugState.type === "conflict" && (
                            <InlineBanner variant="warning">
                                <div className={styles.conflict}>
                                    <span>Questo indirizzo è già in uso. Scegli un&apos;alternativa:</span>
                                    {slugState.suggestions.length > 0 && (
                                        <div className={styles.suggestions} role="group" aria-label="Indirizzi disponibili">
                                            {slugState.suggestions.map((s, i) => (
                                                <Chip
                                                    key={s}
                                                    label={s}
                                                    selected={i === 0}
                                                    ariaLabel={i === 0 ? `Consigliato: ${s}` : s}
                                                    onClick={() => onPickSlugSuggestion(s)}
                                                />
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </InlineBanner>
                        )}
                    </div>
                )}

                <div className={FORM_GRID_CLASSES.span}>
                    <ImageUploadField
                        label="Foto di copertina"
                        variant="wide"
                        maxSizeMb={5}
                        imageUrl={values.coverPreview}
                        onFileChange={onCoverChange}
                        onRemove={values.coverPreview ? () => onCoverChange(null) : undefined}
                    />
                </div>
            </FormGrid>
        </form>
    );
};
