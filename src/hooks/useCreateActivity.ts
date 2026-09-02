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
//
// `persistDraft` aggiunge una bozza locale dei campi testuali (opt-in,
// spenta per default): serve al setup guidato, dove un "indietro" del
// browser perderebbe in silenzio un form che non ha ancora toccato il DB.
// Il drawer di creazione sede resta senza, il suo contesto non si perde.
// ============================================================

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { createActivity, uploadActivityCover } from "@/services/supabase/activities";
import { ensureUniqueBusinessSlug } from "@/utils/businessSlug";
import { generateSlug, sanitizeSlugForSave } from "@/utils/slugify";
import { compressImage, COMPRESS_PROFILES } from "@/utils/compressImage";
import { isValidCapIT, isValidProvinciaIT } from "@/utils/addressValidators";
import { RESERVED_SLUGS } from "@/constants/reservedSlugs";
import {
    clearSetupActivityDraft,
    readSetupActivityDraft,
    saveSetupActivityDraft
} from "@/utils/setupActivityDraft";
import type { V2Activity } from "@/types/activity";
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
    /**
     * Conserva i campi testuali in una bozza locale per tenant, ripristinata
     * al montaggio successivo. Opt-in: serve dove un'uscita non intenzionale
     * (indietro del browser) perderebbe un form mai arrivato al DB. La
     * copertina resta fuori — un `File` non è serializzabile.
     */
    persistDraft?: boolean;
    /** Feedback utente (toast) prodotto dal flusso di creazione. */
    onNotify?: (options: ToastOptions) => void;
    /**
     * Eseguito dentro il try dopo la creazione (es. reload lista). Riceve la
     * riga appena inserita: è l'unico punto in cui l'entità è disponibile,
     * perché `values` a quel punto è già stato resettato. I chiamanti che non
     * ne hanno bisogno possono ignorare l'argomento.
     */
    onSuccess?: (activity: V2Activity) => void | Promise<void>;
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
    persistDraft = false,
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
    // Stessa soglia dello slug: si salva quando l'utente si ferma, non a ogni
    // battuta. `values` è un oggetto nuovo a ogni modifica, quindi il debounce
    // lavora sull'identità senza bisogno di confrontare campo per campo.
    const debouncedValues = useDebounce(values, 500);

    // Ripristino tentato una volta sola: senza guard, un remount del ramo o un
    // cambio di `onNotify` rifarebbe partire toast e rivalidazione.
    const draftRestoredRef = useRef(false);
    // Creata la sede, la bozza non descrive più niente di recuperabile. Serve
    // un flag e non il solo reset dei valori: se `createActivity` riesce e
    // l'upload della copertina fallisce, il form resta compilato e senza
    // questo la bozza verrebbe riscritta per una sede che ormai esiste.
    const activityCreatedRef = useRef(false);

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

    // RIPRISTINO DELLA BOZZA LOCALE
    //
    // Dichiarato dopo l'effect dello slug: al primo giro quello azzera lo slug
    // perché il nome è vuoto, e deve farlo prima che la bozza scriva i suoi
    // valori, non dopo.
    useEffect(() => {
        if (!persistDraft || !tenantId) return;
        if (draftRestoredRef.current) return;
        draftRestoredRef.current = true;

        const draft = readSetupActivityDraft(tenantId);
        if (!draft) return;

        // Lo slug ripristinato viene dalla bozza, non dal nome corrente:
        // trattarlo come "toccato" impedisce alla generazione automatica di
        // sovrascriverlo appena il nome si stabilizza. Se la bozza non ne
        // aveva uno, la generazione resta libera di produrlo.
        if (draft.slug.trim()) setSlugTouched(true);
        setValues(prev => ({ ...prev, ...draft }));

        onNotify?.({
            message: "Abbiamo ripreso i dati che avevi lasciato su questo dispositivo.",
            type: "info",
            duration: 4000
        });

        // `activities.slug` è UNIQUE globale: nei giorni fra l'abbandono e la
        // ripresa qualcun altro può averlo preso. Rivalidato invece che dato
        // per buono, con lo stesso esito che il form produce già quando il
        // submit incontra un conflitto — nessun ramo nuovo da imparare.
        const savedSlug = sanitizeSlugForSave(draft.slug);
        if (!savedSlug) return;

        (async () => {
            try {
                const unique = await ensureUniqueBusinessSlug(savedSlug);
                if (unique === savedSlug) return;
                const suggestions = await getSlugSuggestions(savedSlug, draft.city);
                setSlugState({ type: "conflict", suggestions });
            } catch (error) {
                // Rete assente o query fallita: lo slug resta com'era e il
                // conflitto, se c'è, riemerge al submit — che lo ricontrolla
                // comunque. Meglio di un form bloccato alla ripresa.
                console.error("[useCreateActivity] rivalidazione slug bozza fallita:", error);
            }
        })();
    }, [persistDraft, tenantId, onNotify]);

    // SALVATAGGIO DELLA BOZZA
    useEffect(() => {
        if (!persistDraft || !tenantId) return;
        // Prima del tentativo di ripristino non c'è nulla di significativo da
        // scrivere, e scrivere ora sovrascriverebbe la bozza da leggere.
        if (!draftRestoredRef.current) return;
        if (activityCreatedRef.current) return;
        // Identità, non contenuto: `EMPTY_FORM` è la costante del primo render
        // e quella a cui torna `reset()`. Qualunque modifica dell'utente
        // produce un oggetto diverso, quindi qui passano solo i form davvero
        // toccati — al montaggio non si scrive (né si cancella) nulla.
        if (debouncedValues === EMPTY_FORM) return;

        saveSetupActivityDraft(tenantId, debouncedValues);
    }, [persistDraft, tenantId, debouncedValues]);

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

                // La sede esiste: la bozza non ha più niente da recuperare e
                // lasciarla sarebbe un fantasma alla prossima apertura. Qui e
                // non a fine blocco: se l'upload della copertina fallisce, la
                // sede resta creata comunque.
                if (persistDraft) {
                    activityCreatedRef.current = true;
                    clearSetupActivityDraft(tenantId);
                }

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

                await onSuccess?.(newActivity);
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
            persistDraft,
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
