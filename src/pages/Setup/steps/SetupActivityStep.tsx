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
     * Notifica al wizard se una copertina è stata selezionata. I campi
     * testuali sopravvivono all'uscita in una bozza locale; la copertina è un
     * `File` e non può seguirli, quindi è l'unico contenuto la cui perdita
     * merita una conferma.
     */
    onCoverSelectedChange?: (selected: boolean) => void;
    /** Creazione riuscita: il wizard registra la sede e avanza al passo successivo. */
    onCreated: (activity: V2Activity) => void;
};

export function SetupActivityStep({
    formId,
    tenantId,
    onSavingChange,
    onCoverSelectedChange,
    onCreated
}: SetupActivityStepProps) {
    const { showToast } = useToast();
    const { selectedTenant } = useTenant();

    const {
        values,
        errors,
        isCreating,
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

    // `coverPreview` è il blob URL creato alla selezione: la sua presenza dice
    // esattamente "c'è una copertina scelta e non ancora caricata".
    const hasCover = values.coverPreview !== null;

    useEffect(() => {
        onCoverSelectedChange?.(hasCover);
    }, [hasCover, onCoverSelectedChange]);

    // Il cleanup dell'effect qui sopra girerebbe a ogni cambio di `hasCover`,
    // azzerando lo stato del wizard fra un render e l'altro: l'unmount vive in
    // un effect a dipendenze vuote, letto via ref per non catturare una
    // callback stale.
    const onCoverSelectedChangeRef = useRef(onCoverSelectedChange);
    onCoverSelectedChangeRef.current = onCoverSelectedChange;

    useEffect(() => {
        // Smontato lo step, non c'è più una copertina da confermare: senza
        // questa notifica il wizard resterebbe fermo sull'ultimo valore.
        return () => onCoverSelectedChangeRef.current?.(false);
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
