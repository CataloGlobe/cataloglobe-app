import { Navigate, useLocation } from "react-router-dom";
import { useEffect, useState, type ReactNode } from "react";
import { useAuth } from "@context/useAuth";
import { isPlatformAdmin } from "@services/supabase/platformAdmin";
import { AppLoader } from "../ui/AppLoader/AppLoader";

/**
 * Gate per le rotte amministrative interne (es. /admin/status-incidents).
 *
 * Verifica:
 *   - sessione autenticata
 *   - appartenenza a `platform_admins`, via RPC `is_platform_admin()`
 *
 * Sicurezza: questo gate è cosmetico — la vera autorizzazione vive nell'API
 * `/api/admin/*`, che ri-verifica il JWT server-side e ricontrolla
 * l'appartenenza a `platform_admins` con il client `service_role`. Anche se
 * l'utente forzasse il bundle JS, le mutazioni fallirebbero con 403.
 */

interface AdminRouteProps {
    children: ReactNode;
}

/** `null` = verifica ancora in corso (stato iniziale, NON "non admin"). */
type AdminCheck = boolean | null;

export function AdminRoute({ children }: AdminRouteProps) {
    const { user, loading } = useAuth();
    const location = useLocation();
    const [isAdmin, setIsAdmin] = useState<AdminCheck>(null);

    const userId = user?.id ?? null;

    useEffect(() => {
        if (!userId) {
            setIsAdmin(null);
            return;
        }
        let cancelled = false;
        setIsAdmin(null);
        void isPlatformAdmin().then((result) => {
            if (cancelled) return;
            setIsAdmin(result);
        });
        return () => {
            cancelled = true;
        };
    }, [userId]);

    if (loading) {
        return <AppLoader intent="auth" />;
    }

    if (!user) {
        return (
            <Navigate to="/login" replace state={{ from: location, reason: "login-required" }} />
        );
    }

    // Verifica asincrona in corso: attendere. Redirect a "/" prima della
    // risposta produrrebbe un flash di uscita anche per un admin legittimo.
    if (isAdmin === null) {
        return <AppLoader intent="auth" />;
    }

    if (!isAdmin) {
        return <Navigate to="/" replace />;
    }

    return <>{children}</>;
}
