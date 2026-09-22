import { useCallback, useEffect, useState } from "react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog/ConfirmDialog";
import Text from "@/components/ui/Text/Text";
import { ActivityDeleteImpactBanners } from "@/components/Businesses/ActivityDeleteImpactBanners/ActivityDeleteImpactBanners";
import {
    countActivityDeleteImpact,
    deleteActivityAtomic,
    DeleteActivityError,
    type ActivityDeleteImpact,
    type DeleteActivityResult
} from "@/services/supabase/activities";
import { useToast } from "@/context/Toast/ToastContext";

export interface DeleteActivityDialogProps {
    isOpen: boolean;
    /** La sede da eliminare; `null` a dialogo chiuso. */
    activity: { id: string; name: string } | null;
    businessId: string;
    tenantId: string;
    onClose: () => void;
    /**
     * Dopo l'eliminazione riuscita, col risultato della Edge Function: chi
     * chiama ricarica l'elenco o torna alle sedi. Il toast di esito è del
     * dialogo; un promemoria in più (le sedi pagate) resta del chiamante.
     */
    onDeleted: (result: DeleteActivityResult) => void | Promise<void>;
}

/**
 * L'unico dialogo di eliminazione di una sede, usato dall'elenco Sedi e dalla
 * pagina Pubblicazione della scheda (registro Sedi, chiusura 6): stessa copy,
 * stesso impatto sulle regole di Programmazione, stesso nome da riscrivere.
 * Il gate `activities.delete` è del chiamante, che non mostra il bottone.
 */
export function DeleteActivityDialog({
    isOpen,
    activity,
    businessId,
    tenantId,
    onClose,
    onDeleted
}: DeleteActivityDialogProps) {
    const { showToast } = useToast();
    const [impact, setImpact] = useState<ActivityDeleteImpact | null>(null);
    const [isLoadingImpact, setIsLoadingImpact] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);

    // L'impatto si calcola a ogni apertura: le regole cambiano fra un
    // tentativo e l'altro.
    useEffect(() => {
        if (!isOpen || !activity) {
            setImpact(null);
            setIsLoadingImpact(false);
            return;
        }
        let cancelled = false;
        setIsLoadingImpact(true);
        countActivityDeleteImpact(tenantId, activity.id)
            .then(result => {
                if (!cancelled) setImpact(result);
            })
            .catch(error => {
                console.error("Errore nel calcolo dell'impatto eliminazione:", error);
                if (!cancelled) setImpact(null);
            })
            .finally(() => {
                if (!cancelled) setIsLoadingImpact(false);
            });
        return () => {
            cancelled = true;
        };
    }, [isOpen, activity, tenantId]);

    const handleConfirm = useCallback(async (): Promise<boolean> => {
        if (!activity) return false;
        setIsDeleting(true);
        try {
            const result = await deleteActivityAtomic(activity.id);
            const disabled = result.affected_schedules_disabled ?? 0;
            const message =
                disabled === 1
                    ? "Sede eliminata. 1 regola di Programmazione è passata in bozza perché non raggiunge più nessuna sede."
                    : disabled > 1
                        ? `Sede eliminata. ${disabled} regole di Programmazione sono passate in bozza perché non raggiungono più nessuna sede.`
                        : "Sede eliminata.";
            showToast({ message, type: "success", duration: disabled > 0 ? 4000 : 2500 });
            await onDeleted(result);
            return true;
        } catch (e) {
            console.error("Errore durante l'eliminazione della sede:", e);
            let message = "Impossibile eliminare la sede. Riprova.";
            if (e instanceof DeleteActivityError) {
                if (e.code === "FK_VIOLATION") {
                    message =
                        "Impossibile eliminare la sede: ci sono dati collegati che lo impediscono. Scrivi all'assistenza.";
                } else if (e.code === "INSUFFICIENT_PERMISSION") {
                    message = "Non hai i permessi per eliminare questa sede.";
                } else if (e.code === "AUTH_EXPIRED") {
                    message = "Sessione scaduta. Accedi di nuovo.";
                }
            }
            showToast({ message, type: "error", duration: 3500 });
            return false;
        } finally {
            setIsDeleting(false);
        }
    }, [activity, onDeleted, showToast]);

    return (
        <ConfirmDialog
            isOpen={isOpen && activity !== null}
            onClose={onClose}
            onConfirm={handleConfirm}
            title={`Elimina «${activity?.name ?? ""}»`}
            message="Non si può annullare. Insieme alla sede vengono eliminati i suoi tavoli, i QR dei tavoli, le prenotazioni, le stampanti collegate e lo storico degli ordini. L'indirizzo web si libera e i link in giro smettono di funzionare."
            confirmText={activity?.name}
            confirmFieldLabel="Scrivi il nome della sede per confermare"
            confirmLabel={isDeleting ? "Eliminazione in corso…" : "Elimina"}
            confirmVariant="danger"
            isLoading={isDeleting}
        >
            <Text variant="body-sm" colorVariant="muted">
                Il piano non cambia: le sedi pagate restano quelle di adesso.
            </Text>
            {isLoadingImpact && (
                <Text variant="body-sm" colorVariant="muted">
                    Controllo quali regole di Programmazione la usano…
                </Text>
            )}
            {!isLoadingImpact && impact && (
                <ActivityDeleteImpactBanners impact={impact} businessId={businessId} onNavigate={onClose} />
            )}
        </ConfirmDialog>
    );
}
