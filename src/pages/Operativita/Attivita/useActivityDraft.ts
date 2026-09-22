import { useCallback, useMemo, useRef, useState } from "react";
import { updateActivity } from "@/services/supabase/activities";
import { useToast } from "@/context/Toast/ToastContext";
import type { V2Activity } from "@/types/activity";

/** I campi della sede che il draft può toccare. */
export type ActivityDraftPatch = Partial<Omit<V2Activity, "id" | "tenant_id" | "created_at">>;
export type ActivityDraftField = keyof ActivityDraftPatch;

/** Una sezione dice cosa non va prima del Salva; `null` = tutto a posto. */
export type ActivityDraftValidator = () => string | null;

export interface ActivityDraft {
    /** La sede come sarebbe dopo il Salva: valori salvati più le modifiche. */
    draft: V2Activity;
    /** Solo le modifiche pendenti. */
    patch: ActivityDraftPatch;
    isDirty: boolean;
    dirtyCount: number;
    isSaving: boolean;
    /** Errore dell'ultimo Salva (validazione o rete); sparisce alla modifica dopo. */
    error: string | null;
    set: <K extends ActivityDraftField>(field: K, value: ActivityDraftPatch[K]) => void;
    setMany: (values: ActivityDraftPatch) => void;
    save: () => Promise<boolean>;
    discard: () => void;
    /** Registra una validazione di sezione; ritorna la funzione che la toglie. */
    registerValidator: (key: string, validator: ActivityDraftValidator) => () => void;
}

function isSameValue(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (a == null && b == null) return true;
    if (Array.isArray(a) && Array.isArray(b)) {
        return a.length === b.length && a.every((item, i) => isSameValue(item, b[i]));
    }
    if (typeof a === "object" && typeof b === "object" && a && b) {
        return JSON.stringify(a) === JSON.stringify(b);
    }
    return false;
}

/**
 * Il draft unico della scheda della sede (registro decisioni §31.4, §27):
 * le quattro pagine scrivono qui, un solo Salva nella `UnsavedChangesBar`,
 * una sola `updateActivity` con i campi cambiati. Un campo riportato al
 * valore salvato esce dal draft da solo. Le azioni immediate (copertina,
 * stampanti, chiusure, interruttori) non passano di qui.
 */
export function useActivityDraft(
    activity: V2Activity,
    tenantId: string,
    onSaved: (updated: V2Activity) => void
): ActivityDraft {
    const { showToast } = useToast();
    const [patch, setPatch] = useState<ActivityDraftPatch>({});
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const validators = useRef(new Map<string, ActivityDraftValidator>());

    const setMany = useCallback(
        (values: ActivityDraftPatch) => {
            setError(null);
            setPatch(prev => {
                const next: ActivityDraftPatch = { ...prev };
                for (const [key, value] of Object.entries(values) as [ActivityDraftField, unknown][]) {
                    if (isSameValue(value, activity[key])) {
                        delete next[key];
                    } else {
                        (next as Record<string, unknown>)[key] = value;
                    }
                }
                return next;
            });
        },
        [activity]
    );

    const set = useCallback(
        <K extends ActivityDraftField>(field: K, value: ActivityDraftPatch[K]) => {
            setMany({ [field]: value } as ActivityDraftPatch);
        },
        [setMany]
    );

    const discard = useCallback(() => {
        setPatch({});
        setError(null);
    }, []);

    const registerValidator = useCallback((key: string, validator: ActivityDraftValidator) => {
        validators.current.set(key, validator);
        return () => {
            validators.current.delete(key);
        };
    }, []);

    const save = useCallback(async (): Promise<boolean> => {
        for (const validate of validators.current.values()) {
            const problem = validate();
            if (problem) {
                setError(problem);
                return false;
            }
        }
        setIsSaving(true);
        setError(null);
        try {
            const updated = await updateActivity(activity.id, tenantId, patch);
            onSaved(updated);
            setPatch({});
            showToast({ message: "Modifiche salvate.", type: "success" });
            return true;
        } catch (e) {
            console.error("Errore nel salvataggio della sede:", e);
            setError("Impossibile salvare le modifiche. Riprova.");
            return false;
        } finally {
            setIsSaving(false);
        }
    }, [activity.id, tenantId, patch, onSaved, showToast]);

    const draft = useMemo(() => ({ ...activity, ...patch }) as V2Activity, [activity, patch]);
    const dirtyCount = Object.keys(patch).length;

    return {
        draft,
        patch,
        isDirty: dirtyCount > 0,
        dirtyCount,
        isSaving,
        error,
        set,
        setMany,
        save,
        discard,
        registerValidator
    };
}
