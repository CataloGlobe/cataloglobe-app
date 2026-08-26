// ============================================================
// useCreateActivity() — logica di creazione sede riusabile.
//
// Incapsula: valori/errori del form, derivazione dello slug dal nome
// (slugify istantaneo + rifinitura debounced anti-collisione), slug
// riservati, controllo unicità, suggerimenti alternativi, cover
// (compressione + upload) e chiamata a `createActivity` con mappatura
// dell'errore SLUG_CONFLICT.
//
// NON dipende da TenantProvider né da PermissionsProvider: `tenantId`
// arriva come argomento. Nessun drawer, nessun routing, nessun toast:
// navigazione e toast restano al chiamante via `onNotify` / `onSuccess`
// / `onSettled`; i gate di pagina (abbonamento, limite sedi) via i
// guard `canSubmit` / `beforeCreate`, invocati nello stesso ordine in
// cui vivevano nel flusso originale.
// ============================================================

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { createActivity, uploadActivityCover } from "@/services/supabase/activities";
import { ensureUniqueBusinessSlug } from "@/utils/businessSlug";
import { generateSlug, sanitizeSlugForSave } from "@/utils/slugify";
import { compressImage, COMPRESS_PROFILES } from "@/utils/compressImage";
import { isValidCapIT, isValidProvinciaIT } from "@/utils/addressValidators";
import { RESERVED_SLUGS } from "@/constants/reservedSlugs";
import type { BusinessFormValues, SlugInlineState } from "@/types/Businesses";
import type { ToastOptions } from "@/types/toast";
import { useDebounce } from "./useDebounce";

export type BusinessFormErrors = Partial<Record<keyof BusinessFormValues, string>>;

const EMPTY_FORM: BusinessFormValues = {
    name: "",
    city: "",
    address: "",
    street_number: "",
    postal_code: "",
    province: "",
    slug: "",
    coverPreview: null
};

export function isReservedSlug(slug: string): boolean {
    return RESERVED_SLUGS.has(slug);
}

export function validateBusinessForm(values: BusinessFormValues): BusinessFormErrors {
    const errors: BusinessFormErrors = {};

    if (!values.name.trim()) errors.name = "Il nome è obbligatorio.";
    if (!values.city.trim()) errors.city = "La città è obbligatoria.";
    if (!values.address.trim()) errors.address = "L'indirizzo è obbligatorio.";
    if (!values.slug.trim()) errors.slug = "Lo slug è obbligatorio.";
    if (!values.street_number.trim()) errors.street_number = "Inserisci il numero civico";
    if (!isValidCapIT(values.postal_code)) errors.postal_code = "Inserisci un CAP valido (5 cifre)";
    if (!isValidProvinciaIT(values.province))
        errors.province = "Inserisci una sigla provincia valida (es. MI)";

    return errors;
}

/**
 * Suggerimenti di slug alternativi, verificati uno a uno come disponibili
 * (max 4). Usata dal create (hook) e dall'edit sede (pagina).
 */
export async function getSlugSuggestions(base: string, city?: string): Promise<string[]> {
    const baseSlug = sanitizeSlugForSave(base);
    const year = new Date().getFullYear().toString();

    const candidates: string[] = [];

    // 1. {baseSlug}-{city} se disponibile
    if (city?.trim()) {
        const citySlug = sanitizeSlugForSave(city.trim());
        if (citySlug) candidates.push(`${baseSlug}-${citySlug}`);
    }

    // 2. suffissi numerici leggibili
    candidates.push(`${baseSlug}-01`, `${baseSlug}-02`, `${baseSlug}-03`);

    // 3. suffissi semantici
    candidates.push(`${baseSlug}-locale`, `${baseSlug}-store`, `${baseSlug}-hub`);

    // 4. anno come fallback
    candidates.push(`${baseSlug}-${year}`);

    // Deduplica, poi verifica disponibilità per ciascuno (max 4)
    const seen = new Set<string>();
    const verified: string[] = [];
    for (const candidate of candidates) {
        if (verified.length >= 4) break;
        if (seen.has(candidate)) continue;
        seen.add(candidate);
        const result = await ensureUniqueBusinessSlug(candidate);
        if (result === candidate) {
            verified.push(candidate);
        }
    }

    return verified;
}

export interface UseCreateActivityOptions {
    /** Source of truth del tenant. Il submit è no-op finché è null. */
    tenantId: string | null;
    /** Valorizza `activities.activity_type` (di norma il vertical del tenant). */
    activityType?: string | null;
    /** Guard pre-validazione: false → submit abortito (es. abbonamento non attivo). */
    canSubmit?: () => boolean;
    /** Guard dopo i controlli slug, prima della insert (es. limite sedi del piano). */
    beforeCreate?: () => boolean;
    /** Feedback utente (toast) prodotto dal flusso di creazione. */
    onNotify?: (options: ToastOptions) => void;
    /** Eseguito dentro il try dopo la creazione (es. reload lista). */
    onSuccess?: () => void | Promise<void>;
    /** Eseguito nel finally del submit (es. chiusura drawer). */
    onSettled?: () => void;
}

export interface UseCreateActivityResult {
    values: BusinessFormValues;
    errors: BusinessFormErrors;
    isCreating: boolean;
    slugState: SlugInlineState;
    setSlugState: (state: SlugInlineState) => void;
    handleFieldChange: <K extends keyof BusinessFormValues>(
        field: K,
        value: BusinessFormValues[K]
    ) => void;
    handleCoverChange: (file: File | null) => void;
    handlePickSlugSuggestion: (slug: string) => void;
    handleSubmit: (e: FormEvent) => Promise<void>;
    reset: () => void;
}

export function useCreateActivity({
    tenantId,
    activityType = null,
    canSubmit,
    beforeCreate,
    onNotify,
    onSuccess,
    onSettled
}: UseCreateActivityOptions): UseCreateActivityResult {
    const [values, setValues] = useState<BusinessFormValues>(EMPTY_FORM);
    const [errors, setErrors] = useState<BusinessFormErrors>({});
    const [coverFile, setCoverFile] = useState<File | null>(null);
    const [isCreating, setIsCreating] = useState(false);
    const [slugTouched, setSlugTouched] = useState(false);
    const [slugState, setSlugState] = useState<SlugInlineState>({ type: "idle" });
    const debouncedName = useDebounce(values.name, 500);

    // GENERAZIONE SLUG AUTOMATICA CON DEBOUNCE
    useEffect(() => {
        if (!debouncedName.trim()) {
            setValues(prev => ({ ...prev, slug: "" }));
            return;
        }
        if (slugTouched) return; // l’utente ha modificato manualmente lo slug → non aggiorniamo più
        if (!tenantId) return;

        async function compute() {
            const unique = await ensureUniqueBusinessSlug(debouncedName);
            if (isReservedSlug(unique)) return;
            setValues(prev => ({ ...prev, slug: unique }));
        }

        compute();
    }, [debouncedName, slugTouched, tenantId]);

    const handleFieldChange = useCallback(
        <K extends keyof BusinessFormValues>(field: K, value: BusinessFormValues[K]) => {
            // se l'utente tocca lo slug, da qui in avanti non lo aggiorniamo più automaticamente
            if (field === "slug") {
                setSlugTouched(true);
            }

            setValues(prev => {
                // cambio del NOME
                if (field === "name") {
                    const newName = value as string;

                    if (!slugTouched) {
                        // slugify istantaneo on-keystroke per feedback immediato.
                        // useEffect debounced rifinisce con suffisso anti-collisione.
                        return {
                            ...prev,
                            name: newName,
                            slug: generateSlug(newName)
                        };
                    }

                    // se lo slug è stato toccato, cambiamo solo il name
                    return {
                        ...prev,
                        name: newName
                    };
                }

                // cambio dello SLUG (campo editabile)
                if (field === "slug") {
                    setSlugState({ type: "idle" });
                    return { ...prev, slug: value as string };
                }

                // tutti gli altri campi
                return {
                    ...prev,
                    [field]: value
                };
            });
        },
        [slugTouched]
    );

    const handleCoverChange = useCallback((file: File | null) => {
        setValues(prev => {
            if (prev.coverPreview?.startsWith("blob:")) {
                URL.revokeObjectURL(prev.coverPreview);
            }
            return prev;
        });

        if (!file) {
            setCoverFile(null);
            setValues(prev => ({ ...prev, coverPreview: null }));
            return;
        }

        setCoverFile(file);
        const url = URL.createObjectURL(file);
        setValues(prev => ({ ...prev, coverPreview: url }));
    }, []);

    const handlePickSlugSuggestion = useCallback((slug: string) => {
        setValues(prev => ({ ...prev, slug }));
        setSlugState({ type: "idle" });
    }, []);

    const reset = useCallback(() => {
        setErrors({});
        setValues(EMPTY_FORM);
        setCoverFile(null);
        setSlugTouched(false);
    }, []);

    const handleSubmit = useCallback(
        async (e: FormEvent) => {
            e.preventDefault();

            if (canSubmit && !canSubmit()) return;

            const validationErrors = validateBusinessForm(values);
            setErrors(validationErrors);

            if (Object.keys(validationErrors).length > 0) {
                onNotify?.({
                    message: "Compila tutti i campi obbligatori.",
                    type: "info",
                    duration: 2500
                });
                return;
            }

            if (!tenantId) return;

            // 1. Sanitizziamo lo slug manuale dell’utente
            const baseSlug = sanitizeSlugForSave(values.slug || values.name);

            if (isReservedSlug(baseSlug)) {
                setErrors(prev => ({
                    ...prev,
                    slug: "Questo slug è riservato. Scegline un altro."
                }));
                onNotify?.({
                    message: "Slug riservato: scegli un altro valore.",
                    type: "error",
                    duration: 2500
                });
                return;
            }

            // 2. Calcoliamo lo slug univoco
            const uniqueSlug = await ensureUniqueBusinessSlug(baseSlug);

            // 3. Se è diverso → significa che lo slug scelto ESISTE GIÀ
            if (uniqueSlug !== baseSlug) {
                const suggestions = await getSlugSuggestions(baseSlug, values.city);
                setSlugState({ type: "conflict", suggestions });
                return;
            }

            if (beforeCreate && !beforeCreate()) return;

            setIsCreating(true);
            try {
                const newActivity = await createActivity(tenantId, {
                    name: values.name,
                    city: values.city,
                    address: values.address,
                    street_number: values.street_number || null,
                    postal_code: values.postal_code || null,
                    province: values.province || null,
                    slug: uniqueSlug,
                    activity_type: activityType
                });

                if (coverFile) {
                    const compressedCover = await compressImage(coverFile, COMPRESS_PROFILES.cover);
                    await uploadActivityCover(
                        {
                            id: newActivity.id,
                            slug: newActivity.slug,
                            tenant_id: newActivity.tenant_id
                        },
                        compressedCover
                    );
                }

                // reset
                setValues(EMPTY_FORM);
                setCoverFile(null);
                setSlugTouched(false);

                await onSuccess?.();
            } catch (err) {
                console.error("Errore aggiunta business:", err);
                const message =
                    err instanceof Error && err.message === "SLUG_CONFLICT"
                        ? "Indirizzo web già in uso. Scegli un indirizzo diverso."
                        : "Errore durante la creazione della sede.";
                onNotify?.({ message, type: "error" });
            } finally {
                setIsCreating(false);
                onSettled?.();
                setSlugState({ type: "idle" });
            }
        },
        [
            tenantId,
            activityType,
            values,
            coverFile,
            canSubmit,
            beforeCreate,
            onNotify,
            onSuccess,
            onSettled
        ]
    );

    return {
        values,
        errors,
        isCreating,
        slugState,
        setSlugState,
        handleFieldChange,
        handleCoverChange,
        handlePickSlugSuggestion,
        handleSubmit,
        reset
    };
}
