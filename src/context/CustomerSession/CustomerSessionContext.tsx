import { createContext, useContext, useState, useCallback, useEffect, useMemo, type ReactNode } from "react";
import {
    loadCustomerSession,
    clearCustomerSession,
    updateCustomerSessionName,
    type CustomerSessionBlob,
} from "@/services/customer/customerSessionStorage";

interface CustomerSessionContextValue {
    session: CustomerSessionBlob | null;
    isActive: boolean;
    clear: () => void;
    refresh: () => void;
    setCustomerName: (name: string | null) => void;
}

const CustomerSessionContext = createContext<CustomerSessionContextValue | null>(null);

interface ProviderProps {
    activityId: string | null;
    children: ReactNode;
}

/**
 * Provider customer session per /:slug.
 *
 * Va montato SOLO sui rami customer-facing dove activityId è noto (es. dentro
 * PublicCollectionPage dopo che il catalogo è stato risolto). Quando
 * activityId === null, expone session=null / isActive=false (no-op).
 */
export function CustomerSessionProvider({ activityId, children }: ProviderProps) {
    // Hydration-safe: default null in render (= server, che non ha sessionStorage).
    // La lettura sessionStorage (loadCustomerSession) è spostata nell'effect
    // post-mount sotto (client-only) → primo render client === server, niente
    // mismatch #418 sul div.headerActions gated da isActive/orderingActive.
    const [session, setSession] = useState<CustomerSessionBlob | null>(null);

    useEffect(() => {
        // Load post-mount (+ re-run sul cambio sede): popola la sessione dopo
        // l'hydration. Nessun guard anti-clobber: qui non c'è effect di persist
        // (il save avviene solo via callback clear/setCustomerName, non in effect).
        if (!activityId) {
            setSession(null);
            return;
        }
        setSession(loadCustomerSession(activityId));
    }, [activityId]);

    const clear = useCallback(() => {
        if (!activityId) return;
        clearCustomerSession(activityId);
        setSession(null);
    }, [activityId]);

    const refresh = useCallback(() => {
        if (!activityId) return;
        setSession(loadCustomerSession(activityId));
    }, [activityId]);

    const setCustomerName = useCallback(
        (name: string | null) => {
            if (!activityId) return;
            updateCustomerSessionName(activityId, name);
            refresh();
        },
        [activityId, refresh]
    );

    const value = useMemo<CustomerSessionContextValue>(
        () => ({
            session,
            isActive: session !== null,
            clear,
            refresh,
            setCustomerName,
        }),
        [session, clear, refresh, setCustomerName]
    );

    return (
        <CustomerSessionContext.Provider value={value}>
            {children}
        </CustomerSessionContext.Provider>
    );
}

export function useCustomerSession(): CustomerSessionContextValue {
    const ctx = useContext(CustomerSessionContext);
    if (!ctx) {
        throw new Error("useCustomerSession must be used within CustomerSessionProvider");
    }
    return ctx;
}

export function useOptionalCustomerSession(): CustomerSessionContextValue | null {
    return useContext(CustomerSessionContext);
}
