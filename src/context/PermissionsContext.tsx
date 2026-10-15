import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useTenant } from "@/context/useTenant";
import { useToast } from "@/context/Toast/ToastContext";
import { fetchMyPermissions } from "@/services/supabase/permissions";
import type { UserPermissions } from "@/lib/permissions";
import { PermissionsContext } from "@/context/permissionsContextBase";

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
    const { selectedTenantId, loading: tenantsLoading } = useTenant();
    const { showToast } = useToast();

    const [permissions, setPermissions] = useState<UserPermissions | null>(null);
    const [loading, setLoading] = useState(true);
    // L'azienda a cui appartiene l'ultimo esito (permessi o errore): finché
    // non è quella scelta, i permessi esposti sono di un'altra o di nessuna.
    const [loadedTenantId, setLoadedTenantId] = useState<string | null | undefined>(undefined);

    const fetchIdRef = useRef(0);

    const load = useCallback(async (tenantId: string | null) => {
        if (!tenantId) {
            setPermissions(null);
            setLoadedTenantId(null);
            setLoading(false);
            return;
        }

        const fetchId = ++fetchIdRef.current;
        setLoading(true);

        try {
            const perms = await fetchMyPermissions(tenantId);
            if (fetchId !== fetchIdRef.current) return;
            setPermissions(perms);
            setLoadedTenantId(tenantId);
            setLoading(false);
        } catch (err) {
            if (fetchId !== fetchIdRef.current) return;
            console.error("[PermissionsProvider] fetch failed:", err);
            showToast({ type: "error", message: "Impossibile caricare i permessi" });
            setPermissions(null);
            setLoadedTenantId(tenantId);
            setLoading(false);
        }
    }, [showToast]);

    useEffect(() => {
        load(selectedTenantId);
    }, [selectedTenantId, load]);

    const refresh = useCallback(async () => {
        await load(selectedTenantId);
    }, [load, selectedTenantId]);

    // Ancora in caricamento anche mentre le aziende arrivano (l'azienda
    // dell'indirizzo non è ancora scelta) e nel render in cui l'azienda è
    // appena scelta ma la sua lettura non è partita: altrimenti chi aspetta i
    // permessi vede «permessi null, non in caricamento» (= errore), rende la
    // pagina e poi la smonta per il loader, perdendone lo stato.
    const pending = (selectedTenantId == null && tenantsLoading) || loadedTenantId !== selectedTenantId;

    return (
        <PermissionsContext.Provider value={{ permissions, loading: loading || pending, refresh }}>
            {children}
        </PermissionsContext.Provider>
    );
}
