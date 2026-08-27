import { useEffect } from "react";
import Text from "@/components/ui/Text/Text";
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
    /** Creazione riuscita: il wizard registra la sede e avanza al passo successivo. */
    onCreated: (activity: V2Activity) => void;
};

export function SetupActivityStep({
    formId,
    tenantId,
    onSavingChange,
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
        onNotify: showToast,
        onSuccess: onCreated
    });

    useEffect(() => {
        onSavingChange(isCreating);
    }, [isCreating, onSavingChange]);

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

            <Text variant="caption" colorVariant="muted" className={styles.note}>
                Se gestisci più locali, inizia da uno: gli altri li aggiungi dopo in pochi
                clic, riusando lo stesso menù o creandone di diversi.
            </Text>
        </div>
    );
}
