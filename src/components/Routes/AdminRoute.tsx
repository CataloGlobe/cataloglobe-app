import { Navigate, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuth } from "@context/useAuth";
import { AppLoader } from "../ui/AppLoader/AppLoader";

/**
 * Gate per le rotte amministrative interne (es. /admin/status-incidents).
 *
 * Verifica:
 *   - sessione autenticata
 *   - email utente matches VITE_ADMIN_EMAIL (case-insensitive)
 *
 * TODO (multi-admin futuro): sostituire la verifica email-based con un campo
 * `is_admin` su user_profiles. Stessa logica in `api/admin/status-incidents.ts`
 * (parità frontend/backend), che oggi confronta `ADMIN_EMAIL` server-side.
 * Vedi commento nel file admin endpoint.
 *
 * Sicurezza: questo gate è cosmetico — la vera autorizzazione vive nell'API
 * `/api/admin/*` che ri-verifica il JWT email server-side. Anche se l'utente
 * forzasse il bundle JS, le mutazioni fallirebbero con 403.
 */

interface AdminRouteProps {
    children: ReactNode;
}

export function AdminRoute({ children }: AdminRouteProps) {
    const { user, loading } = useAuth();
    const location = useLocation();

    if (loading) {
        return <AppLoader intent="auth" />;
    }

    if (!user) {
        return (
            <Navigate to="/login" replace state={{ from: location, reason: "login-required" }} />
        );
    }

    const adminEmail = import.meta.env.VITE_ADMIN_EMAIL;
    if (!adminEmail) {
        // Misconfig: VITE_ADMIN_EMAIL non settata in build. Niente accesso.
        return <Navigate to="/" replace />;
    }

    const userEmail = (user.email ?? "").toLowerCase();
    if (userEmail !== String(adminEmail).toLowerCase()) {
        return <Navigate to="/" replace />;
    }

    return <>{children}</>;
}
