import React, { useState, useEffect, useCallback, useRef } from "react";
import { FormGrid } from "@/components/ui/FormGrid/FormGrid";
import { InlineBanner } from "@/components/ui/InlineBanner/InlineBanner";
import { TextInput } from "@/components/ui/Input/TextInput";
import { CheckboxInput } from "@/components/ui/Input/CheckboxInput";
import { updateActivity } from "@/services/supabase/activities";
import { createActivitySlugAlias } from "@/services/supabase/activitySlugAliases";
import { ensureUniqueBusinessSlug } from "@/utils/businessSlug";
import { sanitizeSlugForInput, sanitizeSlugForSave } from "@/utils/slugify";
import { RESERVED_SLUGS } from "@/constants/reservedSlugs";
import type { V2Activity } from "@/types/activity";
import { useToast } from "@/context/Toast/ToastContext";

// ⚠️ SYNC con DB: activities_slug_format CHECK constraint
const SLUG_REGEX = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;
const SLUG_NO_CONSECUTIVE_DASHES = /--/;
const DEBOUNCE_MS = 600;

type SlugStatus = "idle" | "checking" | "available" | "taken" | "reserved" | "invalid";

type ActivitySlugFormProps = {
    formId: string;
    entityData: V2Activity;
    tenantId: string;
    onSuccess: () => void;
    onSavingChange: (saving: boolean) => void;
    onCanSubmitChange: (canSubmit: boolean) => void;
};

export function ActivitySlugForm({
    formId,
    entityData,
    tenantId,
    onSuccess,
    onSavingChange,
    onCanSubmitChange
}: ActivitySlugFormProps) {
    const { showToast } = useToast();
    const isActive = entityData.status === "active";

    const [slug, setSlug] = useState(entityData.slug);
    const [slugStatus, setSlugStatus] = useState<SlugStatus>("idle");
    const [hasConfirmed, setHasConfirmed] = useState(false);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        setSlug(entityData.slug);
        setSlugStatus("idle");
        setHasConfirmed(false);
    }, [entityData]);

    const checkSlug = useCallback(
        async (candidate: string) => {
            if (candidate === entityData.slug) {
                setSlugStatus("idle");
                return;
            }

            // ⚠️ SYNC con DB: is_reserved_slug() — enforcement definitivo a DB level
            if (RESERVED_SLUGS.has(candidate)) {
                setSlugStatus("reserved");
                return;
            }

            if (SLUG_NO_CONSECUTIVE_DASHES.test(candidate)) {
                setSlugStatus("invalid");
                return;
            }

            if (candidate.length < 3 || !SLUG_REGEX.test(candidate)) {
                setSlugStatus("invalid");
                return;
            }

            setSlugStatus("checking");
            try {
                // Esclude la sede corrente dal controllo disponibilità (modalità edit)
                const unique = await ensureUniqueBusinessSlug(candidate, entityData.id);
                if (unique !== candidate) {
                    setSlugStatus("taken");
                } else {
                    setSlugStatus("available");
                }
            } catch {
                setSlugStatus("invalid");
            }
        },
        [entityData.slug, entityData.id]
    );

    const handleSlugChange = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            // Live: sanitize PERMISSIVA (permette stati intermedi tipo `isola-`).
            const liveValue = sanitizeSlugForInput(e.target.value);
            setSlug(liveValue);
            setHasConfirmed(false);

            if (debounceRef.current) clearTimeout(debounceRef.current);

            // Validazione e unicità girano sulla forma CANONICA, non sul raw:
            // evita il flash "non valido" mentre si digita un trattino di bordo.
            const canonical = sanitizeSlugForSave(liveValue);

            if (!canonical || canonical === entityData.slug) {
                setSlugStatus("idle");
                return;
            }

            debounceRef.current = setTimeout(() => {
                checkSlug(canonical);
            }, DEBOUNCE_MS);
        },
        [entityData.slug, checkSlug]
    );

    // Blur: snap alla forma canonica (`isola-` → `isola`, `isola--test` → `isola-test`).
    const handleSlugBlur = useCallback(() => {
        setSlug(prev => sanitizeSlugForSave(prev));
    }, []);

    useEffect(() => {
        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
        };
    }, []);

    const handleSubmit = useCallback(
        async (e: React.FormEvent) => {
            e.preventDefault();

            const canSubmit = isActive
                ? slugStatus === "available" && hasConfirmed && slug !== entityData.slug
                : slugStatus === "available" && slug !== entityData.slug;

            if (!canSubmit) return;

            // Rete di sicurezza: normalizza in forma canonica prima della write,
            // anche se l'utente non ha fatto blur sul campo.
            const canonicalSlug = sanitizeSlugForSave(slug);

            onSavingChange(true);
            try {
                const oldSlug = entityData.slug;
                await updateActivity(entityData.id, tenantId, { slug: canonicalSlug });
                // Salva il vecchio slug come alias — fire-and-forget, non blocca il flusso
                try {
                    await createActivitySlugAlias(entityData.id, tenantId, oldSlug);
                } catch {
                    // Ignorato: non critico per il flusso principale
                }
                showToast({ message: "Indirizzo web aggiornato.", type: "success" });
                onSuccess();
            } catch (error: unknown) {
                const message =
                    error instanceof Error && error.message === "SLUG_CONFLICT"
                        ? "Indirizzo web già in uso. Scegli un indirizzo diverso."
                        : "Impossibile aggiornare l'indirizzo web.";
                showToast({ message, type: "error" });
            } finally {
                onSavingChange(false);
            }
        },
        [slug, slugStatus, hasConfirmed, isActive, entityData.id, entityData.slug, tenantId, onSuccess, onSavingChange, showToast]
    );

    const canSubmit = isActive
        ? slugStatus === "available" && hasConfirmed && slug !== entityData.slug
        : slugStatus === "available" && slug !== entityData.slug;

    useEffect(() => {
        onCanSubmitChange(canSubmit);
    }, [canSubmit, onCanSubmitChange]);

    const statusHelper =
        slugStatus === "checking"
            ? "Verifica in corso…"
            : slugStatus === "available"
                ? "Indirizzo disponibile."
                : "Solo lettere minuscole, numeri e trattini, almeno 3 caratteri.";
    const statusError =
        slugStatus === "taken"
            ? "Indirizzo già in uso."
            : slugStatus === "reserved"
                ? "Indirizzo riservato: scegline un altro."
                : slugStatus === "invalid"
                    ? SLUG_NO_CONSECUTIVE_DASHES.test(slug)
                        ? "Non puoi usare trattini consecutivi (--)."
                        : "Solo lettere minuscole, numeri e trattini, almeno 3 caratteri."
                    : undefined;

    return (
        <form id={formId} onSubmit={handleSubmit}>
            <FormGrid cols={1} autoFocus>
                <TextInput
                    label="Indirizzo web"
                    required
                    value={slug}
                    onChange={handleSlugChange}
                    onBlur={handleSlugBlur}
                    placeholder="es. pizzeria-roma-centro"
                    helperText={statusError ? undefined : statusHelper}
                    error={statusError}
                />

                {/* Solo per sedi pubblicate: i link in giro cambiano destinazione. */}
                {isActive && (
                    <>
                        <InlineBanner variant="warning">
                            Stai cambiando l&apos;indirizzo pubblico di una sede pubblicata. Il vecchio indirizzo resta
                            come redirect automatico e compare qui sotto fra gli indirizzi precedenti, da dove puoi
                            rimuoverlo. I QR già stampati continuano a funzionare, ma conviene aggiornarli.
                        </InlineBanner>
                        <CheckboxInput
                            label="Ho capito che l'URL pubblico della sede cambierà"
                            checked={hasConfirmed}
                            onChange={e => setHasConfirmed(e.target.checked)}
                            disabled={slugStatus !== "available" || slug === entityData.slug}
                        />
                    </>
                )}

                {/* Submit nascosto: il bottone vero sta nel footer del drawer. */}
                <button type="submit" disabled={!canSubmit} hidden aria-hidden="true" />
            </FormGrid>
        </form>
    );
}
