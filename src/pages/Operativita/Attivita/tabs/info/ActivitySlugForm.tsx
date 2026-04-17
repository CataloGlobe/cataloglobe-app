import React, { useState, useEffect, useCallback, useRef } from "react";
import { IconCheck, IconX, IconAlertTriangle } from "@tabler/icons-react";
import { TextInput } from "@/components/ui/Input/TextInput";
import { CheckboxInput } from "@/components/ui/Input/CheckboxInput";
import Text from "@/components/ui/Text/Text";
import { updateActivity } from "@/services/supabase/activities";
import { createActivitySlugAlias } from "@/services/supabase/activitySlugAliases";
import { ensureUniqueBusinessSlug } from "@/utils/businessSlug";
import { sanitizeSlugForSave } from "@/utils/slugify";
import { RESERVED_SLUGS } from "@/constants/reservedSlugs";
import type { V2Activity } from "@/types/activity";
import { useToast } from "@/context/Toast/ToastContext";
import styles from "./ActivitySlugForm.module.scss";

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
    tenantId: _tenantId,
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
            const sanitized = sanitizeSlugForSave(e.target.value);
            setSlug(sanitized);
            setHasConfirmed(false);

            if (debounceRef.current) clearTimeout(debounceRef.current);

            if (!sanitized || sanitized === entityData.slug) {
                setSlugStatus("idle");
                return;
            }

            debounceRef.current = setTimeout(() => {
                checkSlug(sanitized);
            }, DEBOUNCE_MS);
        },
        [entityData.slug, checkSlug]
    );

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

            onSavingChange(true);
            try {
                const oldSlug = entityData.slug;
                await updateActivity(entityData.id, entityData.tenant_id, { slug });
                // Salva il vecchio slug come alias — fire-and-forget, non blocca il flusso
                try {
                    await createActivitySlugAlias(entityData.id, entityData.tenant_id, oldSlug);
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
        [slug, slugStatus, hasConfirmed, isActive, entityData.id, entityData.tenant_id, entityData.slug, onSuccess, onSavingChange, showToast]
    );

    const canSubmit = isActive
        ? slugStatus === "available" && hasConfirmed && slug !== entityData.slug
        : slugStatus === "available" && slug !== entityData.slug;

    useEffect(() => {
        onCanSubmitChange(canSubmit);
    }, [canSubmit, onCanSubmitChange]);

    return (
        <form id={formId} onSubmit={handleSubmit}>
            <div className={styles.formFields}>
                <div>
                    <TextInput
                        label="Indirizzo web"
                        required
                        value={slug}
                        onChange={handleSlugChange}
                        placeholder="es. pizzeria-roma-centro"
                    />
                    {slugStatus === "checking" && (
                        <div className={`${styles.statusMessage} ${styles.checking}`}>
                            Verifica in corso...
                        </div>
                    )}
                    {slugStatus === "available" && (
                        <div className={`${styles.statusMessage} ${styles.available}`}>
                            <IconCheck size={14} />
                            Indirizzo disponibile
                        </div>
                    )}
                    {slugStatus === "taken" && (
                        <div className={`${styles.statusMessage} ${styles.error}`}>
                            <IconX size={14} />
                            Indirizzo già in uso
                        </div>
                    )}
                    {slugStatus === "reserved" && (
                        <div className={`${styles.statusMessage} ${styles.error}`}>
                            <IconX size={14} />
                            Indirizzo riservato, scegline un altro
                        </div>
                    )}
                    {slugStatus === "invalid" && (
                        <div className={`${styles.statusMessage} ${styles.error}`}>
                            <IconX size={14} />
                            {SLUG_NO_CONSECUTIVE_DASHES.test(slug)
                                ? "Non puoi usare trattini consecutivi (--)"
                                : "Solo lettere minuscole, numeri e trattini (min. 3 caratteri)"}
                        </div>
                    )}
                </div>

                {/* Warning forte: solo per sedi attive */}
                {isActive && (
                    <>
                        <div className={styles.warningBox} role="alert">
                            <IconAlertTriangle size={18} className={styles.warningIcon} />
                            <Text as="span" className={styles.warningText}>
                                Stai cambiando l&apos;URL pubblico di una sede attiva. Il vecchio
                                indirizzo rimarrà attivo come redirect automatico — puoi
                                rimuoverlo in qualsiasi momento dalla sezione URL precedenti.
                                I QR code esistenti continueranno a funzionare, ma ti
                                consigliamo di aggiornarlo.
                            </Text>
                        </div>

                        <CheckboxInput
                            label="Conferma modifica"
                            description="Ho capito che l'URL pubblico della sede cambierà"
                            checked={hasConfirmed}
                            onChange={e => setHasConfirmed(e.target.checked)}
                            disabled={slugStatus !== "available" || slug === entityData.slug}
                        />
                    </>
                )}

                {/* Hidden submit — actual button in DrawerLayout footer */}
                <button
                    type="submit"
                    disabled={!canSubmit}
                    hidden
                    aria-hidden="true"
                />
            </div>
        </form>
    );
}
