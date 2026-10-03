import { useCallback } from "react";
import { useTenant } from "@/context/useTenant";
import { useToast } from "@/context/Toast/ToastContext";
import { usePermissions } from "@/context/usePermissions";
import { canDoOnTenant } from "@/lib/permissions";
import { useSubscriptionGuard } from "@/hooks/useSubscriptionGuard";
import { workspaceRoleIsAdmin as isAdmin, workspaceRoleIsOwner as isOwner } from "@/utils/workspaceRole";

export interface AddActivityGate {
    /** Chi può creare sedi (`activities.create`): vede «Aggiungi sede». */
    canCreate: boolean;
    /** L'abbonamento permette di scrivere. */
    canEdit: boolean;
    /**
     * Il gesto «Aggiungi sede»: `true` se il flusso si può aprire, altrimenti
     * avvisa (abbonamento non attivo, frase per ruolo) e ritorna `false`.
     */
    tryOpen: () => boolean;
}

/**
 * Il cancello del flusso «Aggiungi sede», uguale da Sedi e dal selettore di
 * sede nell'header (§51.7): stesso permesso, stesso avviso sull'abbonamento.
 */
export function useAddActivityGate(): AddActivityGate {
    const { userRole } = useTenant();
    const { showToast } = useToast();
    const { canEdit } = useSubscriptionGuard();
    const { permissions } = usePermissions();
    const canCreate = permissions ? canDoOnTenant(permissions, "activities.create") : false;

    const tryOpen = useCallback(() => {
        if (canEdit) return true;
        const message = isOwner(userRole)
            ? "L'abbonamento non è attivo. Vai alla pagina abbonamento per riattivarlo."
            : isAdmin(userRole)
              ? "L'abbonamento non è attivo. Solo il proprietario può riattivarlo."
              : "L'abbonamento non è attivo. Contatta il proprietario.";
        showToast({ message, type: "error" });
        return false;
    }, [canEdit, userRole, showToast]);

    return { canCreate, canEdit, tryOpen };
}
