import { useContext } from "react";
import { PermissionsContext, type PermissionsContextValue } from "@/context/permissionsContextBase";

/**
 * Hook per accedere ai permessi correnti.
 *
 * Ritorna:
 *  - `permissions: UserPermissions | null` — null se caricamento OR errore
 *  - `loading: boolean` — true durante il fetch
 *  - `refresh()` — Promise da chiamare dopo mutazioni del ruolo
 *
 * Pattern d'uso:
 *   const { permissions, loading } = usePermissions();
 *   if (loading || !permissions) return <Spinner />;
 *   if (!canDoOnTenant(permissions, "team.invite")) return null;
 */
export function usePermissions(): PermissionsContextValue {
    return useContext(PermissionsContext);
}
