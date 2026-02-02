import { useEffect, useState, type ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "@/services/supabase/client";

type RecoveryRouteProps = {
    children: ReactNode;
};

/**
 * RecoveryRoute
 *
 * Consente l’accesso SOLO se:
 * - Supabase ha creato una sessione valida
 * - ed è stato attivato un password recovery flow
 *
 * NON si basa sui parametri URL perché Supabase li consuma
 * prima del redirect (comportamento standard).
 */
export const RecoveryRoute = ({ children }: RecoveryRouteProps) => {
    const [checking, setChecking] = useState(true);
    const [allowed, setAllowed] = useState(false);

    useEffect(() => {
        let cancelled = false;

        async function checkRecoveryAccess() {
            // Flag impostato dal listener PASSWORD_RECOVERY
            const isRecovery = sessionStorage.getItem("passwordRecoveryFlow") === "true";

            // Sessione creata/aggiornata da Supabase dopo il click sul link
            const { data } = await supabase.auth.getSession();

            if (cancelled) return;

            if (isRecovery && data.session) {
                setAllowed(true);
            }

            setChecking(false);
        }

        checkRecoveryAccess();

        return () => {
            cancelled = true;
        };
    }, []);

    // Stato di attesa: evita redirect prematuri
    if (checking) {
        return null;
    }

    // Accesso NON consentito → forgot password
    if (!allowed) {
        return <Navigate to="/forgot-password" replace />;
    }

    // Accesso consentito
    return <>{children}</>;
};
