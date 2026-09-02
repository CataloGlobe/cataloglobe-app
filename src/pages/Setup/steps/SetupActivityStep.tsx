import { useEffect, useRef } from "react";
import { useToast } from "@/context/Toast/ToastContext";
import { useTenant } from "@/context/useTenant";
import { useCreateActivity } from "@/hooks/useCreateActivity";
import type { V2Activity } from "@/types/activity";
import { BusinessCreateCard } from "@/components/Businesses/BusinessCreateCard/BusinessCreateCard";
import styles from "./SetupActivityStep.module.scss";

type SetupActivityStepProps = {
    formId: string;
    tenantId: string | null;
    /** Notifica al wizard lo stato di salvataggio, che possiede il bottone primario. */
    onSavingChange: (saving: boolean) => void;
    /**
     * Notifica al wizard se il form ha campi compilati: niente arriva al DB
     * prima del submit, quindi è il wizard a decidere se un'uscita va confermata.
     */
    onDirtyChange?: (dirty: boolean) => void;
    /** Creazione riuscita: il wizard registra la sede e avanza al passo successivo. */
    onCreated: (activity: V2Activity) => void;
};

export function SetupActivityStep({
    formId,
    tenantId,
    onSavingChange,
    onDirtyChange,
    onCreated
}: SetupActivityStepProps) {
    const { showToast } = useToast();
    const { selectedTenant } = useTenant();

    const {
        values,
        errors,
        isCreating,
        isDirty,
        slugState,
        handleFieldChange,
        handleCoverChange,
        handlePickSlugSuggestion,
        handleSubmit
    } = useCreateActivity({
        tenantId,
        activityType: selectedTenant?.vertical_type ?? null,
        // Qui l'uscita non è sempre voluta: un "indietro" del browser porta
        // fuori dal wizard e, senza bozza, perderebbe il form in silenzio.
        // Resta locale a questo dispositivo: nulla raggiunge il DB prima di
        // "Continua".
        persistDraft: true,
        onNotify: showToast,
        onSuccess: onCreated
    });

    useEffect(() => {
        onSavingChange(isCreating);
    }, [isCreating, onSavingChange]);

    useEffect(() => {
        onDirtyChange?.(isDirty);
    }, [isDirty, onDirtyChange]);

    // Il cleanup dell'effect qui sopra girerebbe a ogni cambio di `isDirty`,
    // azzerando lo stato del wizard fra un render e l'altro: l'unmount vive in
    // un effect a dipendenze vuote, letto via ref per non catturare una
    // callback stale.
    const onDirtyChangeRef = useRef(onDirtyChange);
    onDirtyChangeRef.current = onDirtyChange;

    useEffect(() => {
        // Smontato lo step, non c'è più un form sporco da confermare: senza
        // questa notifica il wizard resterebbe fermo sull'ultimo valore.
        return () => onDirtyChangeRef.current?.(false);
    }, []);

    return (
        <div className={styles.step}>
            <BusinessCreateCard
                formId={formId}
                mode="create"
                values={values}
                errors={errors}
                onFieldChange={handleFieldChange}
                onCoverChange={handleCoverChange}
                slugState={slugState}
                onPickSlugSuggestion={handlePickSlugSuggestion}
                onSubmit={handleSubmit}
                namePlaceholder={
                    selectedTenant?.name
                        ? `Es. ${selectedTenant.name} - Via Certosa`
                        : undefined
                }
            />
        </div>
    );
}
