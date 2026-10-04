import { usePermissions } from "@/context/usePermissions";
import { canDoOnTenant } from "@/lib/permissions";
import { useEnsureActive } from "@/hooks/useEnsureActive";

export interface AddActivityGate {
    /** Chi può creare sedi (`activities.create`): vede «Aggiungi sede». */
    canCreate: boolean;
    /** L'abbonamento permette di scrivere. */
    canEdit: boolean;
    /**
     * Il gesto «Aggiungi sede»: `true` se il flusso si può aprire, altrimenti
     * avvisa (abbonamento non attivo, `useEnsureActive`) e ritorna `false`.
     */
    tryOpen: () => boolean;
}

/**
 * Il cancello del flusso «Aggiungi sede», uguale da Sedi e dal selettore di
 * sede nell'header (§51.7): stesso permesso, lo stesso guard dell'abbonamento
 * di tutta l'app.
 */
export function useAddActivityGate(): AddActivityGate {
    const { canEdit, ensureActive } = useEnsureActive();
    const { permissions } = usePermissions();
    const canCreate = permissions ? canDoOnTenant(permissions, "activities.create") : false;
    return { canCreate, canEdit, tryOpen: ensureActive };
}
