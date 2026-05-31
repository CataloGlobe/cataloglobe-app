import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useTenant } from "@/context/useTenant";
import { useToast } from "@/context/Toast/ToastContext";
import { fetchMyPermissions } from "@/services/supabase/permissions";
import type { UserPermissions } from "@/lib/permissions";

interface PermissionsContextValue {
    permissions: UserPermissions | null;
    loading: boolean;
    refresh: () => Promise<void>;
}

const PermissionsContext = createContext<PermissionsContextValue>({
    permissions: null,
    loading: true,
    refresh: async () => {}
});

/**
 * Provider del set permessi del caller per il tenant attualmente selezionato.
 *
 * Caricamento:
 *  - On mount + on `selectedTenantId` change: fetch via RPC `get_my_permissions`
 *  - Su error: toast + permissions=null
 *  - Strategia (a) refresh manuale: la funzione `refresh()` ritorna una Promise
 *    da chiamare dopo mutazioni che cambiano il ruolo del caller (raro, ma es.
 *    se admin si auto-degrada o se viene promosso).
 *
 * Non auto-refresh su window focus né realtime.
 *
 * Va wrappato DOPO TenantProvider in App.tsx, dentro le route business.
 */
export function PermissionsProvider({ children }: { children: ReactNode }) {
    const { selectedTenantId } = useTenant();
    const { showToast } = useToast();

    const [permissions, setPermissions] = useState<UserPermissions | null>(null);
    const [loading, setLoading] = useState(true);

    const fetchIdRef = useRef(0);

    const load = useCallback(async (tenantId: string | null) => {
        if (!tenantId) {
            setPermissions(null);
            setLoading(false);
            return;
        }

        const fetchId = ++fetchIdRef.current;
        setLoading(true);

        try {
            const perms = await fetchMyPermissions(tenantId);
            if (fetchId !== fetchIdRef.current) return;
            setPermissions(perms);
            setLoading(false);
        } catch (err) {
            if (fetchId !== fetchIdRef.current) return;
            console.error("[PermissionsProvider] fetch failed:", err);
            showToast({ type: "error", message: "Impossibile caricare i permessi" });
            setPermissions(null);
            setLoading(false);
        }
    }, [showToast]);

    useEffect(() => {
        load(selectedTenantId);
    }, [selectedTenantId, load]);

    const refresh = useCallback(async () => {
        await load(selectedTenantId);
    }, [load, selectedTenantId]);

    return (
        <PermissionsContext.Provider value={{ permissions, loading, refresh }}>
            {children}
        </PermissionsContext.Provider>
    );
}

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
