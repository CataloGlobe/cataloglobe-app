import { useEffect, useState, type ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "@/services/supabase/client";

type RecoveryRouteProps = { children: ReactNode };

export const RecoveryRoute = ({ children }: RecoveryRouteProps) => {
    const [checking, setChecking] = useState(true);
    const [allowed, setAllowed] = useState(false);

    useEffect(() => {
        let cancelled = false;

        async function run() {
            // 1) prima prova: flag già settato + session già pronta
            const isRecovery = sessionStorage.getItem("passwordRecoveryFlow") === "true";
            const { data } = await supabase.auth.getSession();
            if (cancelled) return;

            if (isRecovery && data.session) {
                setAllowed(true);
                setChecking(false);
                return;
            }

            // 2) seconda prova: ascolta l'evento PASSWORD_RECOVERY (race condition)
            const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
                if (cancelled) return;

                if (event === "PASSWORD_RECOVERY" && session) {
                    sessionStorage.setItem("passwordRecoveryFlow", "true");
                    setAllowed(true);
                    setChecking(false);
                }
            });

            // 3) fallback: se dopo un attimo non arriva nulla, chiudi e nega
            window.setTimeout(async () => {
                if (cancelled) return;

                const isRecoveryNow = sessionStorage.getItem("passwordRecoveryFlow") === "true";
                const { data: s2 } = await supabase.auth.getSession();

                sub.subscription.unsubscribe();

                if (isRecoveryNow && s2.session) {
                    setAllowed(true);
                }
                setChecking(false);
            }, 400);
        }

        run();

        return () => {
            cancelled = true;
        };
    }, []);

    if (checking) return null;
    if (!allowed) return <Navigate to="/forgot-password" replace />;
    return <>{children}</>;
};
