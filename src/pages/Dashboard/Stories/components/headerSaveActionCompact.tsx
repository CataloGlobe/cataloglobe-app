import { Check } from "lucide-react";
import type { PageHeaderCompactConfig } from "@/context/PageHeaderContext";

/**
 * Traduce lo stato salva/annulla nei campi della toolbar compatta, uguale per
 * tutte le pagine che usano `HeaderSaveAction`:
 *
 * - pulito → nessun bottone, solo l'indicazione "Salvato";
 * - sporco → "Salva" è la primaria (azione critica, mai nascosta), "Annulla"
 *   scende nel kebab e passa comunque dalla conferma.
 *
 * `onRequestDiscard` apre il dialog: la voce di menu non scarta da sé, esattamente
 * come il bottone "Annulla" della toolbar comoda non scarta da sé.
 *
 * Vive in un file suo e non accanto a `HeaderSaveAction` perché non è un
 * componente: mescolarlo lì romperebbe il fast refresh del componente.
 */
export function buildSaveActionCompactConfig({
    isDirty,
    isSaving,
    onSave,
    onRequestDiscard
}: {
    isDirty: boolean;
    isSaving: boolean;
    onSave: () => void;
    onRequestDiscard?: () => void;
}): Pick<PageHeaderCompactConfig, "primaryAction" | "secondaryActions" | "statusIndicator" | "loading"> {
    if (!isDirty && !isSaving) {
        return {
            statusIndicator: {
                icon: <Check size={15} strokeWidth={2.5} aria-hidden="true" />,
                label: "Salvato"
            }
        };
    }

    return {
        primaryAction: { label: "Salva", onClick: onSave },
        secondaryActions: onRequestDiscard
            ? [{ label: "Annulla", onClick: onRequestDiscard, disabled: isSaving }]
            : undefined,
        loading: isSaving
    };
}
