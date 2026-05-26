import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";
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
    const [session, setSession] = useState<CustomerSessionBlob | null>(() => {
        return activityId ? loadCustomerSession(activityId) : null;
    });

    useEffect(() => {
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

    const value: CustomerSessionContextValue = {
        session,
        isActive: session !== null,
        clear,
        refresh,
        setCustomerName,
    };

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
