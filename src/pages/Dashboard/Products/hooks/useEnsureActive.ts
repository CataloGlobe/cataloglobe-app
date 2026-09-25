import { useCallback } from "react";
import { useToast } from "@/context/Toast/ToastContext";
import { useSubscriptionGuard } from "@/hooks/useSubscriptionGuard";

/**
 * Un solo guard dell'abbonamento per le collezioni di Prodotti (lotto
 * Prodotti P2): `ensureActive()` dice perché un gesto non parte e ritorna
 * `false`. Prima la stessa stringa era copiata dieci volte.
 */
export function useEnsureActive() {
    const { canEdit } = useSubscriptionGuard();
    const { showToast } = useToast();

    const ensureActive = useCallback((): boolean => {
        if (canEdit) return true;
        showToast({ message: "Abbonamento non attivo. Vai alla pagina abbonamento per riattivarlo.", type: "error" });
        return false;
    }, [canEdit, showToast]);

    return { canEdit, ensureActive };
}
